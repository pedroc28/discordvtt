// Contrato de armazenamento das rolagens (ver docs/contratos.md, "Dados").
//
// Duas implementações: a local (local.ts), que rola só neste aparelho, e a do servidor
// (app/src/servidor/repositorio-dados.ts), em que o servidor sorteia e a campanha toda vê.

import type { Lados, Rolagem } from './tipos'

export type OuvinteRolagem = (rolagem: Rolagem) => void

export interface RepositorioDados {
  /** As rolagens são da campanha (todos que participam veem), e não só deste aparelho. */
  readonly compartilhado: boolean
  /** Quem usa pode rolar em segredo: é mestre da campanha. */
  readonly podeRolarEmSegredo: boolean
  /**
   * Rola um dado e devolve a rolagem pronta. Falha com um Error cuja mensagem diz a causa e o que
   * fazer, começando com letra minúscula (a tela mostra "Não consegui rolar: ...").
   */
  rolar(lados: Lados, opcoes?: { secreta?: boolean }): Promise<Rolagem>
  /** As rolagens mais novas, até `quantas`, da mais nova para a mais velha. */
  recentes(quantas: number): Promise<Rolagem[]>
  /**
   * Avisa cada rolagem nova, de qualquer pessoa, inclusive as próprias. Depois de a conexão cair e
   * voltar, avisa de novo as mais recentes, para nenhuma se perder: quem ouve ignora as repetidas
   * pelo id. Devolve a função que para de ouvir.
   */
  assinar(ouvinte: OuvinteRolagem): () => void
  /** Para de ouvir o servidor. Depois disso, rolar falha. */
  fechar(): Promise<void>
}
