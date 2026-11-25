import { describe, expect, it } from 'vitest'
import { ControladorMapa } from '../mapa/controlador'
import { chaveChunk } from '../mapa/hex'
import { temViagem } from '../mapa/repositorio'
import type { Hexagono, Lote, NotaPrivada, Regiao, TokenGrupo } from '../mapa/tipos'
import { RepositorioPocketBase, type Cancelar, type ClienteMapa, type ColecaoMapa, type EventoTempoReal, type FiltroServidor } from './repositorio-mapa'

// Servidor de mentira com o mesmo comportamento do hook (pocketbase/pb_hooks/mapa.js): numera os lotes,
// aplica nos hexágonos e regiões e avisa pelo tempo real. O teste controla quando o tempo real entrega,
// para simular avisos trocados, perdidos e a conexão caindo.

type Registro = Record<string, unknown>

const hexagono = (q: number, r: number, terreno = 'planicie'): Hexagono => ({
  q,
  r,
  terreno,
  regiaoId: null,
  nome: '',
  nota: '',
  marcadores: [],
  rios: [],
  estradas: [],
  rev: 1,
})

const lote = (id: string, mudancas: Lote['mudancas'], regioes: Lote['regioes'] = []): Lote => ({ id, autor: 'eu', ts: 1, mudancas, regioes })
const pintar = (id: string, q: number, r: number, terreno: string) => lote(id, [{ q, r, antes: null, depois: hexagono(q, r, terreno) }])

/** Erro no formato do SDK do PocketBase. */
const erroDoServidor = (status: number, message = '') => Object.assign(new Error(message), { status, response: { message } })

const copia = <T>(v: T): T => structuredClone(v)
const esperar = (ms = 0) => new Promise((resolver) => setTimeout(resolver, ms))

class ServidorFalso implements ClienteMapa {
  readonly endereco = 'https://servidor.teste'
  mapa = { id: 'mapa1', campanha: 'campanha1', ultimaOrdem: 0, permissao: 'todos' }
  camadaMestre = { id: 'camada1', mapa: 'mapa1', ultimaOrdem: 0 }
  hexagonos = new Map<string, Registro>()
  ocultos = new Map<string, Registro>()
  notas = new Map<string, Registro>()
  regioes = new Map<string, Registro>()
  lotesMestre: Registro[] = []
  token: Registro = { id: 'token1', mapa: 'mapa1', q: 0, r: 0, ts: 0, autor: '', presente: false }
  viagem: Registro = { id: 'viagem1', campanha: 'campanha1', config: null, updated: '2026-11-24 10:00:00.000Z' }
  /** Com true, o servidor é de antes da migração da viagem: a coleção não existe. */
  semViagem = false
  private relogio = 0
  lotes: Registro[] = []
  assinaturas = new Map<number, { colecao: ColecaoMapa; ouvinte: (e: EventoTempoReal) => void }>()
  reconexoes = new Set<() => void>()
  /** Com true, os avisos do tempo real ficam presos até `soltar` ou `perder`. */
  segurar = false
  presos: Array<{ colecao: ColecaoMapa; evento: EventoTempoReal }> = []
  /** Próximos pedidos falham com este erro. */
  falha: unknown = null
  /** Se definido, o primeiro pedido espera esta promessa antes de responder. */
  atrasoAbertura: Promise<void> | null = null
  /** Se definido, cada assinatura fica valendo no servidor, mas a resposta espera esta promessa. */
  atrasoAssinatura: Promise<void> | null = null
  /** Chamado quando alguém assina uma coleção, logo depois de a assinatura valer. */
  aoAssinar: (colecao: ColecaoMapa) => void = () => {}
  private proximaAssinatura = 0

  private async pedido() {
    if (this.atrasoAbertura) {
      const atraso = this.atrasoAbertura
      this.atrasoAbertura = null
      await atraso
    }
    if (this.falha) throw this.falha
  }

  async listar(colecao: ColecaoMapa, filtro: FiltroServidor): Promise<unknown[]> {
    await this.pedido()
    const v = filtro.valores
    const porPosicao = { hexagonos: this.hexagonos, hexagonos_ocultos: this.ocultos, notas_mestre: this.notas }
    if (colecao === 'hexagonos' || colecao === 'hexagonos_ocultos' || colecao === 'notas_mestre') {
      return [...porPosicao[colecao].values()].filter((h) => h.mapa === v.mapa && (v.chunk === undefined || h.chunk === v.chunk)).map(copia)
    }
    if (colecao === 'regioes') return [...this.regioes.values()].filter((h) => h.mapa === v.mapa).map(copia)
    if (colecao === 'lotes' || colecao === 'lotes_mestre') {
      return (colecao === 'lotes' ? this.lotes : this.lotesMestre)
        .filter((l) => l.mapa === v.mapa && (l.ordem as number) > (v.desde as number) && (l.ordem as number) <= (v.ate as number))
        .sort((a, b) => (a.ordem as number) - (b.ordem as number))
        .map(copia)
    }
    return []
  }

  async primeiro(colecao: ColecaoMapa, filtro: FiltroServidor): Promise<unknown | null> {
    await this.pedido()
    const v = filtro.valores
    if (colecao === 'mapas') return v.campanha === this.mapa.campanha || v.id === this.mapa.id ? copia(this.mapa) : null
    if (colecao === 'tokens_grupo') return v.mapa === this.token.mapa ? copia(this.token) : null
    if (colecao === 'mapas_mestre') return v.mapa === this.camadaMestre.mapa || v.id === this.camadaMestre.id ? copia(this.camadaMestre) : null
    if (colecao === 'viagens') {
      if (this.semViagem) throw erroDoServidor(404, 'Missing collection context.')
      return v.campanha === this.viagem.campanha || v.id === this.viagem.id ? copia(this.viagem) : null
    }
    return null
  }

  async criar(colecao: ColecaoMapa, dados: Registro): Promise<unknown> {
    await this.pedido()
    if (colecao !== 'lotes') throw erroDoServidor(403)
    return this.gravarLote(dados, 'eu')
  }

  async atualizar(colecao: ColecaoMapa, id: string, dados: Registro): Promise<unknown> {
    await this.pedido()
    if (colecao === 'mapas' && id === this.mapa.id && typeof dados.permissao === 'string') {
      this.mapa.permissao = dados.permissao
      this.emitir('mapas', { acao: 'update', registro: copia(this.mapa) })
      return copia(this.mapa)
    }
    if (colecao === 'viagens' && id === this.viagem.id) return this.gravarViagem(dados.config)
    if (colecao !== 'tokens_grupo' || id !== this.token.id) throw erroDoServidor(404)
    if ((dados.ts as number) < (this.token.ts as number)) return copia(this.token)
    this.token = { ...this.token, ...dados, autor: 'eu' }
    this.emitir('tokens_grupo', { acao: 'update', registro: copia(this.token) })
    return copia(this.token)
  }

  async assinar(colecao: ColecaoMapa, _filtro: FiltroServidor, ouvinte: (e: EventoTempoReal) => void): Promise<Cancelar> {
    await this.pedido()
    const id = this.proximaAssinatura++
    this.assinaturas.set(id, { colecao, ouvinte })
    this.aoAssinar(colecao)
    if (this.atrasoAssinatura) await this.atrasoAssinatura
    return async () => {
      this.assinaturas.delete(id)
    }
  }

  async aoReconectar(ouvinte: () => void): Promise<Cancelar> {
    await this.pedido()
    this.reconexoes.add(ouvinte)
    return async () => {
      this.reconexoes.delete(ouvinte)
    }
  }

  /** O que o hook faz: separa a parte privada, numera cada camada, aplica e avisa. `autor` é quem está logado. */
  gravarLote(dados: Registro, autor: string): Registro {
    const repetido = this.lotes.find((l) => l.loteId === dados.loteId) ?? this.lotesMestre.find((l) => l.loteId === dados.loteId)
    if (repetido) return copia(repetido)
    const privado = dados.privado as Lote['privado'] | undefined
    let resposta: Registro | null = null
    if (privado && (privado.ocultos.length || privado.notas.length)) {
      const ordemMestre = ++this.camadaMestre.ultimaOrdem
      for (const m of privado.ocultos) {
        if (m.depois) this.ocultos.set(`${m.q},${m.r}`, { mapa: this.mapa.id, q: m.q, r: m.r, chunk: chaveChunk(m), dados: copia(m.depois) })
        else this.ocultos.delete(`${m.q},${m.r}`)
      }
      for (const m of privado.notas) {
        if (m.depois) this.notas.set(`${m.q},${m.r}`, { mapa: this.mapa.id, q: m.q, r: m.r, chunk: chaveChunk(m), dados: copia(m.depois) })
        else this.notas.delete(`${m.q},${m.r}`)
      }
      const registro = {
        collectionName: 'lotes_mestre',
        id: `mestre${ordemMestre}`,
        mapa: this.mapa.id,
        ordem: ordemMestre,
        loteId: dados.loteId,
        autor,
        ts: dados.ts,
        tipo: dados.tipo ?? 'edicao',
        ocultos: copia(privado.ocultos),
        notas: copia(privado.notas),
      }
      this.lotesMestre.push(registro)
      this.emitir('lotes_mestre', { acao: 'create', registro: copia(registro) })
      this.emitir('mapas_mestre', { acao: 'update', registro: copia(this.camadaMestre) })
      resposta = registro
    }
    if (!(dados.mudancas as Lote['mudancas']).length && !(dados.regioes as Lote['regioes']).length) {
      if (!resposta) throw erroDoServidor(400, 'Lote recusado: não tem nenhuma mudança.')
      return copia(resposta)
    }
    const ordem = ++this.mapa.ultimaOrdem
    for (const m of dados.mudancas as Lote['mudancas']) {
      const chave = `${m.q},${m.r}`
      if (m.depois) this.hexagonos.set(chave, { mapa: this.mapa.id, q: m.q, r: m.r, chunk: chaveChunk(m), dados: copia(m.depois) })
      else this.hexagonos.delete(chave)
    }
    for (const m of dados.regioes as Lote['regioes']) {
      if (m.depois) this.regioes.set(m.id, { mapa: this.mapa.id, regiaoId: m.id, dados: copia(m.depois) })
      else this.regioes.delete(m.id)
    }
    const { privado: _privado, ...publico } = dados
    void _privado
    const registro = { ...copia(publico), collectionName: 'lotes', id: `reg${ordem}`, mapa: this.mapa.id, ordem, autor }
    this.lotes.push(registro)
    this.emitir('lotes', { acao: 'create', registro: copia(registro) })
    this.emitir('mapas', { acao: 'update', registro: copia(this.mapa) })
    return copia(registro)
  }

  /** O que o servidor faz ao gravar a viagem: guarda, marca a hora e avisa pelo tempo real. */
  gravarViagem(config: unknown): Registro {
    this.relogio++
    this.viagem = { ...this.viagem, config: copia(config), updated: `2026-11-24 10:00:${String(this.relogio).padStart(2, '0')}.000Z` }
    this.emitir('viagens', { acao: 'update', registro: copia(this.viagem) })
    return copia(this.viagem)
  }

  /** Lote gravado por outra pessoa. */
  deOutro(l: Lote) {
    return this.gravarLote({ loteId: l.id, ts: l.ts, mudancas: l.mudancas, regioes: l.regioes, ...(l.privado ? { privado: l.privado } : {}) }, 'outro')
  }

  emitir(colecao: ColecaoMapa, evento: EventoTempoReal) {
    if (this.segurar) this.presos.push({ colecao, evento })
    else this.entregar(colecao, evento)
  }

  private entregar(colecao: ColecaoMapa, evento: EventoTempoReal) {
    for (const a of [...this.assinaturas.values()]) if (a.colecao === colecao) a.ouvinte(copia(evento))
  }

  /**
   * Entrega os avisos presos: todos, na ordem em que foram feitos, ou só os de lotes, na ordem dos índices
   * pedidos (os avisos de contador se perdem).
   */
  soltar(indices?: number[]) {
    const presos = this.presos
    this.presos = []
    if (!indices) {
      for (const p of presos) this.entregar(p.colecao, p.evento)
      return
    }
    const lotes = presos.filter((p) => p.colecao === 'lotes' || p.colecao === 'lotes_mestre')
    for (const i of indices) this.entregar(lotes[i].colecao, lotes[i].evento)
  }

  /** Entrega só os avisos de contador presos (o mapa e a camada do mestre), e os de lotes se perdem. */
  soltarContadores() {
    const presos = this.presos
    this.presos = []
    for (const p of presos) if (p.colecao === 'mapas' || p.colecao === 'mapas_mestre') this.entregar(p.colecao, p.evento)
  }

  perder() {
    this.presos = []
  }

  reconectar() {
    for (const ouvinte of [...this.reconexoes]) ouvinte()
  }

  /** A limpeza do servidor: apaga lotes, mas o contador do mapa fica. */
  apagarLotesAte(ordem: number) {
    this.lotes = this.lotes.filter((l) => (l.ordem as number) > ordem)
  }

  apagarLotesDoMestreAte(ordem: number) {
    this.lotesMestre = this.lotesMestre.filter((l) => (l.ordem as number) > ordem)
  }
}

/** Repositório aberto, com os lotes entregues anotados. */
async function abrir(servidor = new ServidorFalso(), papel: 'mestre' | 'jogador' = 'jogador') {
  const repo = new RepositorioPocketBase(servidor, 'campanha1', { esperaBuraco: 5, papel })
  const recebidos: string[] = []
  repo.assinar((l) => recebidos.push(l.id))
  await repo.carregarRegioes()
  return { servidor, repo, recebidos }
}

describe('RepositorioPocketBase: carregar', () => {
  it('carrega o chunk com os hexágonos do servidor, validados', async () => {
    const servidor = new ServidorFalso()
    servidor.deOutro(lote('a', [{ q: 1, r: 2, antes: null, depois: hexagono(1, 2, 'floresta') }, { q: -1, r: -1, antes: null, depois: hexagono(-1, -1) }]))
    servidor.hexagonos.set('3,3', { mapa: 'mapa1', q: 3, r: 3, chunk: '0,0', dados: { terreno: '' } })
    servidor.hexagonos.set('40,0', { mapa: 'mapa1', q: 40, r: 0, chunk: '0,0', dados: hexagono(40, 0) })
    const { repo } = await abrir(servidor)
    const chunk = await repo.carregarChunk('0,0')
    expect(chunk).toEqual([hexagono(1, 2, 'floresta')])
    expect(await repo.carregarChunk('-1,-1')).toEqual([hexagono(-1, -1)])
  })

  it('falha de verdade quando o servidor não responde, em vez de devolver um chunk vazio', async () => {
    const { servidor, repo } = await abrir()
    servidor.falha = erroDoServidor(0)
    await expect(repo.carregarChunk('0,0')).rejects.toThrow('o servidor em https://servidor.teste não respondeu')
  })

  it('falha explicando quando a pessoa não participa mais da campanha', async () => {
    const servidor = new ServidorFalso()
    servidor.mapa.campanha = 'outra'
    const repo = new RepositorioPocketBase(servidor, 'campanha1')
    await expect(repo.carregarChunk('0,0')).rejects.toThrow('Confira na aba Campanha se você ainda participa dela')
  })

  it('carrega as regiões e exporta o mapa inteiro', async () => {
    const regiao: Regiao = { id: 'reino', nome: 'Reino', cor: '#aa3355', descricao: '', paiId: null, rev: 1 }
    const servidor = new ServidorFalso()
    servidor.deOutro(lote('a', [{ q: 100, r: -100, antes: null, depois: hexagono(100, -100) }], [{ id: 'reino', antes: null, depois: regiao }]))
    const { repo } = await abrir(servidor)
    expect(await repo.carregarRegioes()).toEqual([regiao])
    expect(await repo.exportarTudo()).toEqual({ hexagonos: [hexagono(100, -100)], regioes: [regiao] })
  })
})

describe('RepositorioPocketBase: lotes na ordem do servidor', () => {
  it('grava o lote e entrega o próprio eco uma vez só', async () => {
    const { servidor, repo, recebidos } = await abrir()
    await repo.aplicar(pintar('meu', 0, 0, 'floresta'))
    expect(recebidos).toEqual(['meu'])
    expect(servidor.hexagonos.get('0,0')?.dados).toEqual(hexagono(0, 0, 'floresta'))
  })

  it('lote repetido responde como gravado e não é entregue de novo', async () => {
    const { repo, recebidos } = await abrir()
    const meu = pintar('meu', 0, 0, 'floresta')
    await repo.aplicar(meu)
    await repo.aplicar(meu)
    expect(recebidos).toEqual(['meu'])
  })

  it('entrega na ordem os lotes que chegam trocados pelo tempo real', async () => {
    const { servidor, recebidos } = await abrir()
    servidor.segurar = true
    for (const id of ['a', 'b', 'c']) servidor.deOutro(pintar(id, 0, 0, id))
    servidor.soltar([2, 0, 1])
    expect(recebidos).toEqual(['a', 'b', 'c'])
  })

  it('busca no servidor o lote que não chegou', async () => {
    const { servidor, recebidos } = await abrir()
    servidor.segurar = true
    for (const id of ['a', 'b', 'c']) servidor.deOutro(pintar(id, 0, 0, id))
    servidor.soltar([2])
    expect(recebidos).toEqual([])
    await esperar(30)
    expect(recebidos).toEqual(['a', 'b', 'c'])
  })

  it('busca o que perdeu quando a conexão volta', async () => {
    const { servidor, recebidos } = await abrir()
    servidor.segurar = true
    servidor.deOutro(pintar('a', 0, 0, 'a'))
    servidor.deOutro(pintar('b', 1, 0, 'b'))
    servidor.perder()
    servidor.reconectar()
    await esperar()
    expect(recebidos).toEqual(['a', 'b'])
  })

  it('lote gravado enquanto o mapa abre não se perde nem é entregue duas vezes', async () => {
    const servidor = new ServidorFalso()
    // Gravado logo depois da assinatura e antes de o repositório ler onde a numeração está.
    servidor.aoAssinar = (colecao) => {
      if (colecao === 'lotes') servidor.deOutro(pintar('no-meio', 0, 0, 'floresta'))
    }
    const { repo, recebidos } = await abrir(servidor)
    servidor.deOutro(pintar('depois', 1, 0, 'deserto'))
    // O do meio já está nos hexágonos que o mapa carrega. Só o seguinte chega como lote.
    expect(recebidos).toEqual(['depois'])
    expect((await repo.carregarChunk('0,0')).map((h) => h.terreno).sort()).toEqual(['deserto', 'floresta'])
  })

  it('não entrega de novo os lotes que já estavam no mapa quando ele abriu', async () => {
    const servidor = new ServidorFalso()
    const antigo = servidor.deOutro(pintar('antigo', 0, 0, 'a'))
    const { recebidos } = await abrir(servidor)
    servidor.emitir('lotes', { acao: 'create', registro: antigo })
    servidor.deOutro(pintar('novo', 0, 0, 'b'))
    expect(recebidos).toEqual(['novo'])
  })

  it('avisa que o mapa ficou desatualizado se o lote que falta já foi apagado pela limpeza', async () => {
    const { servidor, repo, recebidos } = await abrir()
    let avisos = 0
    repo.aoDesatualizar(() => avisos++)
    servidor.segurar = true
    for (const id of ['a', 'b', 'c']) servidor.deOutro(pintar(id, 0, 0, id))
    servidor.perder()
    servidor.apagarLotesAte(2)
    servidor.reconectar()
    await esperar()
    expect(avisos).toBe(1)
    expect(repo.desatualizado).toBe(true)
    // Entregar só o lote 3 deixaria o mapa errado: nada é entregue, e ler o mapa falha explicando.
    expect(recebidos).toEqual([])
    await expect(repo.carregarChunk('0,0')).rejects.toThrow('Recarregue o mapa')
    servidor.segurar = false
    servidor.deOutro(pintar('d', 0, 0, 'd'))
    expect(recebidos).toEqual([])
  })

  it('o mesmo aviso vale se todos os lotes que faltam foram apagados', async () => {
    const { servidor, repo } = await abrir()
    servidor.segurar = true
    servidor.deOutro(pintar('a', 0, 0, 'a'))
    servidor.perder()
    servidor.apagarLotesAte(1)
    servidor.reconectar()
    await esperar()
    expect(repo.desatualizado).toBe(true)
  })

  it('erros do servidor viram mensagens em português', async () => {
    const { servidor, repo } = await abrir()
    servidor.falha = erroDoServidor(400, 'Lote recusado: o hexágono (1, 2) não tem terreno.')
    await expect(repo.aplicar(pintar('x', 1, 2, ''))).rejects.toThrow('o servidor recusou: o hexágono (1, 2) não tem terreno.')
    servidor.falha = erroDoServidor(401)
    await expect(repo.aplicar(pintar('y', 1, 2, 'a'))).rejects.toThrow('sua sessão expirou')
  })
})

describe('RepositorioPocketBase: token do grupo', () => {
  it('token fora do mapa vem como null', async () => {
    const { repo } = await abrir()
    expect(await repo.carregarToken()).toBeNull()
  })

  it('grava o token, avisa quem assinou e ignora aviso atrasado', async () => {
    const { servidor, repo } = await abrir()
    const vistos: Array<TokenGrupo | null> = []
    repo.assinarToken((t) => vistos.push(t))
    await repo.gravarToken({ q: 2, r: -3, ts: 1000, autor: 'eu' })
    expect(servidor.token).toMatchObject({ q: 2, r: -3, ts: 1000, presente: true })
    expect(vistos).toEqual([{ q: 2, r: -3, ts: 1000, autor: 'eu' }])
    servidor.emitir('tokens_grupo', { acao: 'update', registro: { ...servidor.token, q: 9, ts: 500 } })
    expect(vistos).toHaveLength(1)
    await repo.gravarToken(null)
    expect(servidor.token.presente).toBe(false)
    expect(vistos.at(-1)).toBeNull()
  })
})

describe('RepositorioPocketBase: fechar', () => {
  it('fecha as assinaturas, e os pedidos seguintes falham explicando', async () => {
    const { servidor, repo } = await abrir()
    expect(servidor.assinaturas.size).toBe(3)
    expect(servidor.reconexoes.size).toBe(1)
    await repo.fechar()
    expect(servidor.assinaturas.size).toBe(0)
    expect(servidor.reconexoes.size).toBe(0)
    await expect(repo.carregarChunk('0,0')).rejects.toThrow('você trocou de campanha ou saiu do servidor')
  })

  it('fechar antes de achar o mapa não chega a assinar nada', async () => {
    const servidor = new ServidorFalso()
    let liberar = () => {}
    servidor.atrasoAbertura = new Promise<void>((resolver) => (liberar = resolver))
    const repo = new RepositorioPocketBase(servidor, 'campanha1')
    const carregando = repo.carregarChunk('0,0')
    await repo.fechar()
    liberar()
    await expect(carregando).rejects.toThrow('você trocou de campanha ou saiu do servidor')
    expect(servidor.assinaturas.size).toBe(0)
  })

  it('fechar enquanto a assinatura está a caminho cancela a assinatura quando ela chega', async () => {
    const servidor = new ServidorFalso()
    let liberar = () => {}
    servidor.atrasoAssinatura = new Promise<void>((resolver) => (liberar = resolver))
    const repo = new RepositorioPocketBase(servidor, 'campanha1')
    const carregando = repo.carregarChunk('0,0')
    await esperar()
    expect(servidor.assinaturas.size).toBe(1)
    await repo.fechar()
    liberar()
    await expect(carregando).rejects.toThrow('você trocou de campanha ou saiu do servidor')
    expect(servidor.assinaturas.size).toBe(0)
    expect(servidor.reconexoes.size).toBe(0)
  })
})

describe('RepositorioPocketBase: o contador do mapa', () => {
  it('mostra que falta um lote mesmo sem nenhum lote seguinte chegar', async () => {
    const { servidor, recebidos } = await abrir()
    servidor.segurar = true
    servidor.deOutro(pintar('a', 0, 0, 'a'))
    servidor.soltarContadores()
    await esperar(30)
    expect(recebidos).toEqual(['a'])
  })
})

describe('RepositorioPocketBase: camada do mestre', () => {
  const oculto = (q: number, r: number): Hexagono => hexagono(q, r, 'ruinas')
  const nota = (q: number, r: number, texto: string): NotaPrivada => ({ q, r, texto, rev: 1 })
  const esconder = (id: string): Lote => ({
    ...lote(id, []),
    privado: { ocultos: [{ q: 3, r: 3, antes: null, depois: oculto(3, 3) }], notas: [{ q: 3, r: 3, antes: null, depois: nota(3, 3, 'O anel') }] },
  })

  it('o mestre recebe a parte privada como um lote à parte, com o mesmo id', async () => {
    const { servidor, repo, recebidos } = await abrir(new ServidorFalso(), 'mestre')
    const vistos: Lote[] = []
    repo.assinar((l) => vistos.push(l))
    servidor.deOutro({ ...esconder('x'), mudancas: [{ q: 1, r: 1, antes: null, depois: hexagono(1, 1, 'campo') }] })
    expect(recebidos).toEqual(['x', 'x'])
    const privado = vistos.find((l) => l.privado)
    expect(privado?.mudancas).toEqual([])
    expect(privado?.privado?.ocultos.map((m) => m.depois?.terreno)).toEqual(['ruinas'])
    expect(privado?.privado?.notas.map((m) => m.depois?.texto)).toEqual(['O anel'])
    expect(vistos.find((l) => !l.privado)?.mudancas).toHaveLength(1)
  })

  it('o jogador não assina nem recebe nada da camada do mestre', async () => {
    const { servidor, repo, recebidos } = await abrir()
    servidor.deOutro({ ...esconder('x'), mudancas: [{ q: 1, r: 1, antes: null, depois: hexagono(1, 1, 'campo') }] })
    expect(recebidos).toEqual(['x'])
    expect([...servidor.assinaturas.values()].some((a) => a.colecao === 'lotes_mestre')).toBe(false)
    expect(repo.ehMestre).toBe(false)
    expect(await repo.carregarChunkOculto('0,0')).toEqual([])
    expect(await repo.carregarNotasPrivadas('0,0')).toEqual([])
  })

  it('um lote só da camada do mestre volta pela resposta e é entregue uma vez', async () => {
    const { repo, recebidos } = await abrir(new ServidorFalso(), 'mestre')
    await repo.aplicar(esconder('meu'))
    expect(recebidos).toEqual(['meu'])
  })

  it('o mestre carrega os ocultos e as notas por chunk, e exporta a camada inteira', async () => {
    const servidor = new ServidorFalso()
    servidor.deOutro(esconder('x'))
    const { repo } = await abrir(servidor, 'mestre')
    expect(await repo.carregarChunkOculto('0,0')).toEqual([oculto(3, 3)])
    expect(await repo.carregarNotasPrivadas('0,0')).toEqual([nota(3, 3, 'O anel')])
    expect(await repo.carregarChunk('0,0')).toEqual([])
    expect(await repo.exportarCamadaMestre()).toEqual({ ocultos: [oculto(3, 3)], notas: [nota(3, 3, 'O anel')] })
  })

  it('busca o que faltou na camada do mestre quando a conexão volta', async () => {
    const { servidor, recebidos } = await abrir(new ServidorFalso(), 'mestre')
    servidor.segurar = true
    servidor.deOutro(esconder('a'))
    servidor.deOutro(esconder('b'))
    servidor.perder()
    servidor.reconectar()
    await esperar()
    expect(recebidos).toEqual(['a', 'b'])
  })

  it('fica desatualizado se o que faltou na camada do mestre já foi apagado', async () => {
    const { servidor, repo } = await abrir(new ServidorFalso(), 'mestre')
    servidor.segurar = true
    servidor.deOutro(esconder('a'))
    servidor.perder()
    servidor.apagarLotesDoMestreAte(1)
    servidor.reconectar()
    await esperar()
    expect(repo.desatualizado).toBe(true)
  })

  it('manda tipo, alvo e parte privada para o servidor', async () => {
    const { servidor, repo } = await abrir(new ServidorFalso(), 'mestre')
    await repo.aplicar({ ...esconder('rev'), tipo: 'reversao', alvoId: 'antigo' })
    expect(servidor.lotesMestre[0]).toMatchObject({ loteId: 'rev', tipo: 'reversao' })
  })
})

describe('RepositorioPocketBase: trava do mapa', () => {
  it('lê a trava, avisa quando muda e o mestre trava e destrava', async () => {
    const { servidor, repo } = await abrir(new ServidorFalso(), 'mestre')
    const vistas: string[] = []
    repo.assinarPermissao((p) => vistas.push(p))
    expect(await repo.carregarPermissao()).toBe('todos')
    await repo.gravarPermissao('mestre')
    expect(servidor.mapa.permissao).toBe('mestre')
    expect(vistas).toEqual(['mestre'])
    servidor.mapa.permissao = 'todos'
    servidor.emitir('mapas', { acao: 'update', registro: copia(servidor.mapa) })
    expect(vistas).toEqual(['mestre', 'todos'])
    expect(await repo.carregarPermissao()).toBe('todos')
  })
})

describe('RepositorioPocketBase: viagem da campanha', () => {
  const config = { viajantes: 4, montarias: 2, estoqueRacoes: 40, estoqueAgua: 60 }
  const viagem = (papel: 'mestre' | 'jogador', servidor: ServidorFalso) => {
    const repo = new RepositorioPocketBase(servidor, 'campanha1', { papel })
    const vistas: Array<Record<string, number> | null> = []
    repo.assinarViagem((c) => vistas.push(c))
    return { repo, vistas }
  }

  it('o mapa reconhece que o repositório tem a viagem', () => {
    expect(temViagem(new RepositorioPocketBase(new ServidorFalso(), 'campanha1'))).toBe(true)
  })

  it('vem null enquanto o mestre nunca gravou, e a gravação do mestre chega a quem participa', async () => {
    const servidor = new ServidorFalso()
    const mestre = viagem('mestre', servidor)
    const jogadora = viagem('jogador', servidor)
    expect(await jogadora.repo.carregarViagem()).toBeNull()
    expect(await mestre.repo.carregarViagem()).toBeNull()
    // A resposta da gravação chega antes do eco: o eco não é avisado de novo a quem gravou.
    servidor.segurar = true
    await mestre.repo.gravarViagem(config)
    servidor.soltar()
    expect(servidor.viagem.config).toEqual(config)
    expect(jogadora.vistas).toEqual([config])
    expect(mestre.vistas).toEqual([])
    expect(await jogadora.repo.carregarViagem()).toEqual(config)
  })

  it('aviso atrasado não volta a configuração atrás', async () => {
    const servidor = new ServidorFalso()
    const jogadora = viagem('jogador', servidor)
    await jogadora.repo.carregarViagem()
    servidor.segurar = true
    servidor.gravarViagem({ ...config, estoqueAgua: 50 })
    servidor.gravarViagem({ ...config, estoqueAgua: 45 })
    servidor.presos.reverse()
    servidor.soltar()
    expect(jogadora.vistas).toEqual([{ ...config, estoqueAgua: 45 }])
    expect(await jogadora.repo.carregarViagem()).toEqual({ ...config, estoqueAgua: 45 })
  })

  it('avisa de novo quando a conexão volta, com o que mudou enquanto ela estava fora', async () => {
    const servidor = new ServidorFalso()
    const jogadora = viagem('jogador', servidor)
    await jogadora.repo.carregarViagem()
    servidor.segurar = true
    servidor.gravarViagem(config)
    servidor.perder()
    expect(jogadora.vistas).toEqual([])
    servidor.reconectar()
    await esperar()
    expect(jogadora.vistas).toEqual([config])
  })

  it('quem não é mestre não grava: falha explicando, sem ir ao servidor', async () => {
    const servidor = new ServidorFalso()
    const { repo } = viagem('jogador', servidor)
    await expect(repo.gravarViagem(config)).rejects.toThrow('só o mestre da campanha muda as regras e o estoque da viagem.')
    expect(servidor.viagem.config).toBeNull()
  })

  it('repassa o motivo de o servidor recusar a configuração', async () => {
    const servidor = new ServidorFalso()
    const { repo } = viagem('mestre', servidor)
    await repo.carregarViagem()
    servidor.falha = erroDoServidor(400, 'Viagem recusada: estoqueAgua precisa ser um número de 0 a 100000.')
    await expect(repo.gravarViagem({ ...config, estoqueAgua: -1 })).rejects.toThrow('o servidor recusou: estoqueAgua precisa ser um número de 0 a 100000.')
  })

  it('servidor sem a migração da viagem explica o que fazer, e não deixa assinatura pendurada', async () => {
    const servidor = new ServidorFalso()
    servidor.semViagem = true
    const { repo } = viagem('jogador', servidor)
    await expect(repo.carregarViagem()).rejects.toThrow('o servidor ainda não guarda a viagem da campanha')
    expect(servidor.assinaturas.size).toBe(0)
    expect(servidor.reconexoes.size).toBe(0)
    // Depois de o servidor ser atualizado, a próxima tentativa abre do zero.
    servidor.semViagem = false
    expect(await repo.carregarViagem()).toBeNull()
  })

  it('a viagem não depende do mapa: uma falha num não fecha as assinaturas do outro', async () => {
    const servidor = new ServidorFalso()
    const { repo, vistas } = viagem('jogador', servidor)
    await repo.carregarViagem()
    servidor.mapa.campanha = 'outra'
    await expect(repo.carregarRegioes()).rejects.toThrow('não encontrei o mapa desta campanha')
    servidor.gravarViagem(config)
    expect(vistas).toEqual([config])
  })

  it('fechar cancela também as assinaturas da viagem', async () => {
    const servidor = new ServidorFalso()
    const { repo } = viagem('mestre', servidor)
    await repo.carregarViagem()
    expect(servidor.assinaturas.size).toBe(1)
    await repo.fechar()
    expect(servidor.assinaturas.size).toBe(0)
    expect(servidor.reconexoes.size).toBe(0)
    await expect(repo.gravarViagem(config)).rejects.toThrow('você trocou de campanha ou saiu do servidor')
  })
})

describe('RepositorioPocketBase com o controlador do mapa', () => {
  it('dois jogadores veem as edições um do outro', async () => {
    const servidor = new ServidorFalso()
    const a = new ControladorMapa(new RepositorioPocketBase(servidor, 'campanha1'), 'ana')
    const b = new ControladorMapa(new RepositorioPocketBase(servidor, 'campanha1'), 'bruno')
    await Promise.all([a.garantirChunk('0,0'), b.garantirChunk('0,0'), a.carregarRegioes(), b.carregarRegioes()])

    const traco = a.iniciarTraco()
    traco.pintar([{ q: 1, r: 1 }, { q: 2, r: 1 }], 'floresta')
    traco.confirmar()
    const regiao = b.criarRegiao({ nome: 'Vale', cor: '#336699' })
    await esperar()

    expect(b.armazem.ler(1, 1)?.terreno).toBe('floresta')
    expect(b.armazem.ler(2, 1)?.terreno).toBe('floresta')
    expect(regiao && a.armazem.lerRegiao(regiao)?.nome).toBe('Vale')

    a.desfazer()
    await esperar()
    expect(b.armazem.ler(1, 1)).toBeNull()
    expect(servidor.hexagonos.has('1,1')).toBe(false)
  })
})
