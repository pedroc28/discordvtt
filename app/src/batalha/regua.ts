// Régua do mapa de batalha: mede entre dois pontos pela grade, ou em linha reta se não há grade.
// Só local, como a do mapa hexagonal: cada pessoa mede o que quiser.

import { celulaEm, centroDaCelula, distanciaEmCelulas, temCelulas } from './grade'
import type { Grade, Medida, Ponto } from './tipos'

export interface Medicao {
  /** Distância em células (pode ter fração sem grade, ou com diagonal euclidiana). */
  celulas: number
  /** Distância no mundo do jogo: células vezes o valor de cada uma. */
  valor: number
  texto: string
  /** Os pontos que a régua desenha: com grade, os centros das células. */
  de: Ponto
  ate: Ponto
}

/** Número com no máximo uma casa, vírgula decimal e sem ",0" sobrando. */
export function numero(n: number): string {
  const r = Math.round(n * 10) / 10
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',')
}

export function medir(grade: Grade, medida: Medida, a: Ponto, b: Ponto): Medicao {
  let celulas: number
  let de = a
  let ate = b
  const ca = celulaEm(grade, a)
  const cb = celulaEm(grade, b)
  if (temCelulas(grade) && ca && cb) {
    de = centroDaCelula(grade, ca)
    ate = centroDaCelula(grade, cb)
    celulas = distanciaEmCelulas(grade, ca, cb, medida.diagonal)
  } else {
    celulas = Math.hypot(b.x - a.x, b.y - a.y) / grade.tamanho
  }
  const valor = celulas * medida.valorPorCelula
  const base = `${numero(celulas)} ${Math.round(celulas * 10) / 10 === 1 ? 'célula' : 'células'}`
  const texto = medida.unidade ? `${base}, ${numero(valor)} ${medida.unidade}` : base
  return { celulas, valor, texto, de, ate }
}
