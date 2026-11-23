// As rolagens da campanha guardadas no servidor: a implementação da RepositorioDados (contrato dos
// dados, app/src/dados/repositorio.ts) que fala com o PocketBase.
//
// Como funciona (detalhes em docs/servidor/README.md, seção "Dados"):
// - Rolar é criar um registro com a campanha e o dado. O servidor sorteia, grava quem rolou e devolve
//   o registro pronto. O app nunca manda o resultado: a regra recusa.
// - As rolagens de todos chegam pelo tempo real, inclusive a própria. Quando a conexão volta depois de
//   cair, o repositório busca as mais recentes de novo e avisa todas: quem ouve ignora as repetidas.
// - Rolagem secreta: fica em `rolagens_secretas`, que só os mestres leem. Para jogadores, ela não existe.
//
// O repositório não usa o SDK do PocketBase direto: recebe um ClienteDados, que o conexao.ts cria para
// a sessão atual. Assim os testes usam um servidor falso, e o SDK continua num arquivo só.

import { juntarRolagens } from '../dados/operacoes'
import type { OuvinteRolagem, RepositorioDados } from '../dados/repositorio'
import type { Lados, Rolagem } from '../dados/tipos'
import { DADOS_FECHADO, DADOS_INVALIDO, DADOS_SO_MESTRE, mensagemDeErroDados } from './erros'
import type { Cancelar, EventoTempoReal, FiltroServidor } from './repositorio-mapa'
import type { Papel } from './tipos'
import { normalizarRolagemDoServidor } from './validacao'

export type ColecaoDados = 'rolagens' | 'rolagens_secretas'

/** O que o repositório precisa do servidor. O conexao.ts implementa com o SDK, para a sessão atual. */
export interface ClienteDados {
  /** Endereço do servidor, para as mensagens de erro. */
  readonly endereco: string
  /** Os `quantos` registros mais novos que passam no filtro, do mais novo para o mais velho. */
  recentes(colecao: ColecaoDados, filtro: FiltroServidor, quantos: number): Promise<unknown[]>
  criar(colecao: ColecaoDados, dados: Record<string, unknown>): Promise<unknown>
  /** Assina as mudanças dos registros que passam no filtro. Devolve a função que cancela. */
  assinar(colecao: ColecaoDados, filtro: FiltroServidor, ouvinte: (evento: EventoTempoReal) => void): Promise<Cancelar>
  /** Chamado a cada vez que o tempo real conecta de novo, depois de cair. */
  aoReconectar(ouvinte: () => void): Promise<Cancelar>
}

/** Quantas rolagens buscar de novo quando a conexão volta. */
const BUSCA_AO_RECONECTAR = 30

export class RepositorioDadosPocketBase implements RepositorioDados {
  readonly compartilhado = true
  readonly campanhaId: string
  readonly papel: Papel
  private cliente: ClienteDados
  private ouvintes = new Set<OuvinteRolagem>()
  private cancelamentos: Cancelar[] = []
  private inicio: Promise<void> | null = null
  private estaFechado = false

  constructor(cliente: ClienteDados, campanhaId: string, opcoes: { papel?: Papel } = {}) {
    this.cliente = cliente
    this.campanhaId = campanhaId
    this.papel = opcoes.papel ?? 'jogador'
  }

  get podeRolarEmSegredo(): boolean {
    return this.papel === 'mestre'
  }

  get fechado(): boolean {
    return this.estaFechado
  }

  /** As coleções que esta pessoa lê: a das rolagens abertas e, para o mestre, a das secretas. */
  private get colecoes(): ColecaoDados[] {
    return this.podeRolarEmSegredo ? ['rolagens', 'rolagens_secretas'] : ['rolagens']
  }

  private get filtro(): FiltroServidor {
    return { expressao: 'campanha = {:campanha}', valores: { campanha: this.campanhaId } }
  }

  async rolar(lados: Lados, opcoes: { secreta?: boolean } = {}): Promise<Rolagem> {
    const secreta = opcoes.secreta === true
    if (this.estaFechado) throw new Error(DADOS_FECHADO)
    if (secreta && !this.podeRolarEmSegredo) throw new Error(DADOS_SO_MESTRE)
    let bruto: unknown
    try {
      // Só a campanha e o dado: quem rolou e o resultado, o servidor preenche.
      bruto = await this.cliente.criar(secreta ? 'rolagens_secretas' : 'rolagens', { campanha: this.campanhaId, lados })
    } catch (erro) {
      throw new Error(this.estaFechado ? DADOS_FECHADO : mensagemDeErroDados(erro, this.cliente.endereco, secreta))
    }
    if (this.estaFechado) throw new Error(DADOS_FECHADO)
    const rolagem = normalizarRolagemDoServidor(bruto, secreta)
    if (!rolagem) throw new Error(DADOS_INVALIDO)
    // A própria rolagem também chega pelo tempo real, mas pode demorar ou se perder se a conexão cair.
    this.entregar(rolagem)
    return rolagem
  }

  async recentes(quantas: number): Promise<Rolagem[]> {
    if (this.estaFechado) throw new Error(DADOS_FECHADO)
    try {
      const listas = await Promise.all(
        this.colecoes.map(async (colecao) => {
          const brutos = await this.cliente.recentes(colecao, this.filtro, quantas)
          const secreta = colecao === 'rolagens_secretas'
          return brutos.flatMap((bruto) => normalizarRolagemDoServidor(bruto, secreta) ?? [])
        }),
      )
      return juntarRolagens([], listas.flat(), quantas)
    } catch (erro) {
      throw new Error(this.estaFechado ? DADOS_FECHADO : mensagemDeErroDados(erro, this.cliente.endereco))
    }
  }

  assinar(ouvinte: OuvinteRolagem): () => void {
    this.ouvintes.add(ouvinte)
    if (!this.inicio && !this.estaFechado) this.inicio = this.comecarTempoReal()
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  private entregar(rolagem: Rolagem) {
    if (this.estaFechado) return
    for (const ouvinte of [...this.ouvintes]) ouvinte(rolagem)
  }

  private guardarCancelamento(cancelar: Cancelar) {
    // Fechou enquanto assinava: cancela na hora.
    if (this.estaFechado) void cancelar().catch(() => undefined)
    else this.cancelamentos.push(cancelar)
  }

  private async comecarTempoReal() {
    for (const colecao of this.colecoes) {
      const secreta = colecao === 'rolagens_secretas'
      try {
        const cancelar = await this.cliente.assinar(colecao, this.filtro, (evento) => {
          // Rolagem não muda nem some pelo app. A limpeza apaga direto no banco, sem aviso.
          if (evento.acao !== 'create') return
          const rolagem = normalizarRolagemDoServidor(evento.registro, secreta)
          if (rolagem) this.entregar(rolagem)
        })
        this.guardarCancelamento(cancelar)
      } catch {
        // Sem tempo real, a própria rolagem continua aparecendo. As dos outros aparecem ao reabrir a aba.
      }
    }
    try {
      const cancelar = await this.cliente.aoReconectar(() => void this.buscarDepoisDeCair())
      this.guardarCancelamento(cancelar)
    } catch {
      // idem
    }
  }

  /** A conexão caiu e voltou: alguma rolagem pode ter passado nesse meio-tempo. */
  private async buscarDepoisDeCair() {
    try {
      const recentes = await this.recentes(BUSCA_AO_RECONECTAR)
      // Da mais velha para a mais nova, como teriam chegado.
      for (const rolagem of [...recentes].reverse()) this.entregar(rolagem)
    } catch {
      // Na próxima reconexão tenta de novo.
    }
  }

  async fechar(): Promise<void> {
    if (this.estaFechado) return
    this.estaFechado = true
    this.ouvintes.clear()
    await Promise.all(this.cancelamentos.splice(0).map((cancelar) => cancelar().catch(() => undefined)))
  }
}
