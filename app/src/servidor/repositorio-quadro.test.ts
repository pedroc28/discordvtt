import { describe, expect, it } from 'vitest'
import type { EventoQuadro, ImagemQuadro } from '../quadro/tipos'
import { QUADRO_FECHADO, QUADRO_INVALIDO } from './erros'
import type { Cancelar, EventoTempoReal, FiltroServidor } from './repositorio-mapa'
import { RepositorioQuadroPocketBase, type ClienteQuadro, type ColecaoQuadro, type Enderecos } from './repositorio-quadro'

// Servidor de mentira com o mesmo comportamento das regras e hooks do quadro
// (pocketbase/pb_hooks/quadro.js): grava autor e tamanho e avisa quem assina.

type Registro = Record<string, unknown>

const erroDoServidor = (status: number, message = '', data: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), { status, response: { message, data } })
const esperar = (ms = 0) => new Promise((resolver) => setTimeout(resolver, ms))
const CRIADO = '2026-11-24 04:00:00.000Z'

class ServidorFalso implements ClienteQuadro {
  readonly endereco = 'https://servidor.teste'
  registros: Record<ColecaoQuadro, Registro[]> = { quadro_imagens: [], quadro_itens: [] }
  pedidos: Array<{ metodo: string; colecao: ColecaoQuadro; dados?: unknown; id?: string }> = []
  downloads: string[] = []
  assinaturas: Array<{ colecao: ColecaoQuadro; filtro: FiltroServidor; ouvinte: (e: EventoTempoReal) => void; ativa: boolean }> = []
  reconexoes: Array<() => void> = []
  falha: unknown = null
  avisar = true
  private contador = 0

  async listar(colecao: ColecaoQuadro, filtro: FiltroServidor): Promise<unknown[]> {
    if (this.falha) throw this.falha
    return this.registros[colecao].filter((r) => r.campanha === filtro.valores.campanha)
  }

  async criar(colecao: ColecaoQuadro, dados: Record<string, unknown> | FormData): Promise<unknown> {
    if (this.falha) throw this.falha
    this.pedidos.push({ metodo: 'criar', colecao, dados })
    const campos: Registro = dados instanceof FormData ? Object.fromEntries([...dados.entries()].filter(([k]) => k !== 'arquivo')) : { ...dados }
    if (dados instanceof FormData) {
      const arquivo = dados.get('arquivo')
      campos.arquivo = 'carta_abc123.webp'
      campos.bytes = arquivo instanceof Blob ? arquivo.size : 0
      campos.largura = Number(campos.largura)
      campos.altura = Number(campos.altura)
    }
    return this.gravar(colecao, { ...campos, autor: 'eu' }, 'create')
  }

  async atualizar(colecao: ColecaoQuadro, id: string, dados: Record<string, unknown>): Promise<unknown> {
    if (this.falha) throw this.falha
    this.pedidos.push({ metodo: 'atualizar', colecao, id, dados })
    const registro = this.registros[colecao].find((r) => r.id === id)
    if (!registro) throw erroDoServidor(404)
    Object.assign(registro, dados)
    this.notificar(colecao, 'update', registro)
    return { ...registro }
  }

  async apagar(colecao: ColecaoQuadro, id: string): Promise<void> {
    if (this.falha) throw this.falha
    this.pedidos.push({ metodo: 'apagar', colecao, id })
    const registro = this.registros[colecao].find((r) => r.id === id)
    if (!registro) throw erroDoServidor(404)
    this.registros[colecao] = this.registros[colecao].filter((r) => r !== registro)
    this.notificar(colecao, 'delete', registro)
  }

  async baixarImagem(id: string, arquivo: string, miniatura: boolean): Promise<Blob> {
    if (this.falha) throw this.falha
    this.downloads.push(`${id}/${arquivo}${miniatura ? '?thumb' : ''}`)
    return new Blob(['imagem'], { type: 'image/webp' })
  }

  /** Grava como o servidor faria (também para simular o que outra pessoa faz) e avisa quem assina. */
  gravar(colecao: ColecaoQuadro, dados: Registro, acao: 'create' | 'update' = 'create'): Registro {
    const registro = { id: `r${++this.contador}`, created: CRIADO, ...dados }
    this.registros[colecao].push(registro)
    this.notificar(colecao, acao, registro)
    return { ...registro }
  }

  notificar(colecao: ColecaoQuadro, acao: string, registro: Registro) {
    if (!this.avisar) return
    for (const a of this.assinaturas) {
      if (a.ativa && a.colecao === colecao && a.filtro.valores.campanha === registro.campanha) a.ouvinte({ acao, registro: { ...registro } })
    }
  }

  async assinar(colecao: ColecaoQuadro, filtro: FiltroServidor, ouvinte: (e: EventoTempoReal) => void): Promise<Cancelar> {
    const assinatura = { colecao, filtro, ouvinte, ativa: true }
    this.assinaturas.push(assinatura)
    return async () => {
      assinatura.ativa = false
    }
  }

  async aoReconectar(ouvinte: () => void): Promise<Cancelar> {
    this.reconexoes.push(ouvinte)
    return async () => {
      this.reconexoes = this.reconexoes.filter((o) => o !== ouvinte)
    }
  }

  get ativas() {
    return this.assinaturas.filter((a) => a.ativa).map((a) => a.colecao)
  }
}

/** Endereços de mentira, para contar quantos foram criados e liberados. */
function enderecosFalsos() {
  const criados: string[] = []
  const liberados: string[] = []
  const enderecos: Enderecos = {
    criar: () => {
      const endereco = `blob:teste/${criados.length + 1}`
      criados.push(endereco)
      return endereco
    },
    liberar: (endereco) => liberados.push(endereco),
  }
  return { enderecos, criados, liberados }
}

function abrir(servidor: ServidorFalso, papel: 'mestre' | 'jogador' = 'jogador', enderecos = enderecosFalsos().enderecos) {
  const repositorio = new RepositorioQuadroPocketBase(servidor, 'campanha1', { papel, enderecos })
  const eventos: EventoQuadro[] = []
  repositorio.assinar((e) => eventos.push(e))
  return { repositorio, eventos }
}

const imagemNoServidor = (servidor: ServidorFalso, extra: Registro = {}) =>
  servidor.gravar('quadro_imagens', { campanha: 'campanha1', autor: 'ana', nome: 'Mapa velho', arquivo: 'mapa_x.png', largura: 800, altura: 600, bytes: 1000, ...extra })

describe('RepositorioQuadroPocketBase', () => {
  it('carrega a biblioteca e os itens da campanha, descartando o que não entende', async () => {
    const servidor = new ServidorFalso()
    const imagem = imagemNoServidor(servidor)
    servidor.gravar('quadro_itens', { campanha: 'campanha1', autor: 'ana', tipo: 'imagem', imagem: imagem.id, x: 100, y: 100, largura: 200, rotacao: 2, z: 1 })
    servidor.gravar('quadro_itens', { campanha: 'campanha1', autor: 'bia', tipo: 'nota', texto: 'Pista', cor: 'rosa', x: 300, y: 200, largura: 180, rotacao: 0, z: 2 })
    servidor.gravar('quadro_itens', { campanha: 'campanha1', tipo: 'nota', texto: 'fora', x: 9000, y: 1, largura: 180 })
    servidor.gravar('quadro_itens', { campanha: 'outra', tipo: 'nota', texto: 'de outra mesa', x: 1, y: 1, largura: 180 })
    const { repositorio } = abrir(servidor)
    const { imagens, itens } = await repositorio.carregar()
    expect(imagens.map((i) => i.nome)).toEqual(['Mapa velho'])
    expect(imagens[0]?.enviada).toBe(Date.parse('2026-11-24T04:00:00.000Z'))
    expect(itens.map((i) => i.tipo)).toEqual(['imagem', 'nota'])
    expect(itens[1]).toMatchObject({ tipo: 'nota', texto: 'Pista', cor: 'rosa', autorId: 'bia' })
  })

  it('envia a imagem num formulário, com nome e dimensões, e avisa na hora', async () => {
    const servidor = new ServidorFalso()
    const { repositorio, eventos } = abrir(servidor)
    servidor.avisar = false
    const arquivo = new Blob(['0123456789'], { type: 'image/webp' })
    const imagem = await repositorio.enviarImagem(arquivo, { nome: '  Carta do duque ', nomeArquivo: 'carta.webp', largura: 1200, altura: 900 })
    const pedido = servidor.pedidos[0]
    expect(pedido?.colecao).toBe('quadro_imagens')
    expect(pedido?.dados).toBeInstanceOf(FormData)
    const formulario = pedido?.dados as FormData
    expect(formulario.get('campanha')).toBe('campanha1')
    expect(formulario.get('nome')).toBe('Carta do duque')
    expect(formulario.get('largura')).toBe('1200')
    expect(formulario.has('autor')).toBe(false)
    expect(formulario.has('bytes')).toBe(false)
    expect(imagem).toMatchObject({ nome: 'Carta do duque', largura: 1200, altura: 900, bytes: 10, autorId: 'eu' })
    expect(eventos).toEqual([{ tipo: 'imagem', imagem }])
  })

  it('baixa cada imagem uma vez por tamanho, e libera tudo ao fechar', async () => {
    const servidor = new ServidorFalso()
    const { enderecos, criados, liberados } = enderecosFalsos()
    const { repositorio } = abrir(servidor, 'jogador', enderecos)
    const { imagens } = await (imagemNoServidor(servidor), repositorio.carregar())
    const imagem = imagens[0] as ImagemQuadro
    const [a, b] = await Promise.all([repositorio.urlDaImagem(imagem, 'miniatura'), repositorio.urlDaImagem(imagem, 'miniatura')])
    const inteira = await repositorio.urlDaImagem(imagem, 'inteira')
    expect(a).toBe(b)
    expect(inteira).not.toBe(a)
    expect(servidor.downloads).toEqual([`${imagem.id}/mapa_x.png?thumb`, `${imagem.id}/mapa_x.png`])
    await repositorio.fechar()
    await esperar()
    expect(liberados.sort()).toEqual([...criados].sort())
  })

  it('download que falha não fica guardado: a próxima tentativa baixa de novo', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    const imagem = (await (imagemNoServidor(servidor), repositorio.carregar())).imagens[0] as ImagemQuadro
    servidor.falha = erroDoServidor(0)
    await expect(repositorio.urlDaImagem(imagem, 'inteira')).rejects.toThrow('não respondeu')
    servidor.falha = null
    await expect(repositorio.urlDaImagem(imagem, 'inteira')).resolves.toMatch(/^blob:/)
  })

  it('imagem apagada, por aqui ou por outra pessoa, libera o endereço e avisa', async () => {
    const servidor = new ServidorFalso()
    const { enderecos, liberados } = enderecosFalsos()
    const { repositorio, eventos } = abrir(servidor, 'mestre', enderecos)
    await esperar()
    const imagem = (await (imagemNoServidor(servidor), repositorio.carregar())).imagens[0] as ImagemQuadro
    const endereco = await repositorio.urlDaImagem(imagem, 'miniatura')
    await servidor.apagar('quadro_imagens', imagem.id)
    await esperar()
    expect(liberados).toEqual([endereco])
    expect(eventos.at(-1)).toEqual({ tipo: 'imagemApagada', id: imagem.id })
  })

  it('prende imagem e nota mandando só o que a regra aceita', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    await repositorio.criarItem({ tipo: 'imagem', imagemId: 'img1', x: 10, y: 20, largura: 240, rotacao: -2, z: 5 })
    await repositorio.criarItem({ tipo: 'nota', texto: 'Pista', cor: 'azul', x: 30, y: 40, largura: 180, rotacao: 1, z: 6 })
    expect(servidor.pedidos.map((p) => p.dados)).toEqual([
      { campanha: 'campanha1', tipo: 'imagem', imagem: 'img1', x: 10, y: 20, largura: 240, rotacao: -2, z: 5 },
      { campanha: 'campanha1', tipo: 'nota', texto: 'Pista', cor: 'azul', x: 30, y: 40, largura: 180, rotacao: 1, z: 6 },
    ])
  })

  it('mover manda só a posição, e editar só o texto e a cor', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    const nota = await repositorio.criarItem({ tipo: 'nota', texto: 'Pista', cor: 'amarelo', x: 30, y: 40, largura: 180, rotacao: 1, z: 6 })
    const movida = await repositorio.moverItem(nota.id, { x: 500, y: Number.NaN, z: 9 })
    expect(servidor.pedidos.at(-1)?.dados).toEqual({ x: 500, z: 9 })
    expect(movida).toMatchObject({ x: 500, y: 40, z: 9 })
    await repositorio.editarNota(nota.id, { texto: 'Pista nova' })
    expect(servidor.pedidos.at(-1)?.dados).toEqual({ texto: 'Pista nova' })
  })

  it('recebe as mudanças dos outros pelo tempo real, e ignora as de outra campanha', async () => {
    const servidor = new ServidorFalso()
    const { eventos } = abrir(servidor)
    await esperar()
    expect(servidor.ativas).toEqual(['quadro_imagens', 'quadro_itens'])
    const nota = servidor.gravar('quadro_itens', { campanha: 'campanha1', autor: 'ana', tipo: 'nota', texto: 'Oi', cor: 'verde', x: 1, y: 1, largura: 180 })
    servidor.gravar('quadro_itens', { campanha: 'outra', autor: 'ana', tipo: 'nota', texto: 'x', x: 1, y: 1, largura: 180 })
    await servidor.apagar('quadro_itens', String(nota.id))
    expect(eventos.map((e) => e.tipo)).toEqual(['item', 'itemApagado'])
  })

  it('quando a conexão volta, manda o quadro inteiro de novo', async () => {
    const servidor = new ServidorFalso()
    const { eventos } = abrir(servidor)
    await esperar()
    servidor.avisar = false
    imagemNoServidor(servidor)
    for (const ouvinte of servidor.reconexoes) ouvinte()
    await esperar()
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ tipo: 'tudo', itens: [] })
    expect(eventos[0]?.tipo === 'tudo' && eventos[0].imagens.length).toBe(1)
  })

  it('erros viram mensagens que dizem o que fazer', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    const arquivo = new Blob(['x'])
    const info = { nome: '', nomeArquivo: 'a.png', largura: 1, altura: 1 }
    servidor.falha = erroDoServidor(400, 'Imagem recusada: a campanha chegou ao limite de 50 MB de imagens.')
    await expect(repositorio.enviarImagem(arquivo, info)).rejects.toThrow('o servidor recusou: a campanha chegou ao limite')
    servidor.falha = erroDoServidor(400, 'Failed to create record.', { arquivo: { code: 'validation_invalid_mime_type' } })
    await expect(repositorio.enviarImagem(arquivo, info)).rejects.toThrow('não é uma imagem PNG, JPEG ou WebP')
    servidor.falha = erroDoServidor(400, 'Failed to update record.')
    await expect(repositorio.editarNota('n1', { texto: 'x' })).rejects.toThrow('só quem escreveu a nota edita')
    servidor.falha = erroDoServidor(404)
    await expect(repositorio.tirarItem('n1')).rejects.toThrow('só quem prendeu o item ou o mestre')
  })

  it('resposta que o app não entende não vira item', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    await expect(repositorio.criarItem({ tipo: 'nota', texto: '', cor: 'amarelo', x: 99999, y: 1, largura: 180, rotacao: 0, z: 0 })).rejects.toThrow(QUADRO_INVALIDO)
  })

  it('fechar cancela as assinaturas, e o que vier depois falha com uma mensagem clara', async () => {
    const servidor = new ServidorFalso()
    const { repositorio, eventos } = abrir(servidor, 'mestre')
    await esperar()
    await repositorio.fechar()
    expect(servidor.ativas).toEqual([])
    expect(servidor.reconexoes).toEqual([])
    expect(repositorio.fechado).toBe(true)
    await expect(repositorio.carregar()).rejects.toThrow(QUADRO_FECHADO)
    await expect(repositorio.moverItem('x', { x: 1 })).rejects.toThrow(QUADRO_FECHADO)
    servidor.gravar('quadro_itens', { campanha: 'campanha1', tipo: 'nota', texto: 'x', x: 1, y: 1, largura: 180 })
    expect(eventos).toEqual([])
  })
})
