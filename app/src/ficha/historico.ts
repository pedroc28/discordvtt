// Desfazer e refazer do modelo.
// Alterações seguidas do mesmo "grupo" (ex.: digitar no inspetor) viram um passo só.

import type { Modelo } from './tipos'

export interface Historico {
  passado: Modelo[]
  presente: Modelo
  futuro: Modelo[]
  grupo: string | null
  tempo: number
}

export type AcaoHistorico =
  | { tipo: 'aplicar'; f: (m: Modelo) => Modelo; grupo?: string; tempo: number }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  | { tipo: 'substituir'; modelo: Modelo }

const LIMITE = 200
const JANELA_GRUPO = 1200

export function iniciarHistorico(modelo: Modelo): Historico {
  return { passado: [], presente: modelo, futuro: [], grupo: null, tempo: 0 }
}

export function reduzirHistorico(h: Historico, a: AcaoHistorico): Historico {
  switch (a.tipo) {
    case 'aplicar': {
      const novo = a.f(h.presente)
      if (novo === h.presente) return h
      const mesmoGrupo = !!a.grupo && a.grupo === h.grupo && a.tempo - h.tempo < JANELA_GRUPO
      if (mesmoGrupo) return { ...h, presente: novo, futuro: [], tempo: a.tempo }
      return {
        passado: [...h.passado, h.presente].slice(-LIMITE),
        presente: novo,
        futuro: [],
        grupo: a.grupo ?? null,
        tempo: a.tempo,
      }
    }
    case 'desfazer': {
      if (!h.passado.length) return h
      return {
        passado: h.passado.slice(0, -1),
        presente: h.passado[h.passado.length - 1],
        futuro: [h.presente, ...h.futuro],
        grupo: null,
        tempo: 0,
      }
    }
    case 'refazer': {
      if (!h.futuro.length) return h
      return {
        passado: [...h.passado, h.presente],
        presente: h.futuro[0],
        futuro: h.futuro.slice(1),
        grupo: null,
        tempo: 0,
      }
    }
    case 'substituir':
      return {
        passado: [...h.passado, h.presente].slice(-LIMITE),
        presente: a.modelo,
        futuro: [],
        grupo: null,
        tempo: 0,
      }
  }
}
