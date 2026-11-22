// Tema da interface (claro, escuro ou o do sistema) e as cores da folha no modo escuro.
// É preferência de quem está usando, então fica no navegador e não vai para o modelo.

import { useEffect, useState } from 'react'
import type { Modelo } from './tipos'

export type Tema = 'sistema' | 'claro' | 'escuro'

export interface Aparencia {
  tema: Tema
  /** No modo escuro, mantém a folha com as cores originais do modelo. */
  folhaClara: boolean
}

const CHAVE = 'fichas:aparencia'
const CONSULTA_ESCURO = '(prefers-color-scheme: dark)'

function carregar(): Aparencia {
  const padrao: Aparencia = { tema: 'sistema', folhaClara: false }
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Aparencia>
    return {
      tema: bruto.tema === 'claro' || bruto.tema === 'escuro' ? bruto.tema : 'sistema',
      folhaClara: bruto.folhaClara === true,
    }
  } catch {
    return padrao
  }
}

const sistemaPrefereEscuro = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(CONSULTA_ESCURO).matches

export function useAparencia() {
  const [aparencia, setAparencia] = useState(carregar)
  const [sistemaEscuro, setSistemaEscuro] = useState(sistemaPrefereEscuro)

  useEffect(() => {
    if (!window.matchMedia) return
    const consulta = window.matchMedia(CONSULTA_ESCURO)
    const mudou = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches)
    consulta.addEventListener('change', mudou)
    return () => consulta.removeEventListener('change', mudou)
  }, [])

  const escuro = aparencia.tema === 'escuro' || (aparencia.tema === 'sistema' && sistemaEscuro)

  useEffect(() => {
    document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro'
  }, [escuro])

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(aparencia))
    } catch {
      // sem armazenamento: o tema só vale até fechar a página
    }
  }, [aparencia])

  return {
    ...aparencia,
    escuro,
    mudar: (patch: Partial<Aparencia>) => setAparencia((a) => ({ ...a, ...patch })),
  }
}

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
