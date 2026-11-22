// O mapa da campanha guardado no servidor: a implementação da RepositorioMapa (contrato do mapa,
// app/src/mapa/repositorio.ts) que fala com o PocketBase.
//
// Como a sincronia funciona (detalhes em docs/servidor/README.md, seção "Mapa"):
// - Gravar é mandar o lote inteiro para a coleção `lotes`. O servidor numera, valida e aplica nos
//   hexágonos e regiões, numa transação. Só o servidor grava hexágonos e regiões.
// - Os lotes chegam pelo tempo real, inclusive o eco do próprio lote, e são entregues ao mapa na
//   ordem do servidor (ver fila-lotes.ts). Se falta algum, o repositório busca no servidor.
// - Se o lote que falta já foi apagado pela limpeza (7 dias), o mapa local não tem como ficar certo:
//   o repositório para de entregar lotes e avisa quem estiver ouvindo `aoDesatualizar`.
//
// O repositório não usa o SDK do PocketBase direto: recebe um ClienteMapa, que o conexao.ts cria para
// a sessão atual. Assim os testes usam um servidor falso, e o SDK continua num arquivo só.

import { chaveChunk } from '../mapa/hex'
import type { OuvinteLote, OuvinteToken, RepositorioMapa } from '../mapa/repositorio'
import type { Hexagono, Lote, Regiao, TokenGrupo } from '../mapa/tipos'
import { MAPA_DESATUALIZADO, MAPA_FECHADO, MAPA_SEM_REGISTRO, mensagemDeErroMapa } from './erros'
import { definirInicio, filaVazia, receberLote, temBuraco, type FilaLotes } from './fila-lotes'
import {
  normalizarHexagonoDoServidor,
  normalizarLista,
  normalizarLoteDoServidor,
  normalizarMapaDoServidor,
  normalizarRegiaoDoServidor,
  normalizarTokenDoServidor,
} from './validacao'

export type ColecaoMapa = 'mapas' | 'hexagonos' | 'regioes' | 'tokens_grupo' | 'lotes'

/** Filtro do PocketBase com os valores à parte, para o cliente escapar (nunca montar o texto com os valores). */
export interface FiltroServidor {
  expressao: string
  valores: Record<string, string | number>
}

export interface EventoTempoReal {
  /** 'create', 'update' ou 'delete'. */
  acao: string
  registro: unknown
}

export type Cancelar = () => Promise<void>

/** O que o repositório precisa do servidor. O conexao.ts implementa com o SDK, para a sessão atual. */
export interface ClienteMapa {
  /** Endereço do servidor, para as mensagens de erro. */
  readonly endereco: string
  /** Todos os registros que passam no filtro. */
  listar(colecao: ColecaoMapa, filtro: FiltroServidor, ordem?: string): Promise<unknown[]>
  /** O primeiro registro que passa no filtro, ou null se não houver. */
  primeiro(colecao: ColecaoMapa, filtro: FiltroServidor): Promise<unknown | null>
  criar(colecao: ColecaoMapa, dados: Record<string, unknown>): Promise<unknown>
  atualizar(colecao: ColecaoMapa, id: string, dados: Record<string, unknown>): Promise<unknown>
  /** Assina as mudanças dos registros que passam no filtro. Devolve a função que cancela. */
  assinar(colecao: ColecaoMapa, filtro: FiltroServidor, ouvinte: (evento: EventoTempoReal) => void): Promise<Cancelar>
  /** Chamado a cada vez que o tempo real conecta de novo, depois de cair. */
  aoReconectar(ouvinte: () => void): Promise<Cancelar>
}

export interface OpcoesRepositorio {
  /** Quanto esperar (ms) por um lote que falta antes de ir buscá-lo. Pelo tempo real, a troca de ordem se resolve em milissegundos. */
  esperaBuraco?: number
}

const ESPERA_BURACO = 500
// Se a busca dos lotes que faltam falhar, tenta de novo com espera crescente, até este máximo.
const ESPERA_MAXIMA_BUSCA = 30000

export class RepositorioPocketBase implements RepositorioMapa {
  readonly campanhaId: string
  private cliente: ClienteMapa
  private esperaBuraco: number
  private abertura: Promise<string> | null = null
  private mapaId: string | null = null
  private fila: FilaLotes = filaVazia()
  private ouvintes = new Set<OuvinteLote>()
  private ouvintesToken = new Set<OuvinteToken>()
  private ouvintesDesatualizado = new Set<() => void>()
  private cancelamentos: Cancelar[] = []
  private tokenId: string | null = null
  // Hora da última mudança do token entregue. Um aviso atrasado, inclusive de "tirou o token", não volta atrás.
  private tsToken = -Infinity
  private timerBusca: ReturnType<typeof setTimeout> | null = null
  private buscando: Promise<void> | null = null
  private buscarDeNovo = false
  private falhasSeguidas = 0
  private estaFechado = false
  private estaDesatualizado = false

  constructor(cliente: ClienteMapa, campanhaId: string, opcoes: OpcoesRepositorio = {}) {
    this.cliente = cliente
    this.campanhaId = campanhaId
    this.esperaBuraco = opcoes.esperaBuraco ?? ESPERA_BURACO
  }

  /** O repositório foi fechado (troca de campanha, saída do servidor) e não faz mais nada. */
  get fechado() {
    return this.estaFechado
  }

  /** Faltou um lote que o servidor já apagou: o mapa precisa ser carregado de novo, com um repositório novo. */
  get desatualizado() {
    return this.estaDesatualizado
  }

  // ---------- RepositorioMapa ----------

  carregarChunk(chaveDoChunk: string): Promise<Hexagono[]> {
    return this.pedir(async () => {
      const mapa = await this.abrir()
      this.exigirAtualizado()
      const brutos = await this.cliente.listar('hexagonos', {
        expressao: 'mapa = {:mapa} && chunk = {:chunk}',
        valores: { mapa, chunk: chaveDoChunk },
      })
      this.exigirAberto()
      // O chunk vem calculado pelo servidor. Conferir de novo aqui protege o mapa se as duas contas divergirem.
      return normalizarLista(brutos, normalizarHexagonoDoServidor).filter((h) => chaveChunk(h) === chaveDoChunk)
    })
  }

  carregarRegioes(): Promise<Regiao[]> {
    return this.pedir(async () => {
      const mapa = await this.abrir()
      this.exigirAtualizado()
      const brutos = await this.cliente.listar('regioes', { expressao: 'mapa = {:mapa}', valores: { mapa } })
      this.exigirAberto()
      return normalizarLista(brutos, normalizarRegiaoDoServidor)
    })
  }

  exportarTudo(): Promise<{ hexagonos: Hexagono[]; regioes: Regiao[] }> {
    return this.pedir(async () => {
      const mapa = await this.abrir()
      this.exigirAtualizado()
      const filtro = { expressao: 'mapa = {:mapa}', valores: { mapa } }
      const [hexagonos, regioes] = await Promise.all([this.cliente.listar('hexagonos', filtro), this.cliente.listar('regioes', filtro)])
      this.exigirAberto()
      return {
        hexagonos: normalizarLista(hexagonos, normalizarHexagonoDoServidor),
        regioes: normalizarLista(regioes, normalizarRegiaoDoServidor),
      }
    })
  }

  aplicar(lote: Lote): Promise<void> {
    return this.pedir(async () => {
      const mapa = await this.abrir()
      // O autor e o número de ordem quem põe é o servidor. Se este mesmo lote já tiver sido gravado (por
      // exemplo, reenviado depois de a conexão cair), o servidor responde com o que já estava gravado.
      const registro = await this.cliente.criar('lotes', {
        mapa,
        loteId: lote.id,
        ts: lote.ts,
        mudancas: lote.mudancas,
        regioes: lote.regioes,
      })
      // A resposta já traz o número de ordem: entra na fila como se tivesse chegado pelo tempo real.
      this.receberRegistro(registro)
    })
  }

  assinar(ouvinte: OuvinteLote): () => void {
    this.ouvintes.add(ouvinte)
    // Quem assina quer receber os lotes: o tempo real começa já, mesmo antes de carregar um chunk.
    this.abrir().catch(() => undefined)
    return () => this.ouvintes.delete(ouvinte)
  }

  carregarToken(): Promise<TokenGrupo | null> {
    return this.pedir(async () => {
      const mapa = await this.abrir()
      const registro = normalizarTokenDoServidor(await this.cliente.primeiro('tokens_grupo', { expressao: 'mapa = {:mapa}', valores: { mapa } }))
      this.exigirAberto()
      if (!registro) return null
      this.tokenId = registro.id
      return registro.token ? { ...registro.token } : null
    })
  }

  gravarToken(token: TokenGrupo | null): Promise<void> {
    return this.pedir(async () => {
      const mapa = await this.abrir()
      const id = this.tokenId ?? (await this.buscarIdDoToken(mapa))
      // Tirar o token também leva a hora, para um movimento atrasado não trazer o token de volta.
      const dados = token ? { q: token.q, r: token.r, ts: token.ts, presente: true } : { presente: false, ts: Date.now() }
      await this.cliente.atualizar('tokens_grupo', id, dados)
    })
  }

  assinarToken(ouvinte: OuvinteToken): () => void {
    this.ouvintesToken.add(ouvinte)
    this.abrir().catch(() => undefined)
    return () => this.ouvintesToken.delete(ouvinte)
  }

  // ---------- além do contrato ----------

  /** Chamado uma vez, se o mapa ficar desatualizado (ver `desatualizado`). Devolve a função que cancela. */
  aoDesatualizar(ouvinte: () => void): () => void {
    if (this.estaDesatualizado) {
      ouvinte()
      return () => undefined
    }
    this.ouvintesDesatualizado.add(ouvinte)
    return () => this.ouvintesDesatualizado.delete(ouvinte)
  }

  /** Fecha as assinaturas do tempo real. Depois disso, todo pedido falha com uma mensagem que explica. */
  async fechar(): Promise<void> {
    if (this.estaFechado) return
    this.estaFechado = true
    this.pararBusca()
    await this.cancelarAssinaturas()
  }

  // ---------- abertura ----------

  /** Acha o mapa da campanha e assina o tempo real. Uma vez só: os pedidos seguintes reaproveitam. */
  private abrir(): Promise<string> {
    if (this.estaFechado) return Promise.reject(new Error(MAPA_FECHADO))
    if (!this.abertura) {
      this.abertura = this.conectar().catch(async (erro: unknown) => {
        // Falhou ao abrir: o próximo pedido tenta de novo do zero.
        this.abertura = null
        this.mapaId = null
        this.fila = filaVazia()
        await this.cancelarAssinaturas()
        throw erro
      })
    }
    return this.abertura
  }

  private async conectar(): Promise<string> {
    const achado = normalizarMapaDoServidor(
      await this.cliente.primeiro('mapas', { expressao: 'campanha = {:campanha}', valores: { campanha: this.campanhaId } }),
    )
    this.exigirAberto()
    if (!achado) throw new Error(MAPA_SEM_REGISTRO)
    const filtro = { expressao: 'mapa = {:mapa}', valores: { mapa: achado.id } }

    // Assina antes de ler onde a numeração está, para nenhum lote gravado no meio do caminho se perder.
    // Os que chegarem antes de a numeração ser conhecida esperam na fila.
    await this.guardar(
      this.cliente.assinar('lotes', filtro, (evento) => {
        if (evento.acao === 'create') this.receberRegistro(evento.registro)
      }),
    )
    await this.guardar(
      this.cliente.assinar('tokens_grupo', filtro, (evento) => {
        if (evento.acao === 'update') this.receberToken(evento.registro)
      }),
    )
    await this.guardar(this.cliente.aoReconectar(() => void this.buscarFaltando()))

    // Os lotes até aqui já estão nos hexágonos que o mapa vai carregar depois.
    const atual = normalizarMapaDoServidor(await this.cliente.primeiro('mapas', { expressao: 'id = {:id}', valores: { id: achado.id } }))
    this.exigirAberto()
    if (!atual) throw new Error(MAPA_SEM_REGISTRO)
    this.mapaId = atual.id
    const { fila, prontos } = definirInicio(this.fila, atual.ultimaOrdem)
    this.fila = fila
    this.entregar(prontos)
    if (temBuraco(this.fila)) this.agendarBusca(this.esperaBuraco)
    return atual.id
  }

  /** Guarda a função que cancela uma assinatura. Se o repositório fechou enquanto assinava, cancela na hora. */
  private async guardar(assinatura: Promise<Cancelar>) {
    const cancelar = await assinatura
    if (this.estaFechado) {
      await cancelar().catch(() => undefined)
      throw new Error(MAPA_FECHADO)
    }
    this.cancelamentos.push(cancelar)
  }

  private async cancelarAssinaturas() {
    await Promise.all(this.cancelamentos.splice(0).map((cancelar) => cancelar().catch(() => undefined)))
  }

  private async buscarIdDoToken(mapa: string): Promise<string> {
    const registro = normalizarTokenDoServidor(await this.cliente.primeiro('tokens_grupo', { expressao: 'mapa = {:mapa}', valores: { mapa } }))
    if (!registro) throw new Error(MAPA_SEM_REGISTRO)
    this.tokenId = registro.id
    return registro.id
  }

  // ---------- lotes que chegam ----------

  private receberRegistro(bruto: unknown) {
    if (this.estaFechado || this.estaDesatualizado) return
    const recebido = normalizarLoteDoServidor(bruto)
    if (!recebido) return
    const { fila, prontos } = receberLote(this.fila, recebido.ordem, recebido.lote)
    this.fila = fila
    this.entregar(prontos)
    if (temBuraco(this.fila)) this.agendarBusca(this.esperaBuraco)
  }

  private entregar(lotes: Lote[]) {
    for (const lote of lotes) {
      for (const ouvinte of [...this.ouvintes]) {
        try {
          ouvinte(lote)
        } catch (erro) {
          // Um erro de quem ouve não pode parar a entrega dos lotes seguintes nem esconder o problema.
          queueMicrotask(() => {
            throw erro
          })
        }
      }
    }
  }

  private receberToken(bruto: unknown) {
    if (this.estaFechado || !this.ehObjetoComTs(bruto)) return
    const registro = normalizarTokenDoServidor(bruto)
    if (!registro || bruto.ts < this.tsToken) return
    this.tsToken = bruto.ts
    this.tokenId = registro.id
    for (const ouvinte of [...this.ouvintesToken]) ouvinte(registro.token ? { ...registro.token } : null)
  }

  private ehObjetoComTs(bruto: unknown): bruto is { ts: number } {
    return typeof bruto === 'object' && bruto !== null && 'ts' in bruto && typeof bruto.ts === 'number'
  }

  // ---------- lotes que faltam ----------

  private agendarBusca(espera: number) {
    if (this.timerBusca || this.estaFechado || this.estaDesatualizado) return
    this.timerBusca = setTimeout(() => {
      this.timerBusca = null
      void this.buscarFaltando()
    }, espera)
  }

  private pararBusca() {
    if (this.timerBusca) clearTimeout(this.timerBusca)
    this.timerBusca = null
  }

  /** Busca no servidor os lotes que faltam. Chamado quando há buraco na fila e quando a conexão volta. */
  private buscarFaltando(): Promise<void> {
    if (this.buscando) {
      this.buscarDeNovo = true
      return this.buscando
    }
    this.pararBusca()
    this.buscando = this.buscar()
      .then(() => {
        this.falhasSeguidas = 0
      })
      .catch(() => {
        // Sem resposta agora: tenta de novo mais tarde. A reconexão do tempo real também chama a busca.
        this.falhasSeguidas++
        this.agendarBusca(Math.min(ESPERA_MAXIMA_BUSCA, this.esperaBuraco * 2 ** this.falhasSeguidas))
      })
      .finally(() => {
        this.buscando = null
        if (this.buscarDeNovo) {
          this.buscarDeNovo = false
          void this.buscarFaltando()
        }
      })
    return this.buscando
  }

  private async buscar() {
    const mapa = this.mapaId
    const desde = this.fila.ultima
    if (this.estaFechado || this.estaDesatualizado || !mapa || desde === null) return
    const atual = normalizarMapaDoServidor(await this.cliente.primeiro('mapas', { expressao: 'id = {:id}', valores: { id: mapa } }))
    if (!atual || this.estaFechado || this.estaDesatualizado || atual.ultimaOrdem <= desde) return
    const brutos = await this.cliente.listar(
      'lotes',
      { expressao: 'mapa = {:mapa} && ordem > {:desde} && ordem <= {:ate}', valores: { mapa, desde, ate: atual.ultimaOrdem } },
      'ordem',
    )
    for (const bruto of brutos) this.receberRegistro(bruto)
    if (this.estaFechado || this.estaDesatualizado) return
    // Se ainda falta algo até o último número que o servidor deu, a limpeza já apagou esses lotes.
    if (this.fila.ultima === null || this.fila.ultima < atual.ultimaOrdem) this.marcarDesatualizado()
  }

  private marcarDesatualizado() {
    if (this.estaDesatualizado) return
    this.estaDesatualizado = true
    this.pararBusca()
    this.fila = filaVazia()
    for (const ouvinte of [...this.ouvintesDesatualizado]) ouvinte()
    this.ouvintesDesatualizado.clear()
  }

  // ---------- erros ----------

  private exigirAberto() {
    if (this.estaFechado) throw new Error(MAPA_FECHADO)
  }

  private exigirAtualizado() {
    if (this.estaDesatualizado) throw new Error(MAPA_DESATUALIZADO)
  }

  /** Faz o pedido e troca qualquer erro por uma mensagem em português que o mapa pode mostrar. */
  private async pedir<T>(fazer: () => Promise<T>): Promise<T> {
    try {
      return await fazer()
    } catch (erro) {
      throw new Error(mensagemDeErroMapa(erro, this.cliente.endereco), { cause: erro })
    }
  }
}
