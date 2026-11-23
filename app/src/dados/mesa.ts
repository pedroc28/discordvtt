// Estado da aba Dados, fora do React: o histórico, a última rolagem feita aqui e o dado que está
// rolando. A tela só lê o estado (useSyncExternalStore) e chama rolar.
//
// A mesa cria o repositório ao abrir e o fecha ao fechar, e pode abrir de novo depois: o React, em
// desenvolvimento, monta, desmonta e monta de novo cada tela para achar efeitos mal feitos.

import { juntarRolagens, TAMANHO_HISTORICO } from './operacoes'
import type { RepositorioDados } from './repositorio'
import type { Lados, Rolagem } from './tipos'

export interface EstadoMesa {
  /** As rolagens são da campanha, e não só deste aparelho. */
  compartilhado: boolean
  podeRolarEmSegredo: boolean
  /** Ainda buscando as últimas rolagens. */
  carregando: boolean
  /** Últimas rolagens de todos, da mais nova para a mais velha. */
  historico: Rolagem[]
  /** A última rolagem feita neste aparelho, que aparece grande. */
  ultima: Rolagem | null
  /** Dado que está rolando agora, à espera do resultado. */
  rolando: Lados | null
  /** Mensagem pronta para mostrar, dizendo o que aconteceu e o que fazer. */
  erro: string | null
}

export interface OpcoesMesa {
  /** Tempo mínimo (ms) de dado rolando, para a animação aparecer mesmo com resposta rápida. */
  esperaMinima?: number
}

const ESTADO_INICIAL: EstadoMesa = {
  compartilhado: false,
  podeRolarEmSegredo: false,
  carregando: true,
  historico: [],
  ultima: null,
  rolando: null,
  erro: null,
}

const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms))
const mensagem = (erro: unknown) => (erro instanceof Error && erro.message ? erro.message : 'aconteceu um erro inesperado. Tente de novo.')

export class MesaDados {
  private criarRepositorio: () => RepositorioDados
  private repositorio: RepositorioDados | null = null
  private atual: EstadoMesa = ESTADO_INICIAL
  private ouvintes = new Set<() => void>()
  private pararDeOuvir: (() => void) | null = null
  private esperaMinima: number
  // Sobe a cada abrir e fechar. Resposta de uma abertura antiga não muda mais nada.
  private sessao = 0
  // Sobe a cada rolagem pedida. Só a mais recente vira a rolagem grande.
  private pedido = 0
  // Rolagens deste aparelho que ainda não apareceram. Enquanto houver alguma, o que chega fica guardado,
  // para o histórico não mostrar o resultado antes da rolagem grande.
  private rolandoAgora = 0
  private guardadas: Rolagem[] = []

  /** `criarRepositorio` é chamado a cada abrir: o do servidor, na campanha, ou o deste aparelho. */
  constructor(criarRepositorio: () => RepositorioDados, opcoes: OpcoesMesa = {}) {
    this.criarRepositorio = criarRepositorio
    this.esperaMinima = opcoes.esperaMinima ?? 0
  }

  get estado(): EstadoMesa {
    return this.atual
  }

  assinar = (ouvinte: () => void) => {
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  private mudar(patch: Partial<EstadoMesa>) {
    this.atual = { ...this.atual, ...patch }
    for (const ouvinte of [...this.ouvintes]) ouvinte()
  }

  private receber(rolagens: Rolagem[]) {
    if (this.rolandoAgora > 0) {
      this.guardadas.push(...rolagens)
      return
    }
    this.mudar({ historico: juntarRolagens(this.atual.historico, rolagens) })
  }

  /** Cria o repositório, começa a ouvir as rolagens novas e busca as últimas. */
  async abrir() {
    if (this.repositorio) return
    const sessao = ++this.sessao
    const repositorio = this.criarRepositorio()
    this.repositorio = repositorio
    this.rolandoAgora = 0
    this.guardadas = []
    this.mudar({ ...ESTADO_INICIAL, compartilhado: repositorio.compartilhado, podeRolarEmSegredo: repositorio.podeRolarEmSegredo })
    // Ouve antes de buscar, para nenhuma rolagem cair no meio. As repetidas se juntam pelo id.
    this.pararDeOuvir = repositorio.assinar((rolagem) => {
      if (sessao === this.sessao) this.receber([rolagem])
    })
    try {
      const recentes = await repositorio.recentes(TAMANHO_HISTORICO)
      if (sessao !== this.sessao) return
      this.receber(recentes)
      this.mudar({ carregando: false })
    } catch (erro) {
      if (sessao !== this.sessao) return
      this.mudar({ carregando: false, erro: `Não consegui carregar as últimas rolagens: ${mensagem(erro)}` })
    }
  }

  /** Rola um dado. A rolagem secreta só vale para o mestre, e o servidor confere. */
  async rolar(lados: Lados, secreta = false) {
    const repositorio = this.repositorio
    if (!repositorio) return
    const sessao = this.sessao
    const pedido = ++this.pedido
    const inicio = Date.now()
    this.rolandoAgora++
    this.mudar({ rolando: lados, erro: null })
    try {
      const rolagem = await repositorio.rolar(lados, { secreta: secreta && this.atual.podeRolarEmSegredo })
      const falta = this.esperaMinima - (Date.now() - inicio)
      if (falta > 0) await esperar(falta)
      if (sessao !== this.sessao) return
      this.guardadas.push(rolagem)
      if (pedido === this.pedido) this.mudar({ ultima: rolagem, rolando: null })
    } catch (erro) {
      if (sessao !== this.sessao) return
      if (pedido === this.pedido) this.mudar({ rolando: null, erro: `Não consegui rolar: ${mensagem(erro)}` })
    } finally {
      if (sessao === this.sessao) {
        this.rolandoAgora--
        if (this.rolandoAgora === 0) {
          const guardadas = this.guardadas.splice(0)
          if (guardadas.length) this.receber(guardadas)
        }
      }
    }
  }

  limparErro() {
    if (this.atual.erro) this.mudar({ erro: null })
  }

  /** Para de ouvir e fecha o repositório. Resposta que chegar depois não muda mais nada. */
  async fechar() {
    const repositorio = this.repositorio
    if (!repositorio) return
    this.sessao++
    this.repositorio = null
    this.pararDeOuvir?.()
    this.pararDeOuvir = null
    await repositorio.fechar()
  }
}
