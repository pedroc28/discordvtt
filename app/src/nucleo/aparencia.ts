// Tema da interface (claro, escuro ou o do sistema), compartilhado por todas as telas.
// É preferência de quem está usando, então fica no navegador e não vai para o servidor.
// Um único estado para o app inteiro: trocar o tema numa tela atualiza todas na hora.

import { useSyncExternalStore } from 'react'

export type Tema = 'sistema' | 'claro' | 'escuro'

export interface Aparencia {
  tema: Tema
  /** No modo escuro, mantém a folha das fichas com as cores originais do modelo. */
  folhaClara: boolean
}

export interface EstadoAparencia extends Aparencia {
  /** O tema que está valendo agora, já resolvido o "sistema". */
  escuro: boolean
}

// A chave antiga continua a mesma para ninguém perder a preferência salva.
const CHAVE = 'fichas:aparencia'
const CONSULTA_ESCURO = '(prefers-color-scheme: dark)'

function carregar(): Aparencia {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Aparencia>
    return {
      tema: bruto.tema === 'claro' || bruto.tema === 'escuro' ? bruto.tema : 'sistema',
      folhaClara: bruto.folhaClara === true,
    }
  } catch {
    return { tema: 'sistema', folhaClara: false }
  }
}

const temJanela = typeof window !== 'undefined'
const consulta = temJanela && window.matchMedia ? window.matchMedia(CONSULTA_ESCURO) : null

let aparencia = carregar()
let estado = resolver()
const ouvintes = new Set<() => void>()

function resolver(): EstadoAparencia {
  const sistemaEscuro = consulta?.matches ?? false
  return { ...aparencia, escuro: aparencia.tema === 'escuro' || (aparencia.tema === 'sistema' && sistemaEscuro) }
}

function aplicar() {
  estado = resolver()
  if (temJanela) document.documentElement.dataset.tema = estado.escuro ? 'escuro' : 'claro'
  for (const ouvinte of ouvintes) ouvinte()
}

export function mudarAparencia(patch: Partial<Aparencia>) {
  aparencia = { ...aparencia, ...patch }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(aparencia))
  } catch {
    // sem armazenamento: o tema só vale até fechar a página
  }
  aplicar()
}

consulta?.addEventListener('change', aplicar)
aplicar()

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function useAparencia() {
  const atual = useSyncExternalStore(assinar, () => estado, () => estado)
  return { ...atual, mudar: mudarAparencia }
}
