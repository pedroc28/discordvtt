// Fila que põe os lotes do servidor na ordem certa antes de entregá-los ao mapa.
//
// O servidor numera cada lote (1, 2, 3...), e essa ordem é a verdade do mapa. Pelo tempo real, dois
// lotes gravados quase juntos podem chegar trocados, e um pode se perder se a conexão cair. A fila
// só entrega o lote N depois do N - 1, guarda os que chegam adiantados e diz quando falta algum.
// Funções puras: devolvem a fila nova e os lotes prontos, sem mudar a fila que receberam.

import type { Lote } from '../mapa/tipos'

export interface FilaLotes {
  /** Número do último lote entregue (ou o ponto de partida). Null enquanto não se sabe onde a numeração está. */
  ultima: number | null
  /** Lotes que chegaram antes de outro que ainda falta, esperando a vez. */
  espera: ReadonlyMap<number, Lote>
}

export interface ResultadoFila {
  fila: FilaLotes
  /** Lotes que podem ser entregues agora, na ordem. */
  prontos: Lote[]
}

export const filaVazia = (): FilaLotes => ({ ultima: null, espera: new Map() })

/** Entrega o que estiver em sequência a partir de `ultima`. */
function soltar(ultima: number | null, espera: Map<number, Lote>): ResultadoFila {
  const prontos: Lote[] = []
  if (ultima !== null) {
    let proximo = espera.get(ultima + 1)
    while (proximo) {
      espera.delete(ultima + 1)
      prontos.push(proximo)
      ultima++
      proximo = espera.get(ultima + 1)
    }
  }
  return { fila: { ultima, espera }, prontos }
}

/** Um lote que chegou (pelo tempo real, na resposta da gravação ou numa busca). Repetidos são ignorados. */
export function receberLote(fila: FilaLotes, ordem: number, lote: Lote): ResultadoFila {
  if ((fila.ultima !== null && ordem <= fila.ultima) || fila.espera.has(ordem)) return { fila, prontos: [] }
  const espera = new Map(fila.espera)
  espera.set(ordem, lote)
  return soltar(fila.ultima, espera)
}

/**
 * Diz onde a numeração está quando o mapa abre. Lotes até esse número já estão nos hexágonos que o
 * mapa vai carregar, então os que chegaram antes e não passam dele são descartados.
 */
export function definirInicio(fila: FilaLotes, ultima: number): ResultadoFila {
  const espera = new Map([...fila.espera].filter(([ordem]) => ordem > ultima))
  return soltar(ultima, espera)
}

/** Há lote esperando porque falta um antes dele. */
export const temBuraco = (fila: FilaLotes) => fila.ultima !== null && fila.espera.size > 0
