// Validação do que chega do PocketBase. O servidor pode estar numa versão diferente ou com
// dados antigos, então nada é usado sem passar por aqui. Registro inválido é descartado.

import { normalizarHexagono, normalizarRegiao } from '../mapa/armazenamento'
import type { Hexagono, Lote, Mudanca, MudancaNota, MudancaRegiao, NotaPrivada, Regiao, TipoLote, TokenGrupo } from '../mapa/tipos'
import type { CamadaMestreDoServidor, Campanha, LoteDoServidor, MapaDoServidor, Papel, Participacao, TokenDoServidor, Usuario } from './tipos'

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

const ordemOuZero = (v: unknown) => (inteiro(v) && v > 0 ? v : 0)

export function normalizarMapaDoServidor(bruto: unknown): MapaDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  // Vazio, ou um valor que o app não conhece, vale a trava aberta: quem decide de verdade é o servidor.
  return { id: bruto.id, ultimaOrdem: ordemOuZero(bruto.ultimaOrdem), permissao: bruto.permissao === 'mestre' ? 'mestre' : 'todos' }
}

export function normalizarCamadaMestreDoServidor(bruto: unknown): CamadaMestreDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, ultimaOrdem: ordemOuZero(bruto.ultimaOrdem) }
}

/** Nota privada do mestre. A nota não tem validação no mapa (armazenamento.ts), então ela mora aqui. */
export function normalizarNotaPrivada(bruto: unknown): NotaPrivada | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r) || typeof bruto.texto !== 'string') return null
  return { q: bruto.q, r: bruto.r, texto: bruto.texto, rev: inteiro(bruto.rev) && bruto.rev > 0 ? bruto.rev : 1 }
}

/** Nota privada guardada no servidor. A posição vale a do registro. */
export function normalizarNotaDoServidor(bruto: unknown): NotaPrivada | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r) || !ehObj(bruto.dados)) return null
  return normalizarNotaPrivada({ ...bruto.dados, q: bruto.q, r: bruto.r })
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

function normalizarMudancaNota(bruto: unknown): MudancaNota | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r)) return null
  const antes = bruto.antes === null || bruto.antes === undefined ? null : normalizarNotaPrivada(bruto.antes)
  const depois = bruto.depois === null || bruto.depois === undefined ? null : normalizarNotaPrivada(bruto.depois)
  if (bruto.depois && !depois) return null
  if (depois && (depois.q !== bruto.q || depois.r !== bruto.r)) return null
  return { q: bruto.q, r: bruto.r, antes, depois }
}

const TIPOS_DE_LOTE: readonly TipoLote[] = ['edicao', 'importacao', 'reversao']

/** Tipo e alvo do lote, só quando vêm preenchidos. Lote sem tipo vale edição, como no contrato. */
function tipoEAlvo(bruto: Record<string, unknown>): Pick<Lote, 'tipo' | 'alvoId'> {
  const tipo = TIPOS_DE_LOTE.find((t) => t === bruto.tipo)
  return {
    ...(tipo ? { tipo } : {}),
    ...(typeof bruto.alvoId === 'string' && bruto.alvoId ? { alvoId: bruto.alvoId } : {}),
  }
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
    ...tipoEAlvo(bruto),
  }
  return { ordem: bruto.ordem, lote }
}

/**
 * Registro da coleção `lotes_mestre`, convertido para um `Lote` só com a parte privada. Tem o mesmo id do
 * lote que o app mandou: um lote com parte pública e privada chega ao mestre em duas partes.
 */
export function normalizarLoteMestreDoServidor(bruto: unknown): LoteDoServidor | null {
  if (!ehObj(bruto) || !inteiro(bruto.ordem) || bruto.ordem < 1 || !id(bruto.loteId)) return null
  const lote: Lote = {
    id: bruto.loteId,
    autor: typeof bruto.autor === 'string' ? bruto.autor : '',
    ts: typeof bruto.ts === 'number' && Number.isFinite(bruto.ts) ? bruto.ts : 0,
    mudancas: [],
    regioes: [],
    ...tipoEAlvo(bruto),
    privado: {
      ocultos: normalizarLista(bruto.ocultos, normalizarMudanca),
      notas: normalizarLista(bruto.notas, normalizarMudancaNota),
    },
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
