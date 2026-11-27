// O mapa de batalha da campanha guardado no servidor: as cenas, os tokens e a cena ativa.
//
// Como funciona (detalhes em docs/servidor/README.md, seção "Batalha", e o contrato em docs/contratos.md):
// - Cada cena é um registro de `cenas_batalha`, com a configuração em JSON e o fundo como arquivo
//   protegido. Cada token é um registro de `tokens_batalha`: mover um token regrava só ele.
// - A cena ativa fica na campanha. O servidor só mostra ao jogador a cena ativa e os tokens dela.
// - Gravações do mesmo token (ou da mesma configuração) vão uma de cada vez. Se o app manda várias
//   durante um arrasto, as do meio são puladas e vai só a mais nova: o token nunca volta para trás.
// - Os avisos do tempo real passam por um filtro: aviso mais velho que a última gravação conhecida,
//   pela hora do servidor, é ignorado, e o eco da própria gravação não é avisado de novo. Enquanto um
//   token está sendo gravado por esta pessoa, os avisos dele esperam a gravação acabar.
// - Quando a conexão volta, as cenas, as configurações e os tokens assinados são lidos de novo e
//   avisados, para nada se perder.
// - O fundo é baixado uma vez, com o token de arquivo, e vira um endereço local (blob:) até mudar ou
//   o repositório fechar.
//
// O repositório não usa o SDK do PocketBase direto: recebe um ClienteBatalha, que o conexao.ts cria
// para a sessão atual.

import {
  BATALHA_FECHADA,
  BATALHA_INVALIDA,
  BATALHA_SO_DONO,
  BATALHA_SO_MESTRE,
  BATALHA_TOKEN_INVALIDO,
  mensagemDeErroBatalha,
  type AcaoBatalha,
} from './erros'
import type { Cancelar, EventoTempoReal, FiltroServidor } from './repositorio-mapa'
import type { Enderecos } from './repositorio-quadro'
import type { CenaBatalhaDoServidor, ConfigDaCenaBatalha, EventoTokenBatalha, Papel, ResumoCenaBatalha } from './tipos'
import {
  normalizarCenaBatalhaDoServidor,
  normalizarTokenBatalhaDoServidor,
  tokenBatalhaParaServidor,
  type RegistroCenaBatalha,
  type RegistroTokenBatalha,
  type TokenBatalhaParaServidor,
} from './validacao'

export type ColecaoBatalha = 'cenas_batalha' | 'tokens_batalha' | 'campanhas'

/** O que o repositório precisa do servidor. O conexao.ts implementa com o SDK, para a sessão atual. */
export interface ClienteBatalha {
  /** Endereço do servidor, para as mensagens de erro. */
  readonly endereco: string
  /** A conta de quem está usando, para saber quais tokens são dela. */
  readonly usuarioId: string
  listar(colecao: ColecaoBatalha, filtro: FiltroServidor, ordem?: string): Promise<unknown[]>
  ler(colecao: ColecaoBatalha, id: string): Promise<unknown>
  criar(colecao: ColecaoBatalha, dados: Record<string, unknown>): Promise<unknown>
  atualizar(colecao: ColecaoBatalha, id: string, dados: Record<string, unknown> | FormData): Promise<unknown>
  apagar(colecao: ColecaoBatalha, id: string): Promise<void>
  /** A importação de uma cena inteira, num pedido só (pocketbase/pb_hooks/batalha.pb.js). */
  importar(formulario: FormData): Promise<unknown>
  /** Baixa o fundo protegido de uma cena. */
  baixarFundo(cenaId: string, arquivo: string): Promise<Blob>
  assinar(colecao: ColecaoBatalha, filtro: FiltroServidor, ouvinte: (evento: EventoTempoReal) => void): Promise<Cancelar>
  aoReconectar(ouvinte: () => void): Promise<Cancelar>
}

const ENDERECOS_DO_NAVEGADOR: Enderecos = {
  criar: (arquivo) => URL.createObjectURL(arquivo),
  liberar: (endereco) => URL.revokeObjectURL(endereco),
}

/** O que o repositório sabe de uma cena aberta. */
interface CenaConhecida {
  registro: RegistroCenaBatalha
  /** Tokens pelo idLocal. */
  tokens: Map<string, RegistroTokenBatalha>
}

/** Gravações de uma mesma coisa (um token, uma configuração): uma de cada vez, só a mais nova esperando. */
interface Fila {
  proxima: (() => Promise<void>) | null
  esperando: Array<{ ok: () => void; falha: (erro: unknown) => void }>
  /** O aviso mais novo que chegou enquanto a fila gravava, para entregar se ele for mais novo que a gravação. */
  avisoGuardado: unknown
}

/** Hora de gravação do servidor: "a" é mais velha que "b"? Sem hora, não dá para saber, e nada é descartado. */
const maisVelha = (a: string, b: string) => a !== '' && b !== '' && a < b

export class RepositorioBatalhaPocketBase {
  readonly campanhaId: string
  readonly papel: Papel
  private cliente: ClienteBatalha
  private enderecos: Enderecos
  private estaFechado = false

  private cenas = new Map<string, CenaConhecida>()
  private filas = new Map<string, Fila>()
  private fundos = new Map<string, { arquivo: string; endereco: Promise<string> }>()

  private ouvintesCenas = new Set<(cenas: ResumoCenaBatalha[]) => void>()
  private ouvintesConfig = new Map<string, Set<(config: ConfigDaCenaBatalha) => void>>()
  private ouvintesTokens = new Map<string, Set<(evento: EventoTokenBatalha) => void>>()
  private assinaturasTokens = new Map<string, Promise<Cancelar | null>>()
  private tempoRealGeral: Promise<void> | null = null
  private cancelamentos: Cancelar[] = []
  private listando: Promise<void> | null = null
  private listarDeNovo = false

  constructor(cliente: ClienteBatalha, campanhaId: string, opcoes: { papel?: Papel; enderecos?: Enderecos } = {}) {
    this.cliente = cliente
    this.campanhaId = campanhaId
    this.papel = opcoes.papel ?? 'jogador'
    this.enderecos = opcoes.enderecos ?? ENDERECOS_DO_NAVEGADOR
  }

  get ehMestre(): boolean {
    return this.papel === 'mestre'
  }

  get fechado(): boolean {
    return this.estaFechado
  }

  /** A conta de quem usa: um token com este dono pode ser movido por ela. */
  get usuarioId(): string {
    return this.cliente.usuarioId
  }

  /** Faz o pedido e traduz qualquer falha numa mensagem que diz o que fazer. */
  private async pedir<T>(acao: AcaoBatalha, pedido: () => Promise<T>): Promise<T> {
    if (this.estaFechado) throw new Error(BATALHA_FECHADA)
    try {
      const resposta = await pedido()
      if (this.estaFechado) throw new Error(BATALHA_FECHADA)
      return resposta
    } catch (erro) {
      throw new Error(this.estaFechado ? BATALHA_FECHADA : mensagemDeErroBatalha(erro, this.cliente.endereco, acao))
    }
  }

  private exigirMestre() {
    if (!this.ehMestre) throw new Error(BATALHA_SO_MESTRE)
  }

  // ---------- cenas ----------

  /** As cenas da campanha, na ordem em que foram criadas. O jogador recebe só a ativa, ou nenhuma. */
  async listarCenas(): Promise<ResumoCenaBatalha[]> {
    const [brutas, campanha] = await this.pedir('listar', () =>
      Promise.all([
        this.cliente.listar('cenas_batalha', { expressao: 'campanha = {:campanha}', valores: { campanha: this.campanhaId } }, 'created,id'),
        this.cliente.ler('campanhas', this.campanhaId),
      ]),
    )
    const ativa = typeof campanha === 'object' && campanha !== null && 'cenaAtiva' in campanha && typeof campanha.cenaAtiva === 'string' ? campanha.cenaAtiva : ''
    return brutas.flatMap((bruta) => {
      const cena = normalizarCenaBatalhaDoServidor(bruta)
      if (!cena) return []
      // Guarda a cena que ainda não conhecia, para o aviso de mudar a grade não pedir a lista de novo. A que
      // já conhece fica como está: quem atualiza é o aviso do tempo real, que também avisa a configuração.
      if (!this.cenas.has(cena.id)) this.cenas.set(cena.id, { registro: cena, tokens: new Map() })
      return [{ id: cena.id, nome: cena.nome, ativa: cena.id === ativa }]
    })
  }

  /** Uma cena inteira: configuração, tokens e o endereço local do fundo. */
  async carregarCena(id: string): Promise<CenaBatalhaDoServidor> {
    const [bruta, brutos] = await this.pedir('abrir', () =>
      Promise.all([this.cliente.ler('cenas_batalha', id), this.cliente.listar('tokens_batalha', { expressao: 'cena = {:cena}', valores: { cena: id } })]),
    )
    const registro = normalizarCenaBatalhaDoServidor(bruta)
    if (!registro) throw new Error(BATALHA_INVALIDA)
    const tokens = new Map<string, RegistroTokenBatalha>()
    for (const bruto of brutos) {
      const token = normalizarTokenBatalhaDoServidor(bruto)
      if (token) tokens.set(token.token.id, token)
    }
    this.cenas.set(id, { registro, tokens })
    return {
      nome: registro.nome,
      config: registro.config,
      tokens: [...tokens.values()].map((t) => ({ ...t.token })),
      imagemUrl: await this.urlDoFundo(registro),
    }
  }

  /** Cria uma cena sem configuração (o mapa usa os padrões) e devolve o id. Só o mestre. */
  async criarCena(nome: string): Promise<string> {
    this.exigirMestre()
    const registro = normalizarCenaBatalhaDoServidor(
      await this.pedir('criar', () => this.cliente.criar('cenas_batalha', { campanha: this.campanhaId, nome: nome.trim() })),
    )
    if (!registro) throw new Error(BATALHA_INVALIDA)
    this.cenas.set(registro.id, { registro, tokens: new Map() })
    return registro.id
  }

  async renomearCena(id: string, nome: string): Promise<void> {
    this.exigirMestre()
    this.guardarCena(await this.pedir('mudar cena', () => this.cliente.atualizar('cenas_batalha', id, { nome: nome.trim() })))
  }

  /** Apaga a cena, os tokens e o fundo dela. Se era a ativa, a campanha fica sem cena ativa. */
  async apagarCena(id: string): Promise<void> {
    this.exigirMestre()
    await this.pedir('apagar', () => this.cliente.apagar('cenas_batalha', id))
    this.esquecerCena(id)
  }

  /** A cena que os jogadores veem. Null tira a cena ativa: os jogadores ficam sem cena. */
  async ativarCena(id: string | null): Promise<void> {
    this.exigirMestre()
    await this.pedir('ativar', () => this.cliente.atualizar('campanhas', this.campanhaId, { cenaAtiva: id ?? '' }))
  }

  /** Grava a grade, a medida e o resto da configuração. Gravações seguidas vão uma de cada vez, só a mais nova. */
  gravarConfig(id: string, config: unknown): Promise<void> {
    if (this.estaFechado) return Promise.reject(new Error(BATALHA_FECHADA))
    if (!this.ehMestre) return Promise.reject(new Error(BATALHA_SO_MESTRE))
    return this.enfileirar(`config:${id}`, async () => {
      this.guardarCena(await this.pedir('mudar cena', () => this.cliente.atualizar('cenas_batalha', id, { config: config ?? null })))
    })
  }

  /** Troca o fundo da cena, ou tira com null. */
  async gravarImagem(id: string, imagem: Blob | null): Promise<void> {
    this.exigirMestre()
    let dados: FormData | Record<string, unknown> = { fundo: null }
    if (imagem) {
      dados = new FormData()
      dados.append('fundo', imagem, `fundo.${extensao(imagem.type)}`)
    }
    const registro = this.guardarCena(await this.pedir('fundo', () => this.cliente.atualizar('cenas_batalha', id, dados)))
    // O arquivo novo já está aqui: não precisa baixar de volta.
    if (registro && imagem && registro.fundo) this.trocarFundo(id, registro.fundo, Promise.resolve(this.enderecos.criar(imagem)))
    if (registro && !imagem) this.trocarFundo(id, '', null)
  }

  /**
   * Troca a configuração, os tokens e o fundo da cena num passo só: entra tudo ou nada. Os tokens que
   * já existem são atualizados pelo id, os que não vierem saem. `imagem` undefined mantém o fundo, null
   * tira. Só o mestre, até 200 tokens.
   */
  async importarCena(cenaId: string, dados: { config: unknown; tokens: unknown[]; imagem?: Blob | null }): Promise<void> {
    this.exigirMestre()
    const tokens = dados.tokens.map((bruto) => {
      const token = tokenBatalhaParaServidor(bruto)
      if (!token) throw new Error(BATALHA_TOKEN_INVALIDO)
      return token
    })
    const formulario = new FormData()
    formulario.append('cena', cenaId)
    formulario.append('dados', JSON.stringify({ config: dados.config ?? null, tokens }))
    if (dados.imagem) formulario.append('fundo', dados.imagem, `fundo.${extensao(dados.imagem.type)}`)
    else if (dados.imagem === null) formulario.append('removerFundo', '1')
    await this.pedir('importar', () => this.cliente.importar(formulario))
  }

  // ---------- tokens ----------

  /**
   * Cria ou atualiza um token pelo id. O mestre grava tudo. O jogador só move (x e y) os tokens em que é
   * o dono. Durante um arrasto, as gravações do meio são puladas: vai só a mais nova.
   */
  gravarToken(cenaId: string, bruto: unknown): Promise<void> {
    if (this.estaFechado) return Promise.reject(new Error(BATALHA_FECHADA))
    const token = tokenBatalhaParaServidor(bruto)
    if (!token) return Promise.reject(new Error(BATALHA_TOKEN_INVALIDO))
    return this.enfileirar(`token:${cenaId}:${token.idLocal}`, () => this.enviarToken(cenaId, token))
  }

  private async enviarToken(cenaId: string, token: TokenBatalhaParaServidor) {
    const existente = await this.registroDoToken(cenaId, token.idLocal)
    let resposta: unknown
    if (this.ehMestre) {
      const { idLocal, nome, x, y, tamanho, cor, dono } = token
      const dados: Record<string, unknown> = { idLocal, nome, x, y, tamanho, cor }
      if (dono !== undefined) dados.dono = dono
      resposta = await this.pedir(existente ? 'mover' : 'criar', () =>
        existente ? this.cliente.atualizar('tokens_batalha', existente.registroId, dados) : this.cliente.criar('tokens_batalha', { ...dados, cena: cenaId }),
      )
    } else {
      if (!existente || existente.token.dono !== this.usuarioId) throw new Error(BATALHA_SO_DONO)
      resposta = await this.pedir('mover', () => this.cliente.atualizar('tokens_batalha', existente.registroId, { x: token.x, y: token.y }))
    }
    const registro = normalizarTokenBatalhaDoServidor(resposta)
    if (!registro) throw new Error(BATALHA_INVALIDA)
    this.cenas.get(cenaId)?.tokens.set(registro.token.id, registro)
  }

  /** Tira o token da cena. Só o mestre. Se ele já saiu, não faz nada. */
  async removerToken(cenaId: string, idLocal: string): Promise<void> {
    this.exigirMestre()
    const existente = await this.registroDoToken(cenaId, idLocal)
    if (!existente) return
    await this.pedir('tirar', () => this.cliente.apagar('tokens_batalha', existente.registroId))
    this.cenas.get(cenaId)?.tokens.delete(idLocal)
  }

  /** O registro de um token: do que já se sabe da cena, ou perguntado ao servidor. */
  private async registroDoToken(cenaId: string, idLocal: string): Promise<RegistroTokenBatalha | null> {
    const conhecido = this.cenas.get(cenaId)?.tokens.get(idLocal)
    if (conhecido) return conhecido
    const brutos = await this.pedir('abrir', () =>
      this.cliente.listar('tokens_batalha', { expressao: 'cena = {:cena} && idLocal = {:idLocal}', valores: { cena: cenaId, idLocal } }),
    )
    const registro = brutos.length ? normalizarTokenBatalhaDoServidor(brutos[0]) : null
    if (registro) this.cenas.get(cenaId)?.tokens.set(idLocal, registro)
    return registro
  }

  // ---------- filas de gravação ----------

  private enfileirar(chave: string, enviar: () => Promise<void>): Promise<void> {
    const existente = this.filas.get(chave)
    const fila: Fila = existente ?? { proxima: null, esperando: [], avisoGuardado: null }
    if (!existente) this.filas.set(chave, fila)
    fila.proxima = enviar
    const promessa = new Promise<void>((ok, falha) => {
      fila.esperando.push({ ok, falha })
    })
    if (!existente) void this.drenar(chave, fila)
    return promessa
  }

  private async drenar(chave: string, fila: Fila) {
    while (fila.proxima) {
      const enviar = fila.proxima
      fila.proxima = null
      const esperando = fila.esperando.splice(0)
      try {
        await enviar()
        for (const e of esperando) e.ok()
      } catch (erro) {
        for (const e of esperando) e.falha(erro)
      }
    }
    this.filas.delete(chave)
    // Um aviso que chegou durante a gravação: entra agora, se for mais novo que ela.
    if (fila.avisoGuardado) {
      if (chave.startsWith('token:')) this.receberToken(fila.avisoGuardado)
      else this.receberCena(fila.avisoGuardado, false)
    }
  }

  // ---------- tempo real ----------

  /** Avisa a lista de cenas sempre que ela muda, inclusive a cena ativa, e quando a conexão volta. */
  assinarCenas(ouvinte: (cenas: ResumoCenaBatalha[]) => void): () => void {
    this.ouvintesCenas.add(ouvinte)
    this.comecarTempoRealGeral()
    return () => {
      this.ouvintesCenas.delete(ouvinte)
    }
  }

  /** Avisa quando o mestre muda o nome, a configuração ou o fundo da cena, e quando a conexão volta. */
  assinarConfig(cenaId: string, ouvinte: (config: ConfigDaCenaBatalha) => void): () => void {
    const ouvintes = this.ouvintesConfig.get(cenaId) ?? new Set()
    ouvintes.add(ouvinte)
    this.ouvintesConfig.set(cenaId, ouvintes)
    this.comecarTempoRealGeral()
    return () => {
      ouvintes.delete(ouvinte)
      if (!ouvintes.size) this.ouvintesConfig.delete(cenaId)
    }
  }

  /**
   * Avisa cada token gravado ou removido na cena, por outra pessoa ou em outra aba. Quando a conexão volta,
   * avisa de novo todos os tokens da cena e os que saíram.
   */
  assinarTokens(cenaId: string, ouvinte: (evento: EventoTokenBatalha) => void): () => void {
    const ouvintes = this.ouvintesTokens.get(cenaId) ?? new Set()
    ouvintes.add(ouvinte)
    this.ouvintesTokens.set(cenaId, ouvintes)
    this.comecarTempoRealGeral()
    if (!this.assinaturasTokens.has(cenaId) && !this.estaFechado) {
      const assinatura = this.cliente
        .assinar('tokens_batalha', { expressao: 'cena = {:cena}', valores: { cena: cenaId } }, (evento) => this.receberEventoToken(cenaId, evento))
        .catch(() => null)
      this.assinaturasTokens.set(cenaId, assinatura)
    }
    return () => {
      ouvintes.delete(ouvinte)
      if (ouvintes.size) return
      // Ninguém mais ouve esta cena: a assinatura sai, para o mestre trocar de cena sem acumular.
      this.ouvintesTokens.delete(cenaId)
      const assinatura = this.assinaturasTokens.get(cenaId)
      this.assinaturasTokens.delete(cenaId)
      void assinatura?.then((cancelar) => cancelar?.().catch(() => undefined))
    }
  }

  private comecarTempoRealGeral() {
    if (this.tempoRealGeral || this.estaFechado) return
    this.tempoRealGeral = (async () => {
      try {
        this.guardarCancelamento(
          await this.cliente.assinar('cenas_batalha', { expressao: 'campanha = {:campanha}', valores: { campanha: this.campanhaId } }, (evento) => {
            const id = idDoRegistro(evento.registro)
            if (evento.acao === 'delete') {
              if (id) this.esquecerCena(id)
              this.avisarCenas()
              return
            }
            // A lista só muda com cena nova ou outro nome. Mudar a grade não pede a lista de novo.
            const nomeAntes = this.cenas.get(id)?.registro.nome
            this.receberCena(evento.registro, false)
            if (evento.acao === 'create' || nomeAntes === undefined || nomeAntes !== this.cenas.get(id)?.registro.nome) this.avisarCenas()
          }),
        )
        // A campanha avisa quando a cena ativa muda.
        this.guardarCancelamento(
          await this.cliente.assinar('campanhas', { expressao: 'id = {:id}', valores: { id: this.campanhaId } }, () => this.avisarCenas()),
        )
        this.guardarCancelamento(await this.cliente.aoReconectar(() => void this.buscarDepoisDeCair()))
      } catch {
        // Sem tempo real, as próprias mudanças continuam aparecendo. As dos outros, ao reabrir a aba.
      }
    })()
  }

  private guardarCancelamento(cancelar: Cancelar) {
    if (this.estaFechado) void cancelar().catch(() => undefined)
    else this.cancelamentos.push(cancelar)
  }

  /** Lê a lista de cenas e avisa. Pedidos seguidos viram uma leitura só, mais uma no fim se algo mudou no meio. */
  private avisarCenas() {
    if (!this.ouvintesCenas.size || this.estaFechado) return
    if (this.listando) {
      this.listarDeNovo = true
      return
    }
    this.listando = (async () => {
      do {
        this.listarDeNovo = false
        try {
          const cenas = await this.listarCenas()
          if (!this.estaFechado) for (const ouvinte of [...this.ouvintesCenas]) ouvinte(cenas)
        } catch {
          // Na próxima mudança ou reconexão tenta de novo.
        }
      } while (this.listarDeNovo && !this.estaFechado)
      this.listando = null
    })()
  }

  /** Uma cena que chegou do servidor. Avisa quem ouve a configuração dela, se ela mudou de verdade. */
  private receberCena(bruto: unknown, sempre: boolean) {
    if (this.estaFechado) return
    const registro = normalizarCenaBatalhaDoServidor(bruto)
    if (!registro || registro.campanha !== this.campanhaId) return
    const fila = this.filas.get(`config:${registro.id}`)
    if (fila && !sempre) {
      guardarSeMaisNovo(fila, bruto, registro.atualizado)
      return
    }
    const antes = this.cenas.get(registro.id)
    if (antes && !sempre) {
      if (maisVelha(registro.atualizado, antes.registro.atualizado)) return
      if (registro.atualizado !== '' && registro.atualizado === antes.registro.atualizado) return
    }
    if (antes) antes.registro = registro
    else this.cenas.set(registro.id, { registro, tokens: new Map() })
    const ouvintes = this.ouvintesConfig.get(registro.id)
    if (!ouvintes?.size) return
    void this.urlDoFundo(registro)
      .catch(() => null)
      .then((imagemUrl) => {
        if (this.estaFechado) return
        for (const ouvinte of [...ouvintes]) ouvinte({ nome: registro.nome, config: registro.config, imagemUrl })
      })
  }

  private receberEventoToken(cenaId: string, evento: EventoTempoReal) {
    if (this.estaFechado) return
    if (evento.acao === 'delete') {
      const registro = normalizarTokenBatalhaDoServidor(evento.registro)
      if (!registro || registro.cena !== cenaId) return
      const cena = this.cenas.get(cenaId)
      if (cena) cena.tokens.delete(registro.token.id)
      this.avisarToken(cenaId, { tipo: 'removido', idLocal: registro.token.id })
      return
    }
    this.receberToken(evento.registro)
  }

  /** Um token que chegou do servidor. Descarta aviso velho e eco da própria gravação. */
  private receberToken(bruto: unknown, sempre = false) {
    if (this.estaFechado) return
    const registro = normalizarTokenBatalhaDoServidor(bruto)
    if (!registro) return
    const fila = this.filas.get(`token:${registro.cena}:${registro.token.id}`)
    if (fila) {
      guardarSeMaisNovo(fila, bruto, registro.atualizado)
      return
    }
    const cena = this.cenas.get(registro.cena)
    const antes = cena?.tokens.get(registro.token.id)
    if (antes && !sempre) {
      if (maisVelha(registro.atualizado, antes.atualizado)) return
      if (registro.atualizado !== '' && registro.atualizado === antes.atualizado) return
    }
    cena?.tokens.set(registro.token.id, registro)
    this.avisarToken(registro.cena, { tipo: 'gravado', token: { ...registro.token } })
  }

  private avisarToken(cenaId: string, evento: EventoTokenBatalha) {
    const ouvintes = this.ouvintesTokens.get(cenaId)
    if (!ouvintes || this.estaFechado) return
    for (const ouvinte of [...ouvintes]) ouvinte(evento)
  }

  /** A conexão caiu e voltou: lê de novo a lista, as configurações e os tokens assinados, e avisa tudo. */
  private async buscarDepoisDeCair() {
    this.avisarCenas()
    for (const cenaId of new Set([...this.ouvintesConfig.keys(), ...this.ouvintesTokens.keys()])) {
      try {
        const [bruta, brutos] = await Promise.all([
          this.cliente.ler('cenas_batalha', cenaId),
          this.ouvintesTokens.has(cenaId) ? this.cliente.listar('tokens_batalha', { expressao: 'cena = {:cena}', valores: { cena: cenaId } }) : Promise.resolve(null),
        ])
        this.receberCena(bruta, true)
        if (!brutos) continue
        const vistos = new Set<string>()
        for (const bruto of brutos) {
          const registro = normalizarTokenBatalhaDoServidor(bruto)
          if (!registro) continue
          vistos.add(registro.token.id)
          this.receberToken(bruto, true)
        }
        const cena = this.cenas.get(cenaId)
        for (const idLocal of [...(cena?.tokens.keys() ?? [])]) {
          if (vistos.has(idLocal) || this.filas.has(`token:${cenaId}:${idLocal}`)) continue
          cena?.tokens.delete(idLocal)
          this.avisarToken(cenaId, { tipo: 'removido', idLocal })
        }
      } catch {
        // A cena pode ter saído (apagada, ou deixou de ser a ativa). A lista de cenas avisa isso.
      }
    }
  }

  // ---------- fundo ----------

  private guardarCena(bruto: unknown): RegistroCenaBatalha | null {
    const registro = normalizarCenaBatalhaDoServidor(bruto)
    if (!registro) throw new Error(BATALHA_INVALIDA)
    const antes = this.cenas.get(registro.id)
    if (antes) antes.registro = registro
    else this.cenas.set(registro.id, { registro, tokens: new Map() })
    return registro
  }

  /** O endereço local do fundo da cena, baixado uma vez por arquivo. */
  private urlDoFundo(registro: RegistroCenaBatalha): Promise<string | null> {
    if (!registro.fundo) {
      this.trocarFundo(registro.id, '', null)
      return Promise.resolve(null)
    }
    const conhecido = this.fundos.get(registro.id)
    if (conhecido && conhecido.arquivo === registro.fundo) return conhecido.endereco
    const endereco = this.pedir('abrir', () => this.cliente.baixarFundo(registro.id, registro.fundo)).then((arquivo) => {
      if (this.estaFechado) throw new Error(BATALHA_FECHADA)
      return this.enderecos.criar(arquivo)
    })
    this.trocarFundo(registro.id, registro.fundo, endereco)
    // Falhou: esquece, para a próxima tentativa baixar de novo.
    endereco.catch(() => {
      if (this.fundos.get(registro.id)?.endereco === endereco) this.fundos.delete(registro.id)
    })
    return endereco
  }

  /** Troca o fundo guardado de uma cena e libera o endereço do anterior. */
  private trocarFundo(cenaId: string, arquivo: string, endereco: Promise<string> | null) {
    const antes = this.fundos.get(cenaId)
    if (antes && antes.endereco !== endereco) void antes.endereco.then((e) => this.enderecos.liberar(e)).catch(() => undefined)
    if (endereco) this.fundos.set(cenaId, { arquivo, endereco })
    else this.fundos.delete(cenaId)
  }

  private esquecerCena(id: string) {
    this.cenas.delete(id)
    this.trocarFundo(id, '', null)
  }

  async fechar(): Promise<void> {
    if (this.estaFechado) return
    this.estaFechado = true
    this.ouvintesCenas.clear()
    this.ouvintesConfig.clear()
    this.ouvintesTokens.clear()
    for (const fila of this.filas.values()) {
      fila.proxima = null
      for (const e of fila.esperando.splice(0)) e.falha(new Error(BATALHA_FECHADA))
    }
    for (const id of [...this.fundos.keys()]) this.trocarFundo(id, '', null)
    const assinaturas = [...this.assinaturasTokens.values()]
    this.assinaturasTokens.clear()
    await Promise.all([
      ...this.cancelamentos.splice(0).map((cancelar) => cancelar().catch(() => undefined)),
      ...assinaturas.map((a) => a.then((cancelar) => cancelar?.().catch(() => undefined))),
    ])
  }
}

/** Guarda na fila o aviso mais novo que chegou durante a gravação. */
function guardarSeMaisNovo(fila: Fila, bruto: unknown, atualizado: string) {
  const guardado = fila.avisoGuardado
  const horaGuardada = typeof guardado === 'object' && guardado !== null && 'updated' in guardado && typeof guardado.updated === 'string' ? guardado.updated : ''
  if (!guardado || !maisVelha(atualizado, horaGuardada)) fila.avisoGuardado = bruto
}

function idDoRegistro(bruto: unknown): string {
  return typeof bruto === 'object' && bruto !== null && 'id' in bruto && typeof bruto.id === 'string' ? bruto.id : ''
}

function extensao(tipo: string): string {
  if (tipo === 'image/jpeg') return 'jpg'
  if (tipo === 'image/webp') return 'webp'
  return 'png'
}

