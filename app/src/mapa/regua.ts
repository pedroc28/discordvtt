// Régua de distância: dois toques medem quantos hexágonos há entre dois pontos.
// É só local (cada jogador mede o que quiser), então não passa pelo repositório nem pelo desfazer.

import { distancia, linha, type Hex } from './hex'

export interface Regua {
  a: Hex
  /** Null enquanto só o primeiro ponto foi escolhido. */
  b: Hex | null
}

/** Primeiro toque escolhe o início, o segundo o fim, o terceiro recomeça a medida. */
export function tocarRegua(atual: Regua | null, h: Hex): Regua {
  if (!atual || atual.b) return { a: h, b: null }
  return { a: atual.a, b: h }
}

export interface Medida {
  /** Passos de hexágono entre os dois pontos (hexágonos vizinhos = 1). */
  passos: number
  /** Hexágonos do caminho reto, incluindo os dois pontos. */
  caminho: Hex[]
}

export function medirRegua(a: Hex, b: Hex): Medida {
  return { passos: distancia(a, b), caminho: linha(a, b) }
}

export function textoDaMedida(passos: number): string {
  return passos === 1 ? '1 hexágono' : `${passos} hexágonos`
}
