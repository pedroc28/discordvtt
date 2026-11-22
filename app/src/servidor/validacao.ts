// Validação do que chega do PocketBase. O servidor pode estar numa versão diferente ou com
// dados antigos, então nada é usado sem passar por aqui. Registro inválido é descartado.

import { normalizarHexagono, normalizarRegiao } from '../mapa/armazenamento'
import type { Hexagono, Lote, Mudanca, MudancaRegiao, Regiao, TokenGrupo } from '../mapa/tipos'
import type { Campanha, LoteDoServidor, MapaDoServidor, Papel, Participacao, TokenDoServidor, Usuario } from './tipos'

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

/** E-mail da própria conta, que o servidor só devolve para a dona dela. */
export function emailDaConta(bruto: unknown): string | null {
  if (!ehObj(bruto) || typeof bruto.email !== 'string' || !bruto.email.includes('@')) return null
  return bruto.email
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

// ---------- mapa ----------
// Os hexágonos e as regiões passam pela mesma validação que o mapa usa para os dados do navegador
// (app/src/mapa/armazenamento.ts). Assim um campo novo do mapa é tratado igual nos dois lugares.

const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

export function normalizarMapaDoServidor(bruto: unknown): MapaDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, ultimaOrdem: inteiro(bruto.ultimaOrdem) && bruto.ultimaOrdem > 0 ? bruto.ultimaOrdem : 0 }
}

/** Hexágono guardado no servidor. A posição vale a do registro, que é a que o servidor indexou. */
export function normalizarHexagonoDoServidor(bruto: unknown): Hexagono | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r) || !ehObj(bruto.dados)) return null
  return normalizarHexagono({ ...bruto.dados, q: bruto.q, r: bruto.r })
}

export function normalizarRegiaoDoServidor(bruto: unknown): Regiao | null {
  if (!ehObj(bruto) || !id(bruto.regiaoId) || !ehObj(bruto.dados)) return null
  return normalizarRegiao({ ...bruto.dados, id: bruto.regiaoId })
}

function normalizarMudanca(bruto: unknown): Mudanca | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r)) return null
  const antes = bruto.antes === null || bruto.antes === undefined ? null : normalizarHexagono(bruto.antes)
  const depois = bruto.depois === null || bruto.depois === undefined ? null : normalizarHexagono(bruto.depois)
  // Um "depois" que não passa na validação não pode virar "apagar o hexágono".
  if (bruto.depois && !depois) return null
  if (depois && (depois.q !== bruto.q || depois.r !== bruto.r)) return null
  return { q: bruto.q, r: bruto.r, antes, depois }
}

function normalizarMudancaRegiao(bruto: unknown): MudancaRegiao | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  const antes = bruto.antes === null || bruto.antes === undefined ? null : normalizarRegiao(bruto.antes)
  const depois = bruto.depois === null || bruto.depois === undefined ? null : normalizarRegiao(bruto.depois)
  if (bruto.depois && !depois) return null
  if (depois && depois.id !== bruto.id) return null
  return { id: bruto.id, antes, depois }
}

/** Registro da coleção `lotes`, convertido para o `Lote` do mapa, com o número de ordem do servidor. */
export function normalizarLoteDoServidor(bruto: unknown): LoteDoServidor | null {
  if (!ehObj(bruto) || !inteiro(bruto.ordem) || bruto.ordem < 1 || !id(bruto.loteId)) return null
  const lote: Lote = {
    id: bruto.loteId,
    autor: typeof bruto.autor === 'string' ? bruto.autor : '',
    ts: typeof bruto.ts === 'number' && Number.isFinite(bruto.ts) ? bruto.ts : 0,
    mudancas: normalizarLista(bruto.mudancas, normalizarMudanca),
    regioes: normalizarLista(bruto.regioes, normalizarMudancaRegiao),
  }
  return { ordem: bruto.ordem, lote }
}

/** Registro da coleção `tokens_grupo`. Token fora do mapa vira null, como o mapa espera. */
export function normalizarTokenDoServidor(bruto: unknown): TokenDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  let token: TokenGrupo | null = null
  if (bruto.presente === true && inteiro(bruto.q) && inteiro(bruto.r)) {
    token = {
      q: bruto.q,
      r: bruto.r,
      ts: typeof bruto.ts === 'number' && Number.isFinite(bruto.ts) ? bruto.ts : 0,
      autor: typeof bruto.autor === 'string' ? bruto.autor : '',
    }
  }
  return { id: bruto.id, token }
}
