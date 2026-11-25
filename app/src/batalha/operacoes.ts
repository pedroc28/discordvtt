// Operações puras sobre a cena: cada uma devolve a cena nova e não altera a que recebeu.
// Também valida a cena que vem de fora (navegador, arquivo, servidor), porque dado de fora nunca é confiável.

import { celulaEm, centroDaCelula, temCelulas } from './grade'
import type { Camera } from '../mapa/camera'
import type { Cena, CorGrade, FundoBatalha, Grade, Medida, Ponto, RegraDiagonal, TipoGrade, TokenBatalha } from './tipos'

export const LIMITE_TOKENS = 200
export const TAMANHO_MIN = 8
export const TAMANHO_MAX = 1000
export const LADO_MAXIMO_IMAGEM = 16384

/** Cores dos tokens, em ordem: cada token novo pega a seguinte. Legíveis com letra branca. */
export const CORES_TOKEN = ['#c2185b', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#455a64']

const TIPOS: readonly TipoGrade[] = ['quadrada', 'hex-pontudo', 'hex-chato', 'nenhuma']
const CORES_GRADE: readonly CorGrade[] = ['clara', 'escura', 'acento']
const DIAGONAIS: readonly RegraDiagonal[] = ['simples', 'alternada', 'euclidiana']

export const GRADE_PADRAO: Grade = { tipo: 'quadrada', tamanho: 70, x: 0, y: 0, visivel: true, cor: 'clara', opacidade: 0.4 }
export const MEDIDA_PADRAO: Medida = { valorPorCelula: 1.5, unidade: 'm', diagonal: 'simples' }

export function cenaNova(id = 'principal', nome = 'Batalha'): Cena {
  return { versao: 1, id, nome, fundo: null, grade: { ...GRADE_PADRAO }, medida: { ...MEDIDA_PADRAO }, encaixar: true, tokens: [] }
}

export function novoIdToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ---------- validação ----------

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const COR_HEX = /^#[0-9a-f]{6}$/i
const COORDENADA_MAX = 1_000_000

function normalizarGrade(bruto: unknown): Grade {
  const o = ehObj(bruto) ? bruto : {}
  const padrao = GRADE_PADRAO
  return {
    tipo: TIPOS.includes(o.tipo as TipoGrade) ? (o.tipo as TipoGrade) : padrao.tipo,
    tamanho: finito(o.tamanho) ? entre(o.tamanho, TAMANHO_MIN, TAMANHO_MAX) : padrao.tamanho,
    x: finito(o.x) ? entre(o.x, -COORDENADA_MAX, COORDENADA_MAX) : padrao.x,
    y: finito(o.y) ? entre(o.y, -COORDENADA_MAX, COORDENADA_MAX) : padrao.y,
    visivel: typeof o.visivel === 'boolean' ? o.visivel : padrao.visivel,
    cor: CORES_GRADE.includes(o.cor as CorGrade) ? (o.cor as CorGrade) : padrao.cor,
    opacidade: finito(o.opacidade) ? entre(o.opacidade, 0.05, 1) : padrao.opacidade,
  }
}

function normalizarMedida(bruto: unknown): Medida {
  const o = ehObj(bruto) ? bruto : {}
  return {
    valorPorCelula: finito(o.valorPorCelula) && o.valorPorCelula > 0 ? Math.min(o.valorPorCelula, 100000) : MEDIDA_PADRAO.valorPorCelula,
    unidade: typeof o.unidade === 'string' ? o.unidade.slice(0, 12) : MEDIDA_PADRAO.unidade,
    diagonal: DIAGONAIS.includes(o.diagonal as RegraDiagonal) ? (o.diagonal as RegraDiagonal) : MEDIDA_PADRAO.diagonal,
  }
}

function normalizarFundo(bruto: unknown): FundoBatalha | null {
  if (!ehObj(bruto) || !finito(bruto.largura) || !finito(bruto.altura)) return null
  const largura = Math.round(bruto.largura)
  const altura = Math.round(bruto.altura)
  if (largura < 1 || altura < 1 || largura > LADO_MAXIMO_IMAGEM || altura > LADO_MAXIMO_IMAGEM) return null
  return { largura, altura }
}

export function normalizarToken(bruto: unknown, indice = 0): TokenBatalha | null {
  if (!ehObj(bruto) || typeof bruto.id !== 'string' || !bruto.id || !finito(bruto.x) || !finito(bruto.y)) return null
  return {
    id: bruto.id.slice(0, 64),
    nome: typeof bruto.nome === 'string' ? bruto.nome.slice(0, 40) : '',
    x: entre(bruto.x, -COORDENADA_MAX, COORDENADA_MAX),
    y: entre(bruto.y, -COORDENADA_MAX, COORDENADA_MAX),
    tamanho: finito(bruto.tamanho) ? entre(bruto.tamanho, 0.5, 10) : 1,
    cor: typeof bruto.cor === 'string' && COR_HEX.test(bruto.cor) ? bruto.cor : CORES_TOKEN[indice % CORES_TOKEN.length],
  }
}

/** Aceita a cena de fora: campo ruim vira o padrão, token quebrado cai fora, id repetido vale o primeiro. */
export function normalizarCena(bruto: unknown): Cena | null {
  if (!ehObj(bruto) || typeof bruto.id !== 'string' || !bruto.id) return null
  const tokens: TokenBatalha[] = []
  const vistos = new Set<string>()
  for (const item of Array.isArray(bruto.tokens) ? bruto.tokens : []) {
    const t = normalizarToken(item, tokens.length)
    if (!t || vistos.has(t.id) || tokens.length >= LIMITE_TOKENS) continue
    vistos.add(t.id)
    tokens.push(t)
  }
  return {
    versao: 1,
    id: bruto.id,
    nome: typeof bruto.nome === 'string' && bruto.nome ? bruto.nome.slice(0, 60) : 'Batalha',
    fundo: normalizarFundo(bruto.fundo),
    grade: normalizarGrade(bruto.grade),
    medida: normalizarMedida(bruto.medida),
    encaixar: typeof bruto.encaixar === 'boolean' ? bruto.encaixar : true,
    tokens,
  }
}

// ---------- edição ----------

export function mudarGrade(cena: Cena, patch: Partial<Grade>): Cena {
  return { ...cena, grade: normalizarGrade({ ...cena.grade, ...patch }) }
}

export function mudarMedida(cena: Cena, patch: Partial<Medida>): Cena {
  return { ...cena, medida: normalizarMedida({ ...cena.medida, ...patch }) }
}

export function definirFundo(cena: Cena, fundo: FundoBatalha | null): Cena {
  return { ...cena, fundo: fundo && normalizarFundo(fundo) }
}

export function definirEncaixe(cena: Cena, encaixar: boolean): Cena {
  return { ...cena, encaixar }
}

/** Token novo no ponto dado, com a próxima cor da lista. Passa do limite, não cria. */
export function adicionarToken(cena: Cena, ponto: Ponto, id = novoIdToken()): { cena: Cena; token: TokenBatalha | null } {
  if (cena.tokens.length >= LIMITE_TOKENS) return { cena, token: null }
  const token: TokenBatalha = {
    id,
    nome: `Token ${cena.tokens.length + 1}`,
    x: ponto.x,
    y: ponto.y,
    tamanho: 1,
    cor: CORES_TOKEN[cena.tokens.length % CORES_TOKEN.length],
  }
  return { cena: { ...cena, tokens: [...cena.tokens, token] }, token }
}

export function editarToken(cena: Cena, id: string, patch: Partial<Omit<TokenBatalha, 'id'>>): Cena {
  return {
    ...cena,
    tokens: cena.tokens.map((t, i) => (t.id === id ? (normalizarToken({ ...t, ...patch }, i) ?? t) : t)),
  }
}

export function moverToken(cena: Cena, id: string, ponto: Ponto): Cena {
  return editarToken(cena, id, { x: ponto.x, y: ponto.y })
}

export function removerToken(cena: Cena, id: string): Cena {
  return { ...cena, tokens: cena.tokens.filter((t) => t.id !== id) }
}

// ---------- consultas ----------

/** Raio do token em pixels da imagem. */
export const raioDoToken = (cena: Cena, t: TokenBatalha) => (t.tamanho * cena.grade.tamanho) / 2

/** O token mais de cima sob o ponto: os últimos da lista estão por cima. */
export function tokenEm(cena: Cena, p: Ponto): TokenBatalha | null {
  for (let i = cena.tokens.length - 1; i >= 0; i--) {
    const t = cena.tokens[i]
    if (Math.hypot(p.x - t.x, p.y - t.y) <= raioDoToken(cena, t)) return t
  }
  return null
}

/** Um ponto de partida para token novo: o centro da célula do ponto, se há grade. */
export function pontoDeEntrada(cena: Cena, p: Ponto): Ponto {
  if (!temCelulas(cena.grade)) return p
  const c = celulaEm(cena.grade, p)
  return c ? centroDaCelula(cena.grade, c) : p
}

/** Câmera que mostra a imagem inteira numa tela de `largura` por `altura`, com uma margem. */
export function enquadrar(fundo: FundoBatalha | null, largura: number, altura: number): Camera {
  if (!fundo || largura <= 0 || altura <= 0) return { x: 0, y: 0, zoom: 1 }
  const zoom = Math.min(2.5, Math.max(0.08, Math.min(largura / fundo.largura, altura / fundo.altura) * 0.95))
  return { x: fundo.largura / 2, y: fundo.altura / 2, zoom }
}

/** Reduz o lado maior de uma imagem para no máximo `limite`, mantendo a proporção. Não aumenta. */
export function dimensoesReduzidas(largura: number, altura: number, limite: number): FundoBatalha {
  const maior = Math.max(largura, altura)
  if (maior <= limite) return { largura, altura }
  const f = limite / maior
  return { largura: Math.max(1, Math.round(largura * f)), altura: Math.max(1, Math.round(altura * f)) }
}
