import { describe, expect, it } from 'vitest'
import { mensagemDeErroBatalha } from './erros'
import { RepositorioBatalhaPocketBase, type ClienteBatalha, type ColecaoBatalha } from './repositorio-batalha'
import type { Cancelar, EventoTempoReal, FiltroServidor } from './repositorio-mapa'
import type { EventoTokenBatalha, ResumoCenaBatalha } from './tipos'
import { normalizarTokenBatalhaDoServidor, tokenBatalhaParaServidor } from './validacao'

type Registro = Record<string, unknown>
type Assinatura = { colecao: ColecaoBatalha; filtro: FiltroServidor; ouvinte: (e: EventoTempoReal) => void }

const copia = <T>(v: T): T => structuredClone(v)
const erroDoServidor = (status: number, message = '') => Object.assign(new Error(message), { status, response: { message } })
const esperar = () => new Promise((resolver) => setTimeout(resolver, 0))

/** Um PocketBase de mentira, só com o que o repositório da batalha usa. Não confere regras: isso é do servidor. */
class ServidorFalso implements ClienteBatalha {
  endereco = 'http://servidor'
  usuarioId = 'mestre1'
  campanha: Registro = { id: 'campanha1', nome: 'Mesa', cenaAtiva: '' }
  cenas = new Map<string, Registro>()
  tokens = new Map<string, Registro>()
  assinaturas = new Set<Assinatura>()
  reconexoes = new Set<() => void>()
  pedidos: Array<{ tipo: string; colecao: string; dados?: unknown }> = []
  arquivos = new Map<string, Blob>()
  falha: unknown = null
  segurar = false
  presos: Array<() => void> = []
  /** Pedidos de gravação que só respondem quando o teste manda. */
  segurarRespostas = false
  respostasPresas: Array<() => void> = []
  private relogio = 0
  private sequencia = 0

  hora() {
    this.relogio++
    return `2026-11-26 20:00:${String(this.relogio).padStart(2, '0')}.000Z`
  }

  novaCena(dados: Registro = {}): Registro {
    const id = `cena${++this.sequencia}`
    const cena = { id, campanha: 'campanha1', nome: 'Cena', config: null, fundo: '', updated: this.hora(), ...dados }
    this.cenas.set(id, cena)
    return copia(cena)
  }

  novoToken(cena: string, idLocal: string, dados: Registro = {}): Registro {
    const id = `tok${++this.sequencia}`
    const token = { id, cena, idLocal, nome: idLocal, x: 0, y: 0, tamanho: 1, cor: '#c2185b', dono: '', updated: this.hora(), ...dados }
    this.tokens.set(id, token)
    return copia(token)
  }

  private tabela(colecao: ColecaoBatalha) {
    if (colecao === 'cenas_batalha') return this.cenas
    if (colecao === 'tokens_batalha') return this.tokens
    return new Map([[String(this.campanha.id), this.campanha]])
  }

  private confere(registro: Registro, filtro: FiltroServidor) {
    return Object.entries(filtro.valores).every(([campo, valor]) => registro[campo] === valor)
  }

  emitir(colecao: ColecaoBatalha, acao: string, registro: Registro) {
    for (const a of this.assinaturas) {
      if (a.colecao !== colecao || !this.confere(registro, a.filtro)) continue
      const enviar = () => a.ouvinte({ acao, registro: copia(registro) })
      if (this.segurar) this.presos.push(enviar)
      else enviar()
    }
  }

  soltar() {
    this.segurar = false
    for (const enviar of this.presos.splice(0)) enviar()
  }

  reconectar() {
    for (const ouvinte of this.reconexoes) ouvinte()
  }

  private async responder<T>(valor: () => T): Promise<T> {
    if (this.falha) throw this.falha
    if (this.segurarRespostas) await new Promise<void>((resolver) => this.respostasPresas.push(resolver))
    return valor()
  }

  async listar(colecao: ColecaoBatalha, filtro: FiltroServidor) {
    this.pedidos.push({ tipo: 'listar', colecao })
    if (this.falha) throw this.falha
    return [...this.tabela(colecao).values()].filter((r) => this.confere(r, filtro)).map(copia)
  }

  async ler(colecao: ColecaoBatalha, id: string) {
    this.pedidos.push({ tipo: 'ler', colecao })
    if (this.falha) throw this.falha
    const registro = this.tabela(colecao).get(id)
    if (!registro) throw erroDoServidor(404)
    return copia(registro)
  }

  async criar(colecao: ColecaoBatalha, dados: Registro) {
    this.pedidos.push({ tipo: 'criar', colecao, dados: copia(dados) })
    return this.responder(() => {
      const registro = colecao === 'cenas_batalha' ? this.novaCena(dados) : this.novoToken(String(dados.cena), String(dados.idLocal), dados)
      this.emitir(colecao, 'create', registro)
      return registro
    })
  }

  async atualizar(colecao: ColecaoBatalha, id: string, dados: Registro | FormData) {
    const comoObjeto: Registro = dados instanceof FormData ? { fundo: dados.get('fundo') } : copia(dados)
    this.pedidos.push({ tipo: 'atualizar', colecao, dados: comoObjeto })
    return this.responder(() => {
      const registro = this.tabela(colecao).get(id)
      if (!registro) throw erroDoServidor(404)
      const fundo = comoObjeto.fundo
      if (fundo instanceof Blob) {
        comoObjeto.fundo = `fundo_${++this.sequencia}.png`
        this.arquivos.set(String(comoObjeto.fundo), fundo)
      } else if (fundo === null) {
        comoObjeto.fundo = ''
      }
      Object.assign(registro, comoObjeto, { updated: this.hora() })
      this.emitir(colecao, 'update', registro)
      return copia(registro)
    })
  }

  async apagar(colecao: ColecaoBatalha, id: string) {
    this.pedidos.push({ tipo: 'apagar', colecao })
    if (this.falha) throw this.falha
    const registro = this.tabela(colecao).get(id)
    if (!registro) throw erroDoServidor(404)
    this.tabela(colecao).delete(id)
    this.emitir(colecao, 'delete', registro)
  }

  async importar(formulario: FormData) {
    this.pedidos.push({ tipo: 'importar', colecao: 'cenas_batalha', dados: Object.fromEntries(formulario.entries()) })
    if (this.falha) throw this.falha
    return { ok: true }
  }

  async baixarFundo(_cenaId: string, arquivo: string) {
    this.pedidos.push({ tipo: 'baixar', colecao: 'cenas_batalha' })
    return this.arquivos.get(arquivo) ?? new Blob(['imagem'])
  }

  async assinar(colecao: ColecaoBatalha, filtro: FiltroServidor, ouvinte: (e: EventoTempoReal) => void): Promise<Cancelar> {
    const assinatura = { colecao, filtro, ouvinte }
    this.assinaturas.add(assinatura)
    return async () => {
      this.assinaturas.delete(assinatura)
    }
  }

  async aoReconectar(ouvinte: () => void): Promise<Cancelar> {
    this.reconexoes.add(ouvinte)
    return async () => {
      this.reconexoes.delete(ouvinte)
    }
  }
}

/** Endereços locais de mentira: blob:1, blob:2... e a lista dos liberados. */
function enderecosFalsos() {
  let n = 0
  const liberados: string[] = []
  return { liberados, criar: () => `blob:${++n}`, liberar: (e: string) => void liberados.push(e) }
}

function abrir(servidor: ServidorFalso, papel: 'mestre' | 'jogador' = 'mestre') {
  const enderecos = enderecosFalsos()
  return { repo: new RepositorioBatalhaPocketBase(servidor, 'campanha1', { papel, enderecos }), enderecos }
}

const token = (id: string, extra: Record<string, unknown> = {}) => ({ id, nome: id, x: 70, y: 35, tamanho: 1, cor: '#1565c0', ...extra })

describe('validação dos tokens da batalha', () => {
  it('o token do mapa vira o registro do servidor, com o id como idLocal', () => {
    expect(tokenBatalhaParaServidor(token('a'))).toEqual({ idLocal: 'a', nome: 'a', x: 70, y: 35, tamanho: 1, cor: '#1565c0' })
    expect(tokenBatalhaParaServidor(token('a', { dono: null }))?.dono).toBe('')
    expect(tokenBatalhaParaServidor(token('a', { dono: 'u1' }))?.dono).toBe('u1')
    expect(tokenBatalhaParaServidor(token('a', { cor: 'azul' }))).toBeNull()
    expect(tokenBatalhaParaServidor(token('a', { x: 2_000_000 }))).toBeNull()
    expect(tokenBatalhaParaServidor(token('', {}))).toBeNull()
  })

  it('o registro do servidor vira o token do mapa, com dono null quando não tem', () => {
    const registro = normalizarTokenBatalhaDoServidor({ id: 'r1', cena: 'c1', idLocal: 'a', nome: 'Orc', x: 0, y: -5, tamanho: 2, cor: '#455a64', dono: '', updated: 'h' })
    expect(registro).toEqual({ registroId: 'r1', cena: 'c1', atualizado: 'h', token: { id: 'a', nome: 'Orc', x: 0, y: -5, tamanho: 2, cor: '#455a64', dono: null } })
    expect(normalizarTokenBatalhaDoServidor({ id: 'r1', cena: 'c1' })).toBeNull()
  })

  it('a recusa do servidor vira o motivo', () => {
    expect(mensagemDeErroBatalha(erroDoServidor(400, 'Cena recusada: a campanha já tem 20 cenas, o máximo.'), 'x', 'criar')).toBe(
      'o servidor recusou: a campanha já tem 20 cenas, o máximo.',
    )
    expect(mensagemDeErroBatalha(erroDoServidor(404), 'x', 'mover')).toContain('você só move os tokens')
  })
})

describe('RepositorioBatalhaPocketBase', () => {
  it('lista as cenas com a ativa marcada', async () => {
    const servidor = new ServidorFalso()
    const a = servidor.novaCena({ nome: 'Taverna' })
    servidor.novaCena({ nome: 'Masmorra' })
    servidor.campanha.cenaAtiva = a.id
    const { repo } = abrir(servidor)
    expect(await repo.listarCenas()).toEqual([
      { id: a.id, nome: 'Taverna', ativa: true },
      { id: 'cena2', nome: 'Masmorra', ativa: false },
    ])
  })

  it('carrega a cena com a configuração, os tokens no formato do mapa e o fundo num endereço local', async () => {
    const servidor = new ServidorFalso()
    servidor.arquivos.set('mapa.png', new Blob(['png']))
    const cena = servidor.novaCena({ nome: 'Taverna', config: { grade: { tamanho: 50 } }, fundo: 'mapa.png' })
    servidor.novoToken(String(cena.id), 'orc', { x: 140, dono: 'jogador1' })
    const { repo } = abrir(servidor)
    expect(await repo.carregarCena(String(cena.id))).toEqual({
      nome: 'Taverna',
      config: { grade: { tamanho: 50 } },
      tokens: [{ id: 'orc', nome: 'orc', x: 140, y: 0, tamanho: 1, cor: '#c2185b', dono: 'jogador1' }],
      imagemUrl: 'blob:1',
    })
  })

  it('o mestre cria, renomeia, ativa e apaga cenas', async () => {
    const servidor = new ServidorFalso()
    const { repo } = abrir(servidor)
    const id = await repo.criarCena('  Ponte  ')
    expect(servidor.cenas.get(id)).toMatchObject({ nome: 'Ponte', campanha: 'campanha1' })
    await repo.renomearCena(id, 'Ponte quebrada')
    await repo.ativarCena(id)
    expect(servidor.campanha.cenaAtiva).toBe(id)
    await repo.ativarCena(null)
    expect(servidor.campanha.cenaAtiva).toBe('')
    await repo.apagarCena(id)
    expect(servidor.cenas.size).toBe(0)
  })

  it('o jogador não mexe nas cenas: falha explicando, sem ir ao servidor', async () => {
    const servidor = new ServidorFalso()
    const { repo } = abrir(servidor, 'jogador')
    await expect(repo.criarCena('Minha')).rejects.toThrow('só o mestre da campanha muda as cenas')
    await expect(repo.gravarConfig('cena1', {})).rejects.toThrow('só o mestre da campanha muda as cenas')
    await expect(repo.ativarCena('cena1')).rejects.toThrow('só o mestre da campanha muda as cenas')
    expect(servidor.pedidos).toEqual([])
  })

  it('o mestre cria o token que não existe e atualiza o que existe, pelo id', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena().id)
    const { repo } = abrir(servidor)
    await repo.carregarCena(cena)
    await repo.gravarToken(cena, token('orc', { dono: 'jogador1' }))
    await repo.gravarToken(cena, token('orc', { x: 210 }))
    const gravados = [...servidor.tokens.values()]
    expect(gravados).toHaveLength(1)
    expect(gravados[0]).toMatchObject({ idLocal: 'orc', x: 210, dono: 'jogador1' })
    expect(servidor.pedidos.filter((p) => p.tipo === 'criar' || p.tipo === 'atualizar').map((p) => p.tipo)).toEqual(['criar', 'atualizar'])
  })

  it('o jogador só move o próprio token, e só manda x e y', async () => {
    const servidor = new ServidorFalso()
    servidor.usuarioId = 'jogador1'
    const cena = String(servidor.novaCena().id)
    servidor.novoToken(cena, 'guerreiro', { dono: 'jogador1' })
    servidor.novoToken(cena, 'orc')
    const { repo } = abrir(servidor, 'jogador')
    await repo.carregarCena(cena)
    await repo.gravarToken(cena, token('guerreiro', { x: 300, y: 400, nome: 'Outro nome' }))
    expect(servidor.pedidos.at(-1)).toMatchObject({ tipo: 'atualizar', dados: { x: 300, y: 400 } })
    expect(Object.keys((servidor.pedidos.at(-1)?.dados ?? {}) as object)).toEqual(['x', 'y'])
    await expect(repo.gravarToken(cena, token('orc'))).rejects.toThrow('você só move os tokens que o mestre deu a você')
    await expect(repo.gravarToken(cena, token('novo'))).rejects.toThrow('você só move os tokens que o mestre deu a você')
  })

  it('no arrasto, só a posição mais nova vai depois da que está gravando, e todos ficam sabendo', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena().id)
    servidor.novoToken(cena, 'orc')
    const { repo } = abrir(servidor)
    await repo.carregarCena(cena)
    servidor.segurarRespostas = true
    const gravacoes = [10, 20, 30, 40].map((x) => repo.gravarToken(cena, token('orc', { x })))
    await esperar()
    servidor.segurarRespostas = false
    servidor.respostasPresas.splice(0).forEach((r) => r())
    await Promise.all(gravacoes)
    const xs = servidor.pedidos.filter((p) => p.tipo === 'atualizar').map((p) => (p.dados as { x: number }).x)
    expect(xs).toEqual([10, 40])
  })

  it('o eco da própria gravação não volta, e um aviso velho não leva o token para trás', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena().id)
    const orc = servidor.novoToken(cena, 'orc')
    const { repo } = abrir(servidor)
    await repo.carregarCena(cena)
    const vistos: EventoTokenBatalha[] = []
    repo.assinarTokens(cena, (e) => vistos.push(e))
    await esperar()

    // A resposta chega antes do eco: o eco é a mesma gravação e não é avisado.
    servidor.segurar = true
    await repo.gravarToken(cena, token('orc', { x: 100 }))
    servidor.soltar()
    expect(vistos).toEqual([])

    // Outra pessoa move: chega. Um aviso mais velho que esse, atrasado, não chega.
    const velho = { ...copia(servidor.tokens.get(String(orc.id))), x: 5, updated: '2026-11-26 19:00:00.000Z' }
    await servidor.atualizar('tokens_batalha', String(orc.id), { x: 250 })
    servidor.emitir('tokens_batalha', 'update', velho as Registro)
    expect(vistos).toEqual([{ tipo: 'gravado', token: expect.objectContaining({ id: 'orc', x: 250 }) }])
  })

  it('o aviso de outra pessoa que chega durante a própria gravação entra depois, se for mais novo', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena().id)
    const orc = servidor.novoToken(cena, 'orc')
    const { repo } = abrir(servidor)
    await repo.carregarCena(cena)
    const vistos: EventoTokenBatalha[] = []
    repo.assinarTokens(cena, (e) => vistos.push(e))
    await esperar()
    servidor.segurarRespostas = true
    const gravando = repo.gravarToken(cena, token('orc', { x: 100 }))
    await esperar()
    // A gravação ainda não respondeu: o mestre de outra aba move depois dela.
    servidor.segurarRespostas = false
    servidor.respostasPresas.splice(0).forEach((r) => r())
    await gravando
    expect(vistos).toEqual([])
    const delaDepois = { ...copia(servidor.tokens.get(String(orc.id))), x: 999, updated: '2026-11-26 21:00:00.000Z' }
    servidor.segurarRespostas = true
    const outra = repo.gravarToken(cena, token('orc', { x: 120 }))
    await esperar()
    servidor.emitir('tokens_batalha', 'update', delaDepois as Registro)
    expect(vistos).toEqual([])
    servidor.segurarRespostas = false
    servidor.respostasPresas.splice(0).forEach((r) => r())
    await outra
    expect(vistos).toEqual([{ tipo: 'gravado', token: expect.objectContaining({ x: 999 }) }])
  })

  it('avisa o token removido e, quando a conexão volta, todos os tokens e os que saíram', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena().id)
    const orc = servidor.novoToken(cena, 'orc')
    servidor.novoToken(cena, 'goblin')
    const { repo } = abrir(servidor)
    await repo.carregarCena(cena)
    const vistos: EventoTokenBatalha[] = []
    repo.assinarTokens(cena, (e) => vistos.push(e))
    await esperar()
    await servidor.apagar('tokens_batalha', String(orc.id))
    expect(vistos).toEqual([{ tipo: 'removido', idLocal: 'orc' }])

    // Com a conexão caída, o goblin sai e um kobold entra.
    vistos.length = 0
    servidor.segurar = true
    for (const [id, t] of servidor.tokens) if (t.idLocal === 'goblin') await servidor.apagar('tokens_batalha', id)
    servidor.novoToken(cena, 'kobold')
    servidor.presos.length = 0
    servidor.segurar = false
    servidor.reconectar()
    await new Promise((resolver) => setTimeout(resolver, 10))
    expect(vistos).toEqual(
      expect.arrayContaining([
        { tipo: 'gravado', token: expect.objectContaining({ id: 'kobold' }) },
        { tipo: 'removido', idLocal: 'goblin' },
      ]),
    )
  })

  it('avisa a configuração e o fundo novos, e libera o endereço do fundo antigo', async () => {
    const servidor = new ServidorFalso()
    servidor.arquivos.set('a.png', new Blob(['a']))
    const cena = String(servidor.novaCena({ fundo: 'a.png' }).id)
    const mestreDeOutraAba = abrir(servidor)
    const { repo, enderecos } = abrir(servidor, 'jogador')
    expect((await repo.carregarCena(cena)).imagemUrl).toBe('blob:1')
    const vistos: unknown[] = []
    repo.assinarConfig(cena, (c) => vistos.push(c))
    await esperar()
    await mestreDeOutraAba.repo.gravarConfig(cena, { grade: { tamanho: 90 } })
    await mestreDeOutraAba.repo.gravarImagem(cena, new Blob(['b'], { type: 'image/png' }))
    await new Promise((resolver) => setTimeout(resolver, 10))
    expect(vistos).toEqual([
      { nome: 'Cena', config: { grade: { tamanho: 90 } }, imagemUrl: 'blob:1' },
      { nome: 'Cena', config: { grade: { tamanho: 90 } }, imagemUrl: 'blob:2' },
    ])
    expect(enderecos.liberados).toEqual(['blob:1'])
  })

  it('avisa a lista quando a cena ativa muda ou uma cena entra, mas não a cada mudança de grade', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena({ nome: 'Taverna' }).id)
    const { repo } = abrir(servidor, 'jogador')
    const listas: ResumoCenaBatalha[][] = []
    repo.assinarCenas((l) => listas.push(l))
    await esperar()
    servidor.campanha.cenaAtiva = cena
    servidor.emitir('campanhas', 'update', servidor.campanha)
    await new Promise((resolver) => setTimeout(resolver, 10))
    expect(listas.at(-1)).toEqual([{ id: cena, nome: 'Taverna', ativa: true }])
    const antes = listas.length
    await servidor.atualizar('cenas_batalha', cena, { config: { grade: { tamanho: 80 } } })
    await new Promise((resolver) => setTimeout(resolver, 10))
    expect(listas.length).toBe(antes)
    await servidor.atualizar('cenas_batalha', cena, { nome: 'Taverna do Pônei' })
    await new Promise((resolver) => setTimeout(resolver, 10))
    expect(listas.at(-1)?.[0]?.nome).toBe('Taverna do Pônei')
  })

  it('importa a cena num pedido só, com o fundo ou o pedido de tirar o fundo', async () => {
    const servidor = new ServidorFalso()
    const { repo } = abrir(servidor)
    const imagem = new Blob(['x'], { type: 'image/webp' })
    await repo.importarCena('cena1', { config: { encaixar: false }, tokens: [token('orc'), token('kobold', { dono: null })], imagem })
    const pedido = servidor.pedidos.at(-1)?.dados as Record<string, unknown>
    expect(pedido.cena).toBe('cena1')
    expect(JSON.parse(String(pedido.dados))).toEqual({
      config: { encaixar: false },
      tokens: [
        { idLocal: 'orc', nome: 'orc', x: 70, y: 35, tamanho: 1, cor: '#1565c0' },
        { idLocal: 'kobold', nome: 'kobold', x: 70, y: 35, tamanho: 1, cor: '#1565c0', dono: '' },
      ],
    })
    expect(pedido.fundo).toBeInstanceOf(Blob)
    await repo.importarCena('cena1', { config: null, tokens: [], imagem: null })
    expect((servidor.pedidos.at(-1)?.dados ?? {}) as Record<string, unknown>).toMatchObject({ removerFundo: '1' })
    await expect(repo.importarCena('cena1', { config: null, tokens: [{ id: 'x' }] })).rejects.toThrow('o token não está num formato')
  })

  it('fechar cancela as assinaturas e libera os fundos, e os pedidos seguintes explicam', async () => {
    const servidor = new ServidorFalso()
    const cena = String(servidor.novaCena({ fundo: 'a.png' }).id)
    const { repo, enderecos } = abrir(servidor)
    await repo.carregarCena(cena)
    repo.assinarCenas(() => undefined)
    repo.assinarTokens(cena, () => undefined)
    await esperar()
    expect(servidor.assinaturas.size).toBe(3)
    await repo.fechar()
    expect(servidor.assinaturas.size).toBe(0)
    expect(servidor.reconexoes.size).toBe(0)
    expect(enderecos.liberados).toEqual(['blob:1'])
    await expect(repo.listarCenas()).rejects.toThrow('você trocou de campanha ou saiu do servidor')
    await expect(repo.gravarToken(cena, token('orc'))).rejects.toThrow('você trocou de campanha ou saiu do servidor')
  })

  it('a assinatura dos tokens de uma cena sai quando ninguém mais ouve', async () => {
    const servidor = new ServidorFalso()
    const { repo } = abrir(servidor)
    const parar = repo.assinarTokens('cena1', () => undefined)
    await esperar()
    const deTokens = () => [...servidor.assinaturas].filter((a) => a.colecao === 'tokens_batalha').length
    expect(deTokens()).toBe(1)
    parar()
    await esperar()
    expect(deTokens()).toBe(0)
  })
})
