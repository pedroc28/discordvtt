// Validação do que chega do PocketBase. O servidor pode estar numa versão diferente ou com
// dados antigos, então nada é usado sem passar por aqui. Registro inválido é descartado.

import type { Campanha, Papel, Participacao, Usuario } from './tipos'

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const texto = (v: unknown, padrao: string) => (typeof v === 'string' && v.trim() ? v.trim() : padrao)

export function ehPapel(v: unknown): v is Papel {
  return v === 'mestre' || v === 'jogador'
}

export function normalizarUsuario(bruto: unknown): Usuario | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, nome: texto(bruto.name, 'Sem nome') }
}

export function normalizarCampanha(bruto: unknown): Campanha | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, nome: texto(bruto.nome, 'Campanha sem nome') }
}

export function normalizarParticipacao(bruto: unknown): Participacao | null {
  if (!ehObj(bruto) || !id(bruto.id) || !id(bruto.campanha) || !id(bruto.usuario) || !ehPapel(bruto.papel)) return null
  return { id: bruto.id, campanhaId: bruto.campanha, usuarioId: bruto.usuario, papel: bruto.papel }
}

/** Aplica a validação a uma lista, descartando o que não passar. */
export function normalizarLista<T>(brutos: unknown, normalizar: (bruto: unknown) => T | null): T[] {
  if (!Array.isArray(brutos)) return []
  return brutos.map(normalizar).filter((item): item is T => item !== null)
}
