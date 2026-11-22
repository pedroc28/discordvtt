// Conexão do app com o PocketBase: login, campanhas e participantes.
// É o único lugar do app que fala com o servidor (ver o CLAUDE.md da área). A tela só lê
// o estado com useServidor() e chama os métodos de `conexao`.

import PocketBase, { LocalAuthStore } from 'pocketbase'
import { useSyncExternalStore } from 'react'
import { ENDERECO_PADRAO, enderecoDoLink, normalizarEndereco, semParametroDoServidor } from './endereco'
import { mensagemDeErro, type Acao } from './erros'
import { campanhaValida, limparNomeCampanha, montarCampanhas, montarParticipantes, problemaNaNovaSenha } from './operacoes'
import type { EstadoServidor, FaseConexao, Papel } from './tipos'
import { emailDaConta, normalizarCampanha, normalizarLista, normalizarParticipacao, normalizarUsuario } from './validacao'

const CHAVE_ENDERECO = 'servidor:endereco'
// Sessão e campanha escolhida ficam separadas por servidor: trocar de endereço não mistura contas.
const chaveSessao = (endereco: string) => `servidor:sessao:${endereco}`
const chaveCampanha = (endereco: string) => `servidor:campanha:${endereco}`

// Várias mudanças chegando juntas pelo tempo real viram uma recarga só.
const ESPERA_RECARGA = 250

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    // sem armazenamento: só não lembra na próxima vez
  }
}

function criarCliente(endereco: string): PocketBase {
  const pb = new PocketBase(endereco, new LocalAuthStore(chaveSessao(endereco)))
  // Por padrão o SDK cancela pedidos repetidos, e as recargas pelo tempo real se sobrepõem.
  pb.autoCancellation(false)
  return pb
}

function estadoVazio(endereco: string, fase: FaseConexao, sessaoSalva: boolean): EstadoServidor {
  return {
    fase,
    endereco,
    usuario: null,
    campanhas: [],
    campanhaAtualId: null,
    participantes: [],
    usuarios: [],
    ocupado: false,
    erro: null,
    aviso: null,
    semResposta: false,
    sessaoSalva,
  }
}

const statusDe = (erro: unknown) =>
  typeof erro === 'object' && erro !== null && 'status' in erro && typeof erro.status === 'number' ? erro.status : -1

export class ConexaoServidor {
  private pb: PocketBase
  private atual: EstadoServidor
  private ouvintes = new Set<() => void>()
  private cancelamentos: Array<() => Promise<void>> = []
  private timerRecarga: ReturnType<typeof setTimeout> | null = null
  private iniciado = false
  // Sobe a cada login, saída ou troca de servidor. Resposta de uma geração antiga é ignorada,
  // para um pedido lento não trazer de volta dados de quem já saiu.
  private geracao = 0
  // Sobe a cada recarga. Só a mais recente pode mudar a tela.
  private ultimaCarga = 0

  constructor() {
    // O link de convite (?servidor=) vale mais que o endereço guardado. Ele é guardado na hora
    // e sai do endereço da página, para recarregar não trocar de servidor de novo.
    const doLink = typeof window === 'undefined' ? null : enderecoDoLink(window.location.search)
    if (doLink) {
      gravar(CHAVE_ENDERECO, doLink)
      try {
        window.history.replaceState(window.history.state, '', semParametroDoServidor(window.location.href))
      } catch {
        // o endereço da página só não fica limpo
      }
    }
    const endereco = doLink ?? normalizarEndereco(ler(CHAVE_ENDERECO) ?? '') ?? ENDERECO_PADRAO
    this.pb = criarCliente(endereco)
    this.atual = estadoVazio(endereco, 'iniciando', false)
  }

  get estado(): EstadoServidor {
    return this.atual
  }

  assinar = (ouvinte: () => void) => {
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  private mudar(patch: Partial<EstadoServidor>) {
    this.atual = { ...this.atual, ...patch }
    for (const ouvinte of [...this.ouvintes]) ouvinte()
  }

  /** Retoma a sessão guardada neste navegador, se houver. Chamar de novo não faz nada. */
  async iniciar() {
    if (this.iniciado) return
    this.iniciado = true
    await this.retomarSessao()
  }

  /** Tenta de novo retomar a sessão ou recarregar os dados, depois de o servidor não responder. */
  async tentarDeNovo() {
    if (this.atual.fase === 'conectado') {
      await this.recarregar()
      return
    }
    await this.retomarSessao()
  }

  private async retomarSessao() {
    if (!this.pb.authStore.isValid) {
      this.mudar({ fase: 'desconectado', sessaoSalva: false })
      return
    }
    const geracao = ++this.geracao
    this.mudar({ fase: 'entrando', ocupado: true, erro: null, aviso: null })
    try {
      // Confere no servidor se a sessão ainda vale e renova o prazo dela.
      await this.pb.collection('users').authRefresh()
      if (geracao !== this.geracao) return
      await this.depoisDeEntrar(geracao)
    } catch (erro) {
      if (geracao !== this.geracao) return
      // Com 401 o SDK já apagou a sessão. Sem resposta, ela fica guardada para tentar de novo.
      this.mudar({
        ...estadoVazio(this.atual.endereco, 'desconectado', this.pb.authStore.isValid),
        erro: mensagemDeErro(erro, 'entrar', this.atual.endereco),
      })
    }
  }

  /** Entra no servidor do endereço informado. O endereço fica guardado para a próxima vez. */
  async entrar(textoEndereco: string, email: string, senha: string) {
    if (this.atual.ocupado) return
    const endereco = normalizarEndereco(textoEndereco)
    if (!endereco) {
      this.mudar({ erro: 'Esse endereço não parece válido. Use algo como http://127.0.0.1:8090 ou https://nome-do-pc.ts.net.' })
      return
    }
    if (!email.trim() || !senha) {
      this.mudar({ erro: 'Preencha o e-mail e a senha.' })
      return
    }
    if (endereco !== this.atual.endereco) this.trocarCliente(endereco)
    gravar(CHAVE_ENDERECO, endereco)

    const geracao = ++this.geracao
    this.mudar({ fase: 'entrando', ocupado: true, erro: null, aviso: null })
    try {
      await this.pb.collection('users').authWithPassword(email.trim(), senha)
      if (geracao !== this.geracao) return
      await this.depoisDeEntrar(geracao)
    } catch (erro) {
      if (geracao !== this.geracao) return
      this.pb.authStore.clear()
      this.mudar({ ...estadoVazio(endereco, 'desconectado', false), erro: mensagemDeErro(erro, 'entrar', endereco) })
    }
  }

  private async depoisDeEntrar(geracao: number) {
    const usuario = normalizarUsuario(this.pb.authStore.record)
    if (!usuario) throw new Error('O servidor devolveu uma conta sem identificação.')
    this.mudar({ usuario, sessaoSalva: false })
    await this.carregar(geracao)
    if (geracao !== this.geracao) return
    this.mudar({ fase: 'conectado', ocupado: false })
    void this.assinarMudancas(geracao)
  }

  /** Sai do servidor neste navegador. As fichas e o mapa locais continuam como estão. */
  sair() {
    this.geracao++
    this.pararAssinaturas()
    this.pb.authStore.clear()
    this.mudar({ ...estadoVazio(this.atual.endereco, 'desconectado', false), aviso: 'Você saiu do servidor.' })
  }

  private trocarCliente(endereco: string) {
    this.geracao++
    this.pararAssinaturas()
    this.pb.cancelAllRequests()
    this.pb = criarCliente(endereco)
    this.mudar({ endereco })
  }

  // ---------- leitura ----------

  /** Busca de novo campanhas, contas e participantes da campanha aberta. */
  private async carregar(geracao: number) {
    const usuario = this.atual.usuario
    if (!usuario) return
    const carga = ++this.ultimaCarga
    const valida = () => geracao === this.geracao && carga === this.ultimaCarga

    const [campanhasBrutas, minhasBrutas, usuariosBrutos] = await Promise.all([
      this.pb.collection('campanhas').getFullList({ sort: 'nome' }),
      this.pb.collection('participantes').getFullList({ filter: this.pb.filter('usuario = {:u}', { u: usuario.id }) }),
      this.pb.collection('users').getFullList({ fields: 'id,name' }),
    ])
    if (!valida()) return

    const campanhas = montarCampanhas(normalizarLista(campanhasBrutas, normalizarCampanha), normalizarLista(minhasBrutas, normalizarParticipacao))
    const usuarios = normalizarLista(usuariosBrutos, normalizarUsuario)
    const endereco = this.atual.endereco
    const campanhaAtualId = campanhaValida(this.atual.campanhaAtualId ?? ler(chaveCampanha(endereco)), campanhas)

    let participantes = this.atual.participantes
    if (campanhaAtualId) {
      const brutos = await this.pb.collection('participantes').getFullList({ filter: this.pb.filter('campanha = {:c}', { c: campanhaAtualId }) })
      if (!valida()) return
      participantes = montarParticipantes(normalizarLista(brutos, normalizarParticipacao), usuarios, usuario.id)
    } else {
      participantes = []
    }
    gravar(chaveCampanha(endereco), campanhaAtualId)
    this.mudar({ campanhas, usuarios, campanhaAtualId, participantes, semResposta: false })
  }

  private async recarregar() {
    const geracao = this.geracao
    try {
      await this.carregar(geracao)
    } catch (erro) {
      if (geracao !== this.geracao) return
      this.tratarFalhaDeLeitura(erro)
    }
  }

  private tratarFalhaDeLeitura(erro: unknown) {
    const status = statusDe(erro)
    if (status === 401 || !this.pb.authStore.isValid) {
      this.sessaoExpirou()
      return
    }
    if (status === 0) this.mudar({ semResposta: true })
    else this.mudar({ erro: mensagemDeErro(erro, 'carregar', this.atual.endereco) })
  }

  private sessaoExpirou() {
    this.geracao++
    this.pararAssinaturas()
    this.pb.authStore.clear()
    this.mudar({ ...estadoVazio(this.atual.endereco, 'desconectado', false), erro: 'Sua sessão expirou. Entre de novo.' })
  }

  private agendarRecarga() {
    if (this.timerRecarga) clearTimeout(this.timerRecarga)
    this.timerRecarga = setTimeout(() => {
      this.timerRecarga = null
      void this.recarregar()
    }, ESPERA_RECARGA)
  }

  // ---------- tempo real ----------

  private async assinarMudancas(geracao: number) {
    // O servidor só avisa sobre registros que a pessoa pode ver, então qualquer aviso
    // é motivo para recarregar: alguém entrou, saiu, mudou de papel ou renomeou a campanha.
    const assinaturas: Array<[string, string]> = [
      ['campanhas', '*'],
      ['participantes', '*'],
    ]
    for (const [colecao, topico] of assinaturas) {
      try {
        const cancelar = await this.pb.collection(colecao).subscribe(topico, () => this.agendarRecarga())
        if (geracao !== this.geracao) {
          void cancelar()
          return
        }
        this.cancelamentos.push(cancelar)
      } catch {
        // Sem tempo real, a tela continua funcionando e atualiza depois de cada ação.
      }
    }
    try {
      // PB_CONNECT chega a cada reconexão. Algo pode ter mudado enquanto a conexão estava fora.
      const cancelar = await this.pb.realtime.subscribe('PB_CONNECT', () => {
        if (this.atual.semResposta) this.agendarRecarga()
      })
      if (geracao !== this.geracao) {
        void cancelar()
        return
      }
      this.cancelamentos.push(cancelar)
    } catch {
      // idem
    }
    this.pb.realtime.onDisconnect = (ativas) => {
      if (geracao === this.geracao && ativas.length > 0) this.mudar({ semResposta: true })
    }
  }

  private pararAssinaturas() {
    if (this.timerRecarga) clearTimeout(this.timerRecarga)
    this.timerRecarga = null
    for (const cancelar of this.cancelamentos.splice(0)) void cancelar().catch(() => undefined)
    this.pb.realtime.onDisconnect = undefined
  }

  // ---------- ações ----------

  /** Faz uma mudança no servidor e recarrega. Devolve se deu certo, para a tela limpar o formulário. */
  private async agir(acao: Acao, fazer: () => Promise<void>, aviso: string): Promise<boolean> {
    if (this.atual.ocupado || this.atual.fase !== 'conectado') return false
    const geracao = this.geracao
    this.mudar({ ocupado: true, erro: null, aviso: null })
    try {
      await fazer()
      if (geracao !== this.geracao) return false
      await this.carregar(geracao)
      if (geracao !== this.geracao) return false
      this.mudar({ ocupado: false, aviso })
      return true
    } catch (erro) {
      if (geracao !== this.geracao) return false
      if (statusDe(erro) === 401) {
        this.sessaoExpirou()
        return false
      }
      this.mudar({ ocupado: false, erro: mensagemDeErro(erro, acao, this.atual.endereco) })
      // Talvez outra pessoa tenha mudado algo antes: mostra o que vale agora.
      this.agendarRecarga()
      return false
    }
  }

  escolherCampanha(id: string) {
    if (id === this.atual.campanhaAtualId || !this.atual.campanhas.some((c) => c.id === id)) return
    gravar(chaveCampanha(this.atual.endereco), id)
    this.mudar({ campanhaAtualId: id, participantes: [], erro: null, aviso: null })
    void this.recarregar()
  }

  async criarCampanha(nome: string): Promise<boolean> {
    const limpo = limparNomeCampanha(nome)
    if (!limpo) {
      this.mudar({ erro: 'Dê um nome à campanha, com até 80 letras.', aviso: null })
      return false
    }
    return this.agir(
      'criar',
      async () => {
        // O servidor torna quem cria mestre da campanha (ver pocketbase/pb_hooks/campanhas.pb.js).
        const criada = normalizarCampanha(await this.pb.collection('campanhas').create({ nome: limpo }))
        if (criada) {
          gravar(chaveCampanha(this.atual.endereco), criada.id)
          this.mudar({ campanhaAtualId: criada.id })
        }
      },
      `Campanha "${limpo}" criada. Você é o mestre dela.`,
    )
  }

  async renomearCampanha(nome: string): Promise<boolean> {
    const id = this.atual.campanhaAtualId
    const limpo = limparNomeCampanha(nome)
    if (!id) return false
    if (!limpo) {
      this.mudar({ erro: 'Dê um nome à campanha, com até 80 letras.', aviso: null })
      return false
    }
    return this.agir(
      'renomear',
      async () => {
        await this.pb.collection('campanhas').update(id, { nome: limpo })
      },
      `Campanha renomeada para "${limpo}".`,
    )
  }

  async apagarCampanha(): Promise<boolean> {
    const id = this.atual.campanhaAtualId
    const campanha = this.atual.campanhas.find((c) => c.id === id)
    if (!id || !campanha) return false
    return this.agir(
      'apagar',
      async () => {
        await this.pb.collection('campanhas').delete(id)
        this.mudar({ campanhaAtualId: null })
      },
      `Campanha "${campanha.nome}" apagada.`,
    )
  }

  async adicionarParticipante(usuarioId: string, papel: Papel): Promise<boolean> {
    const campanha = this.atual.campanhaAtualId
    const nome = this.atual.usuarios.find((u) => u.id === usuarioId)?.nome ?? 'A pessoa'
    if (!campanha) return false
    return this.agir(
      'adicionar',
      async () => {
        await this.pb.collection('participantes').create({ campanha, usuario: usuarioId, papel })
      },
      `${nome} entrou na campanha como ${papel}.`,
    )
  }

  async mudarPapel(participacaoId: string, papel: Papel): Promise<boolean> {
    const alvo = this.atual.participantes.find((p) => p.id === participacaoId)
    if (!alvo || alvo.papel === papel) return false
    return this.agir(
      'papel',
      async () => {
        // Só o papel: a regra do servidor recusa mudar a campanha ou a pessoa de uma participação.
        await this.pb.collection('participantes').update(participacaoId, { papel })
      },
      `${alvo.nome} agora é ${papel}.`,
    )
  }

  async removerParticipante(participacaoId: string): Promise<boolean> {
    const alvo = this.atual.participantes.find((p) => p.id === participacaoId)
    if (!alvo) return false
    const saindo = alvo.euMesmo
    return this.agir(
      saindo ? 'sair-da-campanha' : 'remover',
      async () => {
        await this.pb.collection('participantes').delete(participacaoId)
        if (saindo) this.mudar({ campanhaAtualId: null })
      },
      saindo ? 'Você saiu da campanha.' : `${alvo.nome} saiu da campanha.`,
    )
  }

  /**
   * Troca a senha da própria conta. A mensagem volta para a tela mostrar junto do formulário,
   * que fica no fim da página, longe da área de mensagens do topo.
   */
  async trocarSenha(atual: string, nova: string, confirmacao: string): Promise<ResultadoSenha> {
    if (this.atual.ocupado || this.atual.fase !== 'conectado') {
      return { ok: false, erro: 'Espere a ação anterior terminar e tente de novo.' }
    }
    const problema = problemaNaNovaSenha(atual, nova, confirmacao)
    if (problema) return { ok: false, erro: problema }
    const usuario = this.atual.usuario
    const email = emailDaConta(this.pb.authStore.record)
    if (!usuario || !email) return { ok: false, erro: mensagemDeErro(null, 'senha', this.atual.endereco) }

    const geracao = this.geracao
    let trocou = false
    this.mudar({ ocupado: true, erro: null, aviso: null })
    try {
      await this.pb.collection('users').update(usuario.id, { oldPassword: atual, password: nova, passwordConfirm: confirmacao })
      trocou = true
      // O PocketBase invalida todas as sessões da conta quando a senha muda, inclusive esta.
      // Entrar de novo com a senha nova mantém a pessoa conectada aqui.
      await this.pb.collection('users').authWithPassword(email, nova)
      if (geracao !== this.geracao) return { ok: false, erro: '' }
      // As assinaturas do tempo real foram feitas com a sessão antiga.
      this.pararAssinaturas()
      void this.assinarMudancas(geracao)
      this.mudar({ ocupado: false })
      return { ok: true, aviso: 'Senha trocada. Nos outros aparelhos, entre de novo com a senha nova.' }
    } catch (erro) {
      if (geracao !== this.geracao) return { ok: false, erro: '' }
      if (trocou || statusDe(erro) === 401) {
        // Sem sessão válida, a tela volta para o login e mostra a mensagem lá em cima.
        this.sessaoExpirou()
        if (trocou) this.mudar({ erro: 'Sua senha foi trocada. Entre de novo com a senha nova.' })
        return { ok: false, erro: '' }
      }
      this.mudar({ ocupado: false })
      return { ok: false, erro: mensagemDeErro(erro, 'senha', this.atual.endereco) }
    }
  }

  /** Esconde a mensagem de erro ou de aviso. */
  limparMensagens() {
    if (this.atual.erro || this.atual.aviso) this.mudar({ erro: null, aviso: null })
  }
}

export type ResultadoSenha = { ok: true; aviso: string } | { ok: false; erro: string }

export const conexao = new ConexaoServidor()

/** Estado da conexão com o servidor. Atualiza sozinho a cada mudança. */
export function useServidor(): EstadoServidor {
  return useSyncExternalStore(conexao.assinar, () => conexao.estado)
}
