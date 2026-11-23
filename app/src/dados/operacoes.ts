// Funções puras da rolagem de dados: sorteio local, histórico e textos.

import { LADOS, type Lados, type Rolagem } from './tipos'

/** Quantas rolagens o histórico mostra. */
export const TAMANHO_HISTORICO = 30

export function ehLados(valor: unknown): valor is Lados {
  return typeof valor === 'number' && (LADOS as readonly number[]).includes(valor)
}

/**
 * Sorteia de 1 a `lados` a partir de bytes aleatórios (0 a 255), com a mesma chance para cada face.
 * Bytes do fim da faixa que não completam uma volta inteira de faces são descartados: sem isso, as
 * faces mais baixas sairiam um pouco mais (256 não é múltiplo de 6, 10, 12 nem 20).
 */
export function sortearComBytes(lados: Lados, proximoByte: () => number): number {
  const limite = 256 - (256 % lados)
  for (;;) {
    const byte = proximoByte()
    if (byte < limite) return (byte % lados) + 1
  }
}

/** Junta rolagens novas ao histórico, sem repetir, da mais nova para a mais velha, até o tamanho do histórico. */
export function juntarRolagens(historico: readonly Rolagem[], novas: readonly Rolagem[], limite = TAMANHO_HISTORICO): Rolagem[] {
  const porId = new Map<string, Rolagem>()
  for (const r of [...historico, ...novas]) porId.set(r.id, r)
  return [...porId.values()].sort((a, b) => b.quando - a.quando || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, limite)
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** Hora da rolagem: "21:07" se foi hoje, "22/11 21:07" se foi em outro dia. */
export function formatarHora(quando: number, agora: number): string {
  const data = new Date(quando)
  const hoje = new Date(agora)
  const hora = `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
  const mesmoDia = data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth() && data.getDate() === hoje.getDate()
  return mesmoDia ? hora : `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} ${hora}`
}

/** Nome de quem rolou, para o histórico. A própria pessoa e a rolagem local aparecem como "Você". */
export function nomeDeQuemRolou(autorId: string, eu: string | null, contas: ReadonlyArray<{ id: string; nome: string }>): string {
  if (!autorId || autorId === eu) return 'Você'
  return contas.find((c) => c.id === autorId)?.nome ?? 'Alguém'
}

export type Extremo = 'maximo' | 'minimo' | null

/** Tirou a face mais alta ou a mais baixa do dado. No d2 as duas faces são extremos, então não marca. */
export function extremo(rolagem: Pick<Rolagem, 'lados' | 'resultado'>): Extremo {
  if (rolagem.lados === 2) return null
  if (rolagem.resultado === rolagem.lados) return 'maximo'
  if (rolagem.resultado === 1) return 'minimo'
  return null
}

/** Frase para o leitor de tela anunciar a rolagem. */
export function descreverRolagem(rolagem: Rolagem, nome: string): string {
  const marca = extremo(rolagem) === 'maximo' ? ', o máximo' : extremo(rolagem) === 'minimo' ? ', o mínimo' : ''
  const segredo = rolagem.secreta ? ', em segredo' : ''
  return `${nome} tirou ${rolagem.resultado} no d${rolagem.lados}${marca}${segredo}.`
}
