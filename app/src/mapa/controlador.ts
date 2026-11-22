// Junta armazém, repositório e histórico. É o único lugar que escreve no mapa.
//
// Fluxo de uma edição: o Traço (pincelada) ou `editar` aplicam na hora no armazém (otimista),
// e o lote vai para o repositório. Lotes de outros clientes chegam por `receber`.
// O desfazer é seletivo: só reverte o que ainda está como o lote deixou (ver operacoes.ts).

import { ArmazemMapa } from './armazem'
import { chaveChunk, type Aresta, type Hex } from './hex'
import {
  fundirMudancas,
  fundirMudancasRegiao,
  mudancaCriarRegiao,
  mudancaEditarHexagono,
  mudancaEditarRegiao,
  mudancaExcluirRegiao,
  mudancasApagar,
  mudancasArestas,
  mudancasPintar,
  mudancasRegiaoDosHexagonos,
  regiaoNova,
  reverterLote,
} from './operacoes'
import type { RepositorioMapa } from './repositorio'
import type { Lote, Mudanca, MudancaRegiao, PatchHexagono, PatchRegiao, TokenGrupo } from './tipos'

const LIMITE_HISTORICO = 200
const LIMITE_ECOS = 300
/** Edições seguidas do mesmo grupo (ex.: digitar uma nota) dentro desta janela viram um passo só. */
const JANELA_GRUPO = 2000

export const novoId = () => crypto.randomUUID()

interface Partes {
  mudancas?: Mudanca[]
  regioes?: MudancaRegiao[]
}

export interface DadosRegiao {
  nome: string
  cor: string
  descricao?: string
  paiId?: string | null
}

/** Uma pincelada em andamento. Termina com `confirmar` (grava) ou `cancelar` (volta atrás). */
export class Traco {
  private mudancas: Mudanca[] = []
  private encerrado = false
  private ctrl: ControladorMapa

  constructor(ctrl: ControladorMapa) {
    this.ctrl = ctrl
  }

  pintar(hexes: readonly Hex[], terreno: string) {
    this.aplicar(mudancasPintar(this.ctrl.armazem, this.carregados(hexes), terreno))
  }

  apagar(hexes: readonly Hex[]) {
    this.aplicar(mudancasApagar(this.ctrl.armazem, this.carregados(hexes)))
  }

  /** Põe os hexágonos que existem numa região, ou tira de qualquer região com null. */
  regiao(hexes: readonly Hex[], regiaoId: string | null) {
    this.aplicar(mudancasRegiaoDosHexagonos(this.ctrl.armazem, this.carregados(hexes), regiaoId))
  }

  /** Liga ou tira rio nas arestas. Só vale onde os dois hexágonos existem (ao ligar). */
  rio(arestas: readonly Aresta[], ligar: boolean) {
    this.aplicar(mudancasArestas(this.ctrl.armazem, arestas, 'rios', ligar))
  }

  /** Liga ou tira estrada nas arestas (cada uma liga o centro de dois hexágonos vizinhos). */
  estrada(arestas: readonly Aresta[], ligar: boolean) {
    this.aplicar(mudancasArestas(this.ctrl.armazem, arestas, 'estradas', ligar))
  }

  get vazio() {
    return this.mudancas.length === 0
  }

  confirmar(): Lote | null {
    if (this.encerrado) return null
    this.encerrado = true
    const mudancas = fundirMudancas(this.mudancas)
    if (!mudancas.length) return null
    return this.ctrl.registrar({ mudancas })
  }

  cancelar() {
    if (this.encerrado) return
    this.encerrado = true
    const inversas = fundirMudancas(this.mudancas).map((m) => ({ ...m, antes: m.depois, depois: m.antes }))
    this.ctrl.armazem.aplicarMudancas(inversas)
  }

  /** Só edita chunk já carregado, senão a edição se perderia quando o chunk chegar. */
  private carregados(hexes: readonly Hex[]) {
    return hexes.filter((h) => this.ctrl.armazem.temChunk(chaveChunk(h)))
  }

  private aplicar(mudancas: Mudanca[]) {
    if (this.encerrado || !mudancas.length) return
    this.ctrl.armazem.aplicarMudancas(mudancas)
    this.mudancas.push(...mudancas)
  }
}

export class ControladorMapa {
  readonly armazem = new ArmazemMapa()
  /** Chamado quando gravar falha (disco cheio, servidor fora). */
  aoErro: (mensagem: string) => void = () => {}

  private feitos: Lote[] = []
  private desfeitos: Lote[] = []
  private ecos = new Set<string>()
  private carregamentos = new Map<string, Promise<void>>()
  /** Lotes que chegaram enquanto o chunk ainda carregava. Entram assim que ele chegar. */
  private pendentes = new Map<string, Mudanca[]>()
  private carregandoRegioes: Promise<void> | null = null
  private regioesPendentes: MudancaRegiao[] = []
  private ultimoGrupo: { grupo: string; tempo: number; loteId: string } | null = null
  private ouvintesHistorico = new Set<() => void>()
  private ouvintesToken = new Set<() => void>()
  private cancelarAssinatura: () => void
  private cancelarAssinaturaToken: () => void
  /** Onde está o grupo. Fora do histórico: mover o token não é desfeito pelo Ctrl+Z. */
  token: TokenGrupo | null = null
  /** Sobe a cada mudança do token. */
  versaoToken = 0
  /** Sobe a cada mudança no histórico. Serve de "versão" para a interface. */
  versaoHistorico = 0

  readonly repo: RepositorioMapa
  readonly autor: string

  constructor(repo: RepositorioMapa, autor: string) {
    this.repo = repo
    this.autor = autor
    this.cancelarAssinatura = repo.assinar((lote) => this.receber(lote))
    this.cancelarAssinaturaToken = repo.assinarToken?.((t) => this.definirToken(t, false)) ?? (() => {})
  }

  get podeDesfazer() {
    return this.feitos.length > 0
  }
  get podeRefazer() {
    return this.desfeitos.length > 0
  }

  ouvirHistorico(ouvinte: () => void): () => void {
    this.ouvintesHistorico.add(ouvinte)
    return () => this.ouvintesHistorico.delete(ouvinte)
  }

  ouvirToken(ouvinte: () => void): () => void {
    this.ouvintesToken.add(ouvinte)
    return () => this.ouvintesToken.delete(ouvinte)
  }

  /** Busca o token no repositório (uma vez, na abertura). Sem suporte do repositório, o token fica só na memória. */
  async carregarToken(): Promise<void> {
    try {
      const t = (await this.repo.carregarToken?.()) ?? null
      // Se alguém moveu o token enquanto carregava, vale o mais recente.
      if (t && (!this.token || t.ts > this.token.ts)) this.definirToken(t, false)
    } catch (e) {
      this.aoErro(`Não consegui carregar o token do grupo: ${mensagemDe(e)}`)
    }
  }

  /** Põe o token do grupo no hexágono. Todos veem a mudança. */
  moverToken(h: Hex) {
    this.definirToken({ q: h.q, r: h.r, ts: Date.now(), autor: this.autor }, true)
  }

  /** Tira o token do mapa. */
  tirarToken() {
    this.definirToken(null, true)
  }

  private definirToken(t: TokenGrupo | null, gravar: boolean) {
    // Um aviso atrasado de outro cliente não pode sobrepor uma posição mais nova.
    if (!gravar && t && this.token && t.ts < this.token.ts) return
    this.token = t
    this.versaoToken++
    for (const o of [...this.ouvintesToken]) o()
    if (gravar) {
      this.repo.gravarToken?.(t)?.catch((e) => this.aoErro(`Não consegui salvar o token: ${mensagemDe(e)}`))
    }
  }

  /** Carrega o chunk se ainda não estiver. Pode ser chamado à vontade. */
  garantirChunk(chaveDoChunk: string): Promise<void> {
    if (this.armazem.temChunk(chaveDoChunk)) return Promise.resolve()
    let p = this.carregamentos.get(chaveDoChunk)
    if (!p) {
      this.pendentes.set(chaveDoChunk, [])
      p = this.repo
        .carregarChunk(chaveDoChunk)
        .then((hexagonos) => {
          this.armazem.definirChunk(chaveDoChunk, hexagonos)
          const atrasadas = this.pendentes.get(chaveDoChunk) ?? []
          if (atrasadas.length) this.armazem.aplicarMudancas(atrasadas)
        })
        .catch((e) => {
          // Sem isto o chunk seria pedido de novo a cada quadro. Fica vazio e o mapa segue
          // funcionando só na memória. (Com servidor, esta política precisa mudar: um chunk
          // vazio por falha de rede não pode ser gravado por cima do verdadeiro.)
          this.aoErro(`Não consegui carregar o mapa, o que você fizer aqui não será salvo: ${mensagemDe(e)}`)
          this.armazem.definirChunk(chaveDoChunk, [])
        })
        .finally(() => {
          this.pendentes.delete(chaveDoChunk)
          this.carregamentos.delete(chaveDoChunk)
        })
      this.carregamentos.set(chaveDoChunk, p)
    }
    return p
  }

  /** Carrega as regiões (uma vez). Edições de região só funcionam depois disto. */
  carregarRegioes(): Promise<void> {
    if (this.armazem.regioesProntas) return Promise.resolve()
    if (!this.carregandoRegioes) {
      this.regioesPendentes = []
      this.carregandoRegioes = this.repo
        .carregarRegioes()
        .then((lista) => this.armazem.definirRegioes(lista))
        .catch((e) => {
          this.aoErro(`Não consegui carregar as regiões: ${mensagemDe(e)}`)
          this.armazem.definirRegioes([])
        })
        .finally(() => {
          this.armazem.aplicarRegioes(this.regioesPendentes)
          this.regioesPendentes = []
          this.carregandoRegioes = null
        })
    }
    return this.carregandoRegioes
  }

  iniciarTraco(): Traco {
    return new Traco(this)
  }

  /**
   * Edita campos de um hexágono que existe. Com `grupo`, edições seguidas viram um passo só no
   * desfazer (use para digitação). Retorna null se o hexágono não existe ou nada mudou.
   */
  editarHexagono(q: number, r: number, patch: PatchHexagono, grupo?: string): Lote | null {
    const m = mudancaEditarHexagono(this.armazem, q, r, patch)
    return m ? this.editar({ mudancas: [m] }, grupo) : null
  }

  /** Cria uma região e devolve o id, ou null se as regiões ainda não carregaram. */
  criarRegiao(dados: DadosRegiao): string | null {
    if (!this.armazem.regioesProntas) return null
    const id = novoId()
    this.editar({ regioes: [mudancaCriarRegiao(regiaoNova(id, dados))] })
    return id
  }

  editarRegiao(id: string, patch: PatchRegiao, grupo?: string): Lote | null {
    const m = mudancaEditarRegiao(this.armazem, id, patch)
    return m ? this.editar({ regioes: [m] }, grupo) : null
  }

  excluirRegiao(id: string): Lote | null {
    const m = mudancaExcluirRegiao(this.armazem, id)
    return m ? this.editar({ regioes: [m] }) : null
  }

  /** Desfaz o último lote seu. Retorna quantos itens foram pulados por conflito. */
  desfazer(): number {
    return this.reverter('desfazer')
  }

  refazer(): number {
    return this.reverter('refazer')
  }

  /** Aplica no armazém e registra. Para edições que não são pinceladas. */
  private editar(partes: Partes, grupo?: string): Lote | null {
    const mudancas = partes.mudancas ?? []
    const regioes = partes.regioes ?? []
    if (!mudancas.length && !regioes.length) return null
    this.armazem.aplicarMudancas(mudancas)
    this.armazem.aplicarRegioes(regioes)
    return this.registrar({ mudancas, regioes }, grupo)
  }

  /** Guarda no histórico e envia um lote próprio cujas mudanças já estão no armazém. */
  registrar(partes: Partes, grupo?: string): Lote {
    const agora = Date.now()
    const novo = { mudancas: partes.mudancas ?? [], regioes: partes.regioes ?? [] }
    const topo = this.feitos[this.feitos.length - 1]
    const g = this.ultimoGrupo
    let lote: Lote
    if (grupo && g && g.grupo === grupo && agora - g.tempo < JANELA_GRUPO && topo && topo.id === g.loteId) {
      // Continua o passo anterior: o lote novo carrega o "antes" do primeiro e o "depois" do último.
      lote = {
        id: novoId(),
        autor: this.autor,
        ts: agora,
        mudancas: fundirMudancas([...topo.mudancas, ...novo.mudancas]),
        regioes: fundirMudancasRegiao([...topo.regioes, ...novo.regioes]),
      }
      this.feitos[this.feitos.length - 1] = lote
    } else {
      lote = { id: novoId(), autor: this.autor, ts: agora, ...novo }
      this.feitos.push(lote)
      if (this.feitos.length > LIMITE_HISTORICO) this.feitos.shift()
    }
    this.ultimoGrupo = grupo ? { grupo, tempo: agora, loteId: lote.id } : null
    this.desfeitos = []
    this.enviar(lote)
    this.mudouHistorico()
    return lote
  }

  /** Lote de outro cliente (ou eco do próprio, que é ignorado). */
  receber(lote: Lote) {
    if (this.ecos.delete(lote.id)) return
    const porChunk = new Map<string, Mudanca[]>()
    for (const m of lote.mudancas) {
      const ck = chaveChunk(m)
      const lista = porChunk.get(ck)
      if (lista) lista.push(m)
      else porChunk.set(ck, [m])
    }
    for (const [ck, mudancas] of porChunk) {
      const espera = this.pendentes.get(ck)
      if (espera) espera.push(...mudancas)
      else this.armazem.aplicarMudancas(mudancas)
    }
    if (lote.regioes.length) {
      if (this.armazem.regioesProntas) this.armazem.aplicarRegioes(lote.regioes)
      else this.regioesPendentes.push(...lote.regioes)
    }
  }

  destruir() {
    this.cancelarAssinatura()
    this.cancelarAssinaturaToken()
  }

  private reverter(sentido: 'desfazer' | 'refazer'): number {
    const origem = sentido === 'desfazer' ? this.feitos : this.desfeitos
    const destino = sentido === 'desfazer' ? this.desfeitos : this.feitos
    const original = origem.pop()
    if (!original) return 0
    this.ultimoGrupo = null
    const { lote, conflitos } = reverterLote(this.armazem, original, {
      id: novoId(),
      autor: this.autor,
      ts: Date.now(),
    })
    if (lote) {
      this.armazem.aplicarMudancas(lote.mudancas)
      this.armazem.aplicarRegioes(lote.regioes)
      // Vai para a outra pilha o lote que acabou de ser aplicado: desfazê-lo é o oposto.
      // (As revisões mudam a cada aplicação, então não dá para guardar o original.)
      destino.push(lote)
      this.enviar(lote)
    }
    this.mudouHistorico()
    return conflitos
  }

  private enviar(lote: Lote) {
    this.ecos.add(lote.id)
    if (this.ecos.size > LIMITE_ECOS) this.ecos.delete(this.ecos.values().next().value as string)
    this.repo.aplicar(lote).catch((e) => this.aoErro(`Não consegui salvar: ${mensagemDe(e)}`))
  }

  private mudouHistorico() {
    this.versaoHistorico++
    for (const o of [...this.ouvintesHistorico]) o()
  }
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
