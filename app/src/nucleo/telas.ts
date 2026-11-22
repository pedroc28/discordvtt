// Descoberta automática das telas.
//
// Cada área tem um arquivo `tela.ts` na própria pasta (ex.: src/mapa/tela.ts) que exporta
// `tela`. O núcleo encontra todos sozinho, então criar uma tela nova não exige mexer
// em nenhum arquivo compartilhado. A ordem das abas vem de `ordem` (menor primeiro).

import type { ComponentType } from 'react'

export interface DefinicaoTela {
  /** Identificador estável, sem acento. É o que fica salvo como última tela aberta. */
  id: string
  /** Nome que aparece na aba. */
  nome: string
  /** Posição da aba: 10, 20, 30... Deixe espaço entre os números para encaixar outras. */
  ordem: number
  Componente: ComponentType
}

const modulos = import.meta.glob<{ tela?: DefinicaoTela }>('../*/tela.ts', { eager: true })

export const TELAS: DefinicaoTela[] = Object.values(modulos)
  .map((m) => m.tela)
  .filter((t): t is DefinicaoTela => !!t)
  .sort((a, b) => a.ordem - b.ordem)
