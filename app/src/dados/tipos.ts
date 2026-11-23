// Formato das rolagens de dados. Tudo o que vem de fora (servidor) passa por validação antes de
// virar um destes tipos.

/** Os dados clássicos de RPG, um botão para cada. O servidor aceita só estes. */
export const LADOS = [2, 4, 6, 8, 10, 12, 20] as const

export type Lados = (typeof LADOS)[number]

export interface Rolagem {
  id: string
  /** Id da conta de quem rolou. Na rolagem só neste aparelho, fica vazio. */
  autorId: string
  lados: Lados
  /** De 1 a `lados`. */
  resultado: number
  /** Hora da rolagem, em milissegundos desde 1970. */
  quando: number
  /** Rolagem secreta do mestre: só os mestres da campanha veem. */
  secreta: boolean
}
