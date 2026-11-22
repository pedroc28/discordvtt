// Cores da folha no modo escuro. O tema em si (claro, escuro ou sistema)
// fica no núcleo, compartilhado por todas as telas.

import type { Modelo } from './tipos'

export { useAparencia, type Tema } from '../nucleo/aparencia'

/** Luminância relativa de uma cor #rgb ou #rrggbb. Null se não der para ler. */
function luminancia(cor: string): number | null {
  const m = cor.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
}

export interface CoresFolha {
  fundo: string
  tinta: string
  destaque: string
  /** Verdadeiro quando as cores foram invertidas para o modo escuro. */
  invertida: boolean
}

/**
 * No modo escuro, troca papel e tinta do modelo: a tinta vira o papel e o papel vira a tinta.
 * Assim cada sistema mantém a própria paleta. Se o modelo já tem papel escuro, nada muda.
 */
export function coresDaFolha(m: Modelo, escura: boolean): CoresFolha {
  const original = { fundo: m.corFundo, tinta: m.corTinta, destaque: m.corDestaque, invertida: false }
  if (!escura) return original
  const lf = luminancia(m.corFundo)
  const lt = luminancia(m.corTinta)
  if (lf !== null && lt !== null && lf < lt) return original
  return {
    fundo: `color-mix(in oklab, ${m.corTinta} 90%, ${m.corFundo})`,
    tinta: `color-mix(in oklab, ${m.corFundo} 88%, ${m.corTinta})`,
    destaque: `color-mix(in oklab, ${m.corDestaque} 62%, white)`,
    invertida: true,
  }
}
