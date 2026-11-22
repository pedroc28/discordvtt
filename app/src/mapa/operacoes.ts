// Operações puras sobre o mapa. Não alteram nada: recebem um Leitor e devolvem mudanças.
// Quem aplica (e envia, e guarda para desfazer) é o controlador.

import type { Hex } from './hex'
import { chave } from './hex'
import type { Hexagono, Leitor, Lote, Mudanca } from './tipos'

export function hexagonoNovo(q: number, r: number, terreno: string): Hexagono {
  return { q, r, terreno, regiaoId: null, nome: '', nota: '', rev: 1 }
}

/** Pinta o terreno. Em hexágono que já existe só troca o terreno e mantém nome, nota e região. */
export function mudancasPintar(leitor: Leitor, hexes: readonly Hex[], terreno: string): Mudanca[] {
  const saida: Mudanca[] = []
  for (const { q, r } of hexes) {
    const antes = leitor.ler(q, r)
    if (!antes) {
      saida.push({ q, r, antes: null, depois: hexagonoNovo(q, r, terreno) })
    } else if (antes.terreno !== terreno) {
      saida.push({ q, r, antes, depois: { ...antes, terreno, rev: antes.rev + 1 } })
    }
  }
  return saida
}

export function mudancasApagar(leitor: Leitor, hexes: readonly Hex[]): Mudanca[] {
  const saida: Mudanca[] = []
  for (const { q, r } of hexes) {
    const antes = leitor.ler(q, r)
    if (antes) saida.push({ q, r, antes, depois: null })
  }
  return saida
}

/**
 * Junta mudanças em sequência no mesmo hexágono numa só: fica o primeiro "antes" e o último "depois".
 * É assim que uma pincelada que passa duas vezes pelo mesmo hexágono vira um passo só.
 */
export function fundirMudancas(sequencia: readonly Mudanca[]): Mudanca[] {
  const mapa = new Map<string, Mudanca>()
  for (const m of sequencia) {
    const k = chave(m.q, m.r)
    const existente = mapa.get(k)
    mapa.set(k, existente ? { q: m.q, r: m.r, antes: existente.antes, depois: m.depois } : m)
  }
  return [...mapa.values()].filter((m) => !(m.antes === null && m.depois === null))
}

/** Dois estados são "o mesmo" se ambos não existem ou têm a mesma revisão. */
function mesmoEstado(a: Hexagono | null, b: Hexagono | null): boolean {
  if (!a || !b) return a === b
  return a.rev === b.rev
}

export interface ResultadoDesfazer {
  /** Lote que desfaz (ou refaz) o original. Null se nada pôde ser revertido. */
  lote: Lote | null
  /** Hexágonos que não foram revertidos porque outra pessoa mexeu neles depois. */
  conflitos: number
}

/**
 * Monta o lote que desfaz `original`, de forma seletiva: só reverte os hexágonos que ainda
 * estão exatamente como o original os deixou. Se outra pessoa mexeu depois, esse hexágono é pulado.
 *
 * Refazer é desfazer o lote de reversão, então não precisa de função própria.
 */
export function reverterLote(
  leitor: Leitor,
  original: Lote,
  novoLote: { id: string; autor: string; ts: number },
): ResultadoDesfazer {
  const mudancas: Mudanca[] = []
  let conflitos = 0
  for (const m of original.mudancas) {
    const atual = leitor.ler(m.q, m.r)
    if (!mesmoEstado(atual, m.depois)) {
      conflitos++
      continue
    }
    if (!atual && !m.antes) continue
    const rev = Math.max(atual?.rev ?? 0, m.antes?.rev ?? 0) + 1
    mudancas.push({ q: m.q, r: m.r, antes: atual, depois: m.antes ? { ...m.antes, rev } : null })
  }
  return { lote: mudancas.length ? { ...novoLote, mudancas } : null, conflitos }
}
