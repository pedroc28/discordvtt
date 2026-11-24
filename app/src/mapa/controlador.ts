// Junta armazém, repositório e histórico. É o único lugar que escreve no mapa.
//
// Fluxo de uma edição: o Traço (pincelada) ou `editar` aplicam na hora no armazém (otimista),
// e o lote vai para o repositório. Lotes de outros clientes chegam por `receber`.
// O desfazer é seletivo: só reverte o que ainda está como o lote deixou (ver operacoes.ts).

import { ArmazemMapa } from './armazem'
import { CamadaMestre } from './camada-mestre'
import { montarArquivo, planejarImportacao, type ArquivoMapa, type ModoImportacao } from './arquivo'
import { chaveChunk, type Aresta, type Hex } from './hex'
import {
  fundirMudancas,
  fundirMudancasRegiao,
  fundirPrivado,
  mudancaCriarRegiao,
  mudancaEditarHexagono,
  mudancaEditarRegiao,
  mudancaExcluirRegiao,
  mudancasApagar,
  mudancasArestas,
  mudancaNota,
  mudancasOcultar,
  mudancasPintar,
  mudancasRegiaoDosHexagonos,
  mudancasRevelar,
  privadoVazio,
  regiaoNova,
  reverterLote,
} from './operacoes'
import { temCamadaMestre, temPermissao, type RepositorioMapa } from './repositorio'
import type {
  Hexagono,
  Lote,
  MapaMeta,
  Mudanca,
  MudancaNota,
  MudancaRegiao,
  PartePrivada,
  PatchHexagono,
  PatchRegiao,
  PermissaoMapa,
  Regiao,
  TipoLote,
  TokenGrupo,
} from './tipos'

const LIMITE_HISTORICO = 200
const LIMITE_ECOS = 300
/** Edições seguidas do mesmo grupo (ex.: digitar uma nota) dentro desta janela viram um passo só. */
const JANELA_GRUPO = 2000

export const novoId = () => crypto.randomUUID()

interface Partes {
  mudancas?: Mudanca[]
  regioes?: MudancaRegiao[]
  /** Só o mestre: hexágonos ocultos e notas privadas. */
  privado?: PartePrivada
  tipo?: TipoLote
}

/** Em que camada uma pincelada pinta: a que todos veem ou a oculta, que só o mestre vê. */
export type CamadaDeEdicao = 'publica' | 'oculta'

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
  private contado = false
  private ctrl: ControladorMapa
  private camada: CamadaDeEdicao

  constructor(ctrl: ControladorMapa, camada: CamadaDeEdicao = 'publica') {
    this.ctrl = ctrl
    // Sem camada do mestre (jogador), a pincelada é sempre pública.
    this.camada = camada === 'oculta' && ctrl.mestre ? 'oculta' : 'publica'
  }

  /** O que esta pincelada lê e escreve: o mapa público ou a camada oculta. */
  private get alvo() {
    return this.camada === 'oculta' ? this.ctrl.mestre!.ocultos : this.ctrl.armazem
  }

  /** Enquanto a pincelada está aberta, ela conta como edição ainda não enviada (ver `pendente`). */
  private abrir() {
    if (this.contado) return
    this.contado = true
    this.ctrl.tracosAbertos++
  }

  private fechar() {
    if (!this.contado) return
    this.contado = false
    this.ctrl.tracosAbertos--
  }

  pintar(hexes: readonly Hex[], terreno: string) {
    this.aplicar(mudancasPintar(this.alvo, this.carregados(hexes), terreno))
  }

  apagar(hexes: readonly Hex[]) {
    this.aplicar(mudancasApagar(this.alvo, this.carregados(hexes)))
  }

  /** Põe os hexágonos que existem numa região, ou tira de qualquer região com null. */
  regiao(hexes: readonly Hex[], regiaoId: string | null) {
    if (this.camada === 'oculta') return
    this.aplicar(mudancasRegiaoDosHexagonos(this.ctrl.armazem, this.carregados(hexes), regiaoId))
  }

  /** Liga ou tira rio nas arestas. Só vale onde os dois hexágonos existem (ao ligar). */
  rio(arestas: readonly Aresta[], ligar: boolean) {
    if (this.camada === 'oculta') return
    this.aplicar(mudancasArestas(this.ctrl.armazem, arestas, 'rios', ligar))
  }

  /** Liga ou tira estrada nas arestas (cada uma liga o centro de dois hexágonos vizinhos). */
  estrada(arestas: readonly Aresta[], ligar: boolean) {
    if (this.camada === 'oculta') return
    this.aplicar(mudancasArestas(this.ctrl.armazem, arestas, 'estradas', ligar))
  }

  get vazio() {
    return this.mudancas.length === 0
  }

  confirmar(): Lote | null {
    if (this.encerrado) return null
    this.encerrado = true
    this.fechar()
    const mudancas = fundirMudancas(this.mudancas)
    if (!mudancas.length) return null
    return this.ctrl.registrar(this.camada === 'oculta' ? { privado: { ocultos: mudancas, notas: [] } } : { mudancas })
  }

  cancelar() {
    if (this.encerrado) return
    this.encerrado = true
    this.fechar()
    const inversas = fundirMudancas(this.mudancas).map((m) => ({ ...m, antes: m.depois, depois: m.antes }))
    this.alvo.aplicarMudancas(inversas)
  }

  /** Só edita chunk já carregado, senão a edição se perderia quando o chunk chegar. */
  private carregados(hexes: readonly Hex[]) {
    return hexes.filter((h) => this.ctrl.armazem.temChunk(chaveChunk(h)) && (this.camada === 'publica' || this.ctrl.mestre!.temChunk(chaveChunk(h))))
  }

  private aplicar(mudancas: Mudanca[]) {
    if (this.encerrado || !mudancas.length) return
    // Mapa travado: ninguém além do mestre pinta. A pincelada nem começa.
    if (this.ctrl.travado) {
      this.ctrl.avisarTravado()
      return
    }
    this.abrir()
    this.alvo.aplicarMudancas(mudancas)
    this.mudancas.push(...mudancas)
  }
}

export class ControladorMapa {
  readonly armazem = new ArmazemMapa()
  /** Hexágonos ocultos e notas privadas. Só existe para o mestre da campanha. */
  readonly mestre: CamadaMestre | null
  /** Chamado quando gravar falha (disco cheio, servidor fora). */
  aoErro: (mensagem: string) => void = () => {}

  private feitos: Lote[] = []
  private desfeitos: Lote[] = []
  /**
   * Ids dos lotes que este cliente enviou. O id fica guardado depois do primeiro eco: para o mestre, um lote
   * com parte pública e privada volta em dois pedaços com o mesmo id, e os dois são o próprio lote.
   */
  private ecos = new Set<string>()
  /** Lotes enviados cujo eco ainda não voltou, na ordem do envio. Só são usados com `reaplicarPendentes`. */
  private naoVoltaram: Lote[] = []
  private carregamentos = new Map<string, Promise<void>>()
  /** Lotes que chegaram enquanto o chunk ainda carregava. Entram assim que ele chegar. */
  private pendentes = new Map<string, Mudanca[]>()
  /** O mesmo para a camada do mestre: ocultos e notas que chegaram com o chunk ainda carregando. */
  private pendentesPrivados = new Map<string, PartePrivada>()
  private carregandoRegioes: Promise<void> | null = null
  private regioesPendentes: MudancaRegiao[] = []
  /** Chunks e regiões que falharam: esperam um tempo e tentam de novo. Nunca viram "vazio". */
  private falhasChunk = new Map<string, Falha>()
  private falhaRegioes: Falha | null = null
  private destruido = false
  private emVoo = 0
  /** Pinceladas abertas, contadas pelo Traço. */
  tracosAbertos = 0
  /** Chamado quando um chunk ou as regiões que tinham falhado finalmente chegam. */
  aoRecuperar: () => void = () => {}
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
  /**
   * Com um servidor que entrega todos os lotes na mesma ordem para todo mundo (eco inclusive), um lote de
   * outra pessoa que chega antes do eco do meu passaria por cima da minha edição. Ligado, as edições
   * que ainda não voltaram são reaplicadas por cima do que chegou.
   */
  private reaplicarPendentes: boolean
  /** Quantas mudanças cabem num lote de importação. Sem limite no mapa do navegador. */
  private limiteImportacao: number
  /** Quem edita o mapa agora. Só muda com um repositório que tem a trava (o do servidor). */
  permissao: PermissaoMapa = 'todos'
  /** Sobe a cada mudança da trava. */
  versaoPermissao = 0
  private ouvintesPermissao = new Set<() => void>()
  private cancelarPermissao: () => void = () => {}
  private ultimoAvisoTrava = 0
  /** Hora (do relógio deste aparelho) da última posição do token que este cliente gravou. */
  private tsDoMeuToken = 0

  constructor(repo: RepositorioMapa, autor: string, opcoes: { reaplicarPendentes?: boolean; limiteImportacao?: number } = {}) {
    this.repo = repo
    this.autor = autor
    this.reaplicarPendentes = opcoes.reaplicarPendentes ?? false
    this.limiteImportacao = opcoes.limiteImportacao ?? Infinity
    this.mestre = temCamadaMestre(repo) ? new CamadaMestre() : null
    this.cancelarAssinatura = repo.assinar((lote) => this.receber(lote))
    this.cancelarAssinaturaToken = repo.assinarToken?.((t) => this.definirToken(t, false)) ?? (() => {})
    if (temPermissao(repo)) this.cancelarPermissao = repo.assinarPermissao((p) => this.definirPermissao(p))
  }

  /** O mapa está travado e quem usa não é mestre: ninguém edita além do mestre. O token continua livre. */
  get travado() {
    return this.permissao === 'mestre' && !this.mestre
  }

  /** Quem usa é mestre e o repositório sabe travar. */
  get podeTravar() {
    return !!this.mestre && temPermissao(this.repo)
  }

  ouvirPermissao(ouvinte: () => void): () => void {
    this.ouvintesPermissao.add(ouvinte)
    return () => this.ouvintesPermissao.delete(ouvinte)
  }

  /** Busca a trava no repositório (uma vez, na abertura). */
  async carregarPermissao(): Promise<void> {
    if (!temPermissao(this.repo)) return
    const versao = this.versaoPermissao
    try {
      const p = await this.repo.carregarPermissao()
      // Se o mestre travou ou destravou enquanto carregava, o aviso é mais novo que a leitura.
      if (this.versaoPermissao === versao) this.definirPermissao(p)
    } catch (e) {
      this.aoErro(`Não consegui saber se o mapa está travado: ${mensagemDe(e)}`)
    }
  }

  /** O mestre trava (só ele edita) ou destrava o mapa. Vale na hora aqui, e o servidor confirma. */
  travar(travar: boolean) {
    const repo = this.repo
    if (!this.podeTravar || !temPermissao(repo)) return
    const antes = this.permissao
    const nova: PermissaoMapa = travar ? 'mestre' : 'todos'
    this.definirPermissao(nova)
    repo.gravarPermissao(nova).catch((e) => {
      this.definirPermissao(antes)
      this.aoErro(`Não consegui ${travar ? 'travar' : 'destravar'} o mapa: ${mensagemDe(e)}`)
    })
  }

  private definirPermissao(p: PermissaoMapa) {
    if (p === this.permissao) return
    this.permissao = p
    this.versaoPermissao++
    for (const o of [...this.ouvintesPermissao]) o()
  }

  /** Diz que o mapa está travado, no máximo uma vez a cada 3 segundos: quem arrasta o pincel gera dezenas de tentativas. */
  avisarTravado() {
    const agora = Date.now()
    if (agora - this.ultimoAvisoTrava < 3000) return
    this.ultimoAvisoTrava = agora
    this.aoErro('O mestre travou o mapa: só ele edita agora. Você ainda pode mover o token.')
  }

  /** Há edição que ainda não está segura no repositório: pincelada aberta ou lote em envio. */
  get pendente() {
    return this.tracosAbertos > 0 || this.emVoo > 0
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
    const versao = this.versaoToken
    try {
      const t = (await this.repo.carregarToken?.()) ?? null
      // Se o token mudou enquanto carregava, o aviso que chegou é mais novo que a leitura.
      if (t && this.versaoToken === versao) this.definirToken(t, false)
    } catch (e) {
      this.aoErro(`Não consegui carregar o token do grupo: ${mensagemDe(e)}`)
    }
  }

  /** Põe o token do grupo no hexágono. Todos veem a mudança. */
  moverToken(h: Hex) {
    this.tsDoMeuToken = Math.max(Date.now(), this.tsDoMeuToken + 1)
    this.definirToken({ q: h.q, r: h.r, ts: this.tsDoMeuToken, autor: this.autor }, true)
  }

  /** Tira o token do mapa. */
  tirarToken() {
    this.definirToken(null, true)
  }

  private definirToken(t: TokenGrupo | null, gravar: boolean) {
    // O que chega vale na ordem em que o repositório entrega: o relógio de outro aparelho não decide nada.
    // A única exceção é o eco de uma posição minha que já foi superada por outra minha (arrastei rápido).
    if (!gravar && t && t.autor === this.autor && t.ts < this.tsDoMeuToken) return
    this.token = t
    this.versaoToken++
    for (const o of [...this.ouvintesToken]) o()
    if (gravar) {
      this.repo.gravarToken?.(t)?.catch((e) => this.aoErro(`Não consegui salvar o token: ${mensagemDe(e)}`))
    }
  }

  /** Carrega o chunk se ainda não estiver. Pode ser chamado à vontade. */
  garantirChunk(chaveDoChunk: string): Promise<void> {
    if (this.armazem.temChunk(chaveDoChunk) || this.destruido) return Promise.resolve()
    // Falhou há pouco: espera o tempo de tentar de novo, em vez de pedir a cada quadro.
    if (this.falhasChunk.get(chaveDoChunk)?.timer) return Promise.resolve()
    let p = this.carregamentos.get(chaveDoChunk)
    if (!p) {
      this.pendentes.set(chaveDoChunk, [])
      this.pendentesPrivados.set(chaveDoChunk, { ocultos: [], notas: [] })
      const repo = this.repo
      // O mestre carrega a camada dele junto com o chunk: as duas chegam ou nenhuma, e a edição só abre quando as duas chegaram.
      const camadas = temCamadaMestre(repo)
        ? Promise.all([repo.carregarChunk(chaveDoChunk), repo.carregarChunkOculto(chaveDoChunk), repo.carregarNotasPrivadas(chaveDoChunk)])
        : repo.carregarChunk(chaveDoChunk).then((h) => [h, null, null] as const)
      p = camadas
        .then(([hexagonos, ocultos, notas]) => {
          this.armazem.definirChunk(chaveDoChunk, hexagonos)
          const atrasadas = this.pendentes.get(chaveDoChunk) ?? []
          if (atrasadas.length) this.armazem.aplicarMudancas(atrasadas)
          if (this.mestre && ocultos && notas) {
            this.mestre.ocultos.definirChunk(chaveDoChunk, ocultos)
            this.mestre.notas.definirChunk(chaveDoChunk, notas)
            const privadas = this.pendentesPrivados.get(chaveDoChunk)
            if (privadas?.ocultos.length) this.mestre.ocultos.aplicarMudancas(privadas.ocultos)
            if (privadas?.notas.length) this.mestre.notas.aplicar(privadas.notas)
          }
          if (this.falhasChunk.delete(chaveDoChunk)) this.recuperou()
        })
        .catch((e) => {
          // Um chunk vazio por falha de rede seria gravado por cima do verdadeiro. Então o chunk fica
          // sem carregar (e sem aceitar edição) até chegar de verdade.
          const falha = this.falhaSeguinte(this.falhasChunk.get(chaveDoChunk), () => void this.garantirChunk(chaveDoChunk))
          this.falhasChunk.set(chaveDoChunk, falha)
          this.aoErro(`Não consegui carregar parte do mapa, tentando de novo. Enquanto isso não dá para editar ali: ${mensagemDe(e)}`)
        })
        .finally(() => {
          this.pendentes.delete(chaveDoChunk)
          this.pendentesPrivados.delete(chaveDoChunk)
          this.carregamentos.delete(chaveDoChunk)
        })
      this.carregamentos.set(chaveDoChunk, p)
    }
    return p
  }

  /** Marca mais uma falha seguida e agenda a nova tentativa, com espera crescente (1 s, 2 s, 4 s... até 15 s). */
  private falhaSeguinte(anterior: Falha | undefined, tentar: () => void): Falha {
    const n = (anterior?.n ?? 0) + 1
    const falha: Falha = { n, timer: null }
    falha.timer = setTimeout(() => {
      falha.timer = null
      if (!this.destruido) tentar()
    }, Math.min(15000, 1000 * 2 ** (n - 1)))
    return falha
  }

  private recuperou() {
    if (this.falhasChunk.size === 0 && !this.falhaRegioes) this.aoRecuperar()
  }

  /** Carrega as regiões (uma vez). Edições de região só funcionam depois disto. */
  carregarRegioes(): Promise<void> {
    if (this.armazem.regioesProntas || this.destruido) return Promise.resolve()
    if (this.falhaRegioes?.timer) return Promise.resolve()
    if (!this.carregandoRegioes) {
      this.regioesPendentes = []
      this.carregandoRegioes = this.repo
        .carregarRegioes()
        .then((lista) => {
          this.armazem.definirRegioes(lista)
          this.armazem.aplicarRegioes(this.regioesPendentes)
          this.regioesPendentes = []
          if (this.falhaRegioes) {
            this.falhaRegioes = null
            this.recuperou()
          }
        })
        .catch((e) => {
          // Como nos chunks: sem as regiões de verdade, nada de editar regiões (criarRegiao devolve null).
          this.falhaRegioes = this.falhaSeguinte(this.falhaRegioes ?? undefined, () => void this.carregarRegioes())
          this.aoErro(`Não consegui carregar as regiões, tentando de novo: ${mensagemDe(e)}`)
        })
        .finally(() => {
          this.carregandoRegioes = null
        })
    }
    return this.carregandoRegioes
  }

  iniciarTraco(camada: CamadaDeEdicao = 'publica'): Traco {
    return new Traco(this, camada)
  }

  // ----- camada do mestre -----

  /** Esconde dos jogadores os hexágonos que existem: saem do mapa público e entram na camada oculta. Retorna quantos. */
  ocultar(hexes: readonly Hex[]): number {
    const m = this.mestre
    if (!m) return 0
    const prontos = hexes.filter((h) => m.temChunk(chaveChunk(h)) && this.armazem.temChunk(chaveChunk(h)))
    const { mudancas, ocultos } = mudancasOcultar(this.armazem, m.ocultos, prontos)
    this.editar({ mudancas, privado: { ocultos, notas: [] } })
    return mudancas.length
  }

  /** Revela hexágonos ocultos: entram no mapa público e saem da camada oculta, num lote só. Retorna quantos. */
  revelar(hexes: readonly Hex[]): number {
    const m = this.mestre
    if (!m) return 0
    const prontos = hexes.filter((h) => m.temChunk(chaveChunk(h)) && this.armazem.temChunk(chaveChunk(h)))
    const { mudancas, ocultos } = mudancasRevelar(this.armazem, m.ocultos, prontos)
    this.editar({ mudancas, privado: { ocultos, notas: [] } })
    return mudancas.length
  }

  /** Edita campos de um hexágono oculto (nome, terreno, marcadores...). Null se não há oculto ali ou nada mudou. */
  editarOculto(q: number, r: number, patch: PatchHexagono, grupo?: string): Lote | null {
    const m = this.mestre
    if (!m) return null
    const mud = mudancaEditarHexagono(m.ocultos, q, r, patch)
    return mud ? this.editar({ privado: { ocultos: [mud], notas: [] } }, grupo) : null
  }

  /** Escreve a nota privada de uma posição (texto vazio apaga). Null se não é mestre, o chunk não chegou ou nada mudou. */
  editarNota(q: number, r: number, texto: string, grupo?: string): Lote | null {
    const m = this.mestre
    if (!m || !m.temChunk(chaveChunk({ q, r }))) return null
    const mud = mudancaNota(m.notas, q, r, texto)
    return mud ? this.editar({ privado: { ocultos: [], notas: [mud] } }, grupo) : null
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

  /**
   * Monta o arquivo de exportação com o mapa inteiro. Se o repositório sabe listar tudo (`exportarTudo`),
   * leva também os chunks que ninguém abriu. Senão leva só o que está carregado.
   */
  async exportar(meta: MapaMeta): Promise<ArquivoMapa> {
    await this.carregarRegioes()
    let hexagonos: Hexagono[]
    let regioes: Regiao[]
    if (this.repo.exportarTudo) {
      const tudo = await this.repo.exportarTudo()
      hexagonos = tudo.hexagonos
      regioes = tudo.regioes
      // Edições que ainda não chegaram ao repositório valem mais do que o que ele devolveu.
      const porChave = new Map(hexagonos.map((h) => [`${h.q},${h.r}`, h]))
      for (const h of this.armazem.todosOsHexagonos()) porChave.set(`${h.q},${h.r}`, h)
      hexagonos = [...porChave.values()]
      const porId = new Map(regioes.map((r) => [r.id, r]))
      for (const r of this.armazem.listarRegioes()) porId.set(r.id, r)
      regioes = [...porId.values()]
    } else {
      hexagonos = [...this.armazem.todosOsHexagonos()]
      regioes = this.armazem.listarRegioes()
    }
    return montarArquivo(meta, hexagonos, regioes, this.token)
  }

  /**
   * Importa um arquivo de mapa como UM passo do histórico (dá para desfazer). `mesclar` põe o conteúdo do
   * arquivo por cima, `substituir` deixa o mapa igual ao arquivo (apaga o que não está nele, e põe o token
   * onde o arquivo diz). O modo `substituir` exige um repositório com `exportarTudo`.
   */
  async importar(arquivo: ArquivoMapa, modo: ModoImportacao): Promise<{ aplicados: number; removidos: number }> {
    if (this.travado) throw new Error('O mestre travou o mapa: só ele importa. Peça para destravar.')
    let existente: { hexagonos: Hexagono[]; regioes: Regiao[] } | undefined
    if (modo === 'substituir') {
      if (!this.repo.exportarTudo) throw new Error('Este mapa não consegue listar tudo o que tem, então não dá para substituir. Use mesclar.')
      existente = await this.repo.exportarTudo()
    }
    // Os chunks mexidos precisam estar carregados para o "antes" (e o desfazer) saírem certos.
    const chunks = new Set<string>()
    for (const h of arquivo.hexagonos) chunks.add(chaveChunk(h))
    for (const h of existente?.hexagonos ?? []) chunks.add(chaveChunk(h))
    await Promise.all([...chunks].map((c) => this.garantirChunk(c)))
    await this.carregarRegioes()
    const plano = planejarImportacao(this.armazem, arquivo, modo, existente)
    const total = plano.mudancas.length + plano.regioes.length
    if (total > this.limiteImportacao) {
      throw new Error(
        `O arquivo muda ${total} itens, e num lote só cabem ${this.limiteImportacao}. Divida o mapa em partes menores e importe uma de cada vez.`,
      )
    }
    // Importar é um lote de importação: o servidor aceita lote maior, e só do mestre.
    this.editar({ mudancas: plano.mudancas, regioes: plano.regioes, tipo: 'importacao' })
    if (modo === 'substituir') {
      if (arquivo.token) this.moverToken(arquivo.token)
      else this.tirarToken()
    }
    return { aplicados: plano.aplicados, removidos: plano.removidos }
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
    const privado = this.mestre && !privadoVazio(partes.privado) ? partes.privado : undefined
    if (!mudancas.length && !regioes.length && !privado) return null
    if (this.travado) {
      this.avisarTravado()
      return null
    }
    this.armazem.aplicarMudancas(mudancas)
    this.armazem.aplicarRegioes(regioes)
    this.aplicarPrivado(privado)
    return this.registrar({ mudancas, regioes, privado, tipo: partes.tipo }, grupo)
  }

  /** Guarda no histórico e envia um lote próprio cujas mudanças já estão no armazém. */
  registrar(partes: Partes, grupo?: string): Lote {
    const agora = Date.now()
    const novo = { mudancas: partes.mudancas ?? [], regioes: partes.regioes ?? [], ...(privadoVazio(partes.privado) ? {} : { privado: partes.privado }), ...(partes.tipo ? { tipo: partes.tipo } : {}) }
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
        ...(topo.privado || novo.privado ? { privado: fundirPrivado([topo.privado, novo.privado]) } : {}),
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
    if (this.ecos.has(lote.id)) {
      // O eco do meu lote: o armazém já está com ele. Só deixa de contá-lo como "não voltou".
      this.naoVoltaram = this.naoVoltaram.filter((l) => l.id !== lote.id)
      return
    }
    this.aplicarDeFora(lote.mudancas, lote.regioes, lote.privado)
    // Meus lotes ainda a caminho valem mais do que este, que o servidor ordenou antes deles.
    for (const meu of this.naoVoltaram) this.aplicarDeFora(meu.mudancas, meu.regioes, meu.privado)
  }

  /** Aplica mudanças que não vieram de uma edição aqui, respeitando chunks e regiões ainda carregando. */
  private aplicarDeFora(mudancas: readonly Mudanca[], regioes: readonly MudancaRegiao[], privado?: PartePrivada) {
    const porChunk = new Map<string, Mudanca[]>()
    for (const m of mudancas) {
      const ck = chaveChunk(m)
      const lista = porChunk.get(ck)
      if (lista) lista.push(m)
      else porChunk.set(ck, [m])
    }
    for (const [ck, lista] of porChunk) {
      const espera = this.pendentes.get(ck)
      if (espera) espera.push(...lista)
      else this.armazem.aplicarMudancas(lista)
    }
    if (regioes.length) {
      if (this.armazem.regioesProntas) this.armazem.aplicarRegioes(regioes)
      else this.regioesPendentes.push(...regioes)
    }
    const m = this.mestre
    if (m && privado) {
      // A parte privada de lote nenhum chega a quem não é mestre, então só o mestre passa por aqui.
      const porChunk = new Map<string, { ocultos: Mudanca[]; notas: MudancaNota[] }>()
      const parte = (ck: string) => porChunk.get(ck) ?? porChunk.set(ck, { ocultos: [], notas: [] }).get(ck)!
      for (const o of privado.ocultos) parte(chaveChunk(o)).ocultos.push(o)
      for (const n of privado.notas) parte(chaveChunk(n)).notas.push(n)
      for (const [ck, p] of porChunk) {
        const espera = this.pendentesPrivados.get(ck)
        if (espera) {
          espera.ocultos.push(...p.ocultos)
          espera.notas.push(...p.notas)
        } else {
          m.ocultos.aplicarMudancas(p.ocultos)
          m.notas.aplicar(p.notas)
        }
      }
    }
  }

  /** Aplica na camada do mestre uma parte privada de uma edição feita aqui. */
  private aplicarPrivado(privado: PartePrivada | undefined) {
    if (!privado || !this.mestre) return
    this.mestre.ocultos.aplicarMudancas(privado.ocultos)
    this.mestre.notas.aplicar(privado.notas)
  }

  destruir() {
    this.destruido = true
    this.cancelarAssinatura()
    this.cancelarAssinaturaToken()
    this.cancelarPermissao()
    for (const f of this.falhasChunk.values()) if (f.timer) clearTimeout(f.timer)
    if (this.falhaRegioes?.timer) clearTimeout(this.falhaRegioes.timer)
    this.falhasChunk.clear()
    this.falhaRegioes = null
  }

  private reverter(sentido: 'desfazer' | 'refazer'): number {
    if (this.travado) {
      this.avisarTravado()
      return 0
    }
    const origem = sentido === 'desfazer' ? this.feitos : this.desfeitos
    const destino = sentido === 'desfazer' ? this.desfeitos : this.feitos
    const original = origem.pop()
    if (!original) return 0
    this.ultimoGrupo = null
    const { lote, conflitos } = reverterLote(
      this.armazem,
      original,
      { id: novoId(), autor: this.autor, ts: Date.now() },
      this.mestre ?? undefined,
    )
    if (lote) {
      this.armazem.aplicarMudancas(lote.mudancas)
      this.armazem.aplicarRegioes(lote.regioes)
      this.aplicarPrivado(lote.privado)
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
    if (this.reaplicarPendentes) {
      this.naoVoltaram.push(lote)
      if (this.naoVoltaram.length > LIMITE_ECOS) this.naoVoltaram.shift()
    }
    this.emVoo++
    this.repo
      .aplicar(lote)
      .catch((e) => {
        this.falhouEnvio(lote)
        this.aoErro(`Não consegui salvar, então desfiz aqui: ${mensagemDe(e)}`)
      })
      .finally(() => {
        this.emVoo--
      })
  }

  /**
   * O repositório recusou o lote (sem permissão, servidor fora, disco cheio). Deixar a edição na tela
   * mostraria um mapa que só existe aqui, então ela é desfeita localmente, como se não tivesse acontecido.
   */
  private falhouEnvio(lote: Lote) {
    this.ecos.delete(lote.id)
    this.naoVoltaram = this.naoVoltaram.filter((l) => l.id !== lote.id)
    this.feitos = this.feitos.filter((l) => l.id !== lote.id)
    this.desfeitos = this.desfeitos.filter((l) => l.id !== lote.id)
    const { lote: inverso } = reverterLote(this.armazem, lote, { id: novoId(), autor: this.autor, ts: Date.now() }, this.mestre ?? undefined)
    if (inverso) {
      this.armazem.aplicarMudancas(inverso.mudancas)
      this.armazem.aplicarRegioes(inverso.regioes)
      this.aplicarPrivado(inverso.privado)
    }
    this.mudouHistorico()
  }

  private mudouHistorico() {
    this.versaoHistorico++
    for (const o of [...this.ouvintesHistorico]) o()
  }
}

interface Falha {
  /** Quantas vezes seguidas falhou. */
  n: number
  /** Espera pela próxima tentativa. Null quando a tentativa já está em curso. */
  timer: ReturnType<typeof setTimeout> | null
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
