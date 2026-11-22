// Validação de dados que vêm de fora (IndexedDB, arquivo importado, servidor)
// e preferências pequenas guardadas no navegador.

import type { Camera } from './camera'
import { limitarZoom } from './camera'
import type { Hexagono, MapaMeta, Marcador, Regiao } from './tipos'

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const str = (v: unknown, padrao: string) => (typeof v === 'string' ? v : padrao)

export function normalizarHexagono(bruto: unknown): Hexagono | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r)) return null
  if (typeof bruto.terreno !== 'string' || !bruto.terreno) return null
  return {
    q: bruto.q,
    r: bruto.r,
    terreno: bruto.terreno,
    regiaoId: typeof bruto.regiaoId === 'string' ? bruto.regiaoId : null,
    nome: str(bruto.nome, ''),
    nota: str(bruto.nota, ''),
    marcadores: Array.isArray(bruto.marcadores)
      ? bruto.marcadores.map(normalizarMarcador).filter((m): m is Marcador => !!m)
      : [],
    rev: inteiro(bruto.rev) && bruto.rev > 0 ? bruto.rev : 1,
  }
}

function normalizarMarcador(bruto: unknown): Marcador | null {
  if (!ehObj(bruto) || typeof bruto.id !== 'string' || !bruto.id) return null
  if (typeof bruto.tipo !== 'string' || !bruto.tipo) return null
  return { id: bruto.id, tipo: bruto.tipo, nome: str(bruto.nome, '') }
}

const COR_HEX = /^#[0-9a-f]{6}$/i

export function normalizarRegiao(bruto: unknown): Regiao | null {
  if (!ehObj(bruto) || typeof bruto.id !== 'string' || !bruto.id) return null
  return {
    id: bruto.id,
    nome: str(bruto.nome, 'Região'),
    cor: typeof bruto.cor === 'string' && COR_HEX.test(bruto.cor) ? bruto.cor : '#888888',
    descricao: str(bruto.descricao, ''),
    paiId: typeof bruto.paiId === 'string' && bruto.paiId !== bruto.id ? bruto.paiId : null,
    rev: inteiro(bruto.rev) && bruto.rev > 0 ? bruto.rev : 1,
  }
}

export function metaPadrao(id = 'principal'): MapaMeta {
  return { formato: 'mapa-hex', versao: 1, id, nome: 'Mapa do mundo', tileset: 'padrao', escala: '' }
}

export function normalizarMeta(bruto: unknown): MapaMeta | null {
  if (!ehObj(bruto) || bruto.formato !== 'mapa-hex') return null
  const base = metaPadrao(str(bruto.id, 'principal'))
  return { ...base, nome: str(bruto.nome, base.nome), tileset: str(bruto.tileset, base.tileset), escala: str(bruto.escala, '') }
}

// ---------- preferências locais ----------

const CHAVE_AUTOR = 'mapa:autor'
const prefixoCamera = 'mapa:camera:'

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // sem armazenamento: só não lembra para a próxima vez
  }
}

/** Identifica este navegador como autor das edições. Com login, vira o id do usuário. */
export function autorLocal(): string {
  let id = ler(CHAVE_AUTOR)
  if (!id) {
    id = crypto.randomUUID()
    gravar(CHAVE_AUTOR, id)
  }
  return id
}

export const CAMERA_INICIAL: Camera = { x: 0, y: 0, zoom: 0.6 }

export function carregarCamera(mapaId: string): Camera {
  try {
    const c = JSON.parse(ler(prefixoCamera + mapaId) ?? 'null') as Partial<Camera> | null
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.zoom)) {
      return { x: c.x as number, y: c.y as number, zoom: limitarZoom(c.zoom as number) }
    }
  } catch {
    // arquivo corrompido: volta ao início
  }
  return { ...CAMERA_INICIAL }
}

export const salvarCamera = (mapaId: string, c: Camera) => gravar(prefixoCamera + mapaId, JSON.stringify(c))
