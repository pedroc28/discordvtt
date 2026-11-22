// Encaixe na grade e nas bordas e centros dos outros campos (guias inteligentes).

import { arredondarGrade } from './util'

export interface Ret {
  x: number
  y: number
  w: number
  h: number
}

export interface Guia {
  eixo: 'x' | 'y'
  pos: number
  inicio: number
  fim: number
}

export type Alca = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const ALCAS: Alca[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

interface Pag {
  largura: number
  altura: number
}

interface Opcoes {
  grade: number
  /** Distância (em px da folha) para grudar numa guia. */
  limiar: number
  /** Falso quando o usuário segura Alt: movimento livre. */
  ativo: boolean
}

function bordasX(r: Ret) {
  return [r.x, r.x + r.w / 2, r.x + r.w]
}
function bordasY(r: Ret) {
  return [r.y, r.y + r.h / 2, r.y + r.h]
}

function melhor(candidatos: number[], alvos: number[], limiar: number) {
  let achado: { ajuste: number; alvo: number } | null = null
  for (const c of candidatos) {
    for (const a of alvos) {
      const d = a - c
      if (Math.abs(d) <= limiar && (!achado || Math.abs(d) < Math.abs(achado.ajuste))) {
        achado = { ajuste: d, alvo: a }
      }
    }
  }
  return achado
}

function guia(eixo: 'x' | 'y', alvo: number, proprio: Ret, outros: Ret[], pag: Pag): Guia {
  const tocados = outros.filter((o) =>
    (eixo === 'x' ? bordasX(o) : bordasY(o)).some((v) => Math.abs(v - alvo) < 0.6),
  )
  if (!tocados.length) {
    return { eixo, pos: alvo, inicio: 0, fim: eixo === 'x' ? pag.altura : pag.largura }
  }
  const todos = [proprio, ...tocados]
  if (eixo === 'x') {
    return {
      eixo,
      pos: alvo,
      inicio: Math.min(...todos.map((r) => r.y)),
      fim: Math.max(...todos.map((r) => r.y + r.h)),
    }
  }
  return {
    eixo,
    pos: alvo,
    inicio: Math.min(...todos.map((r) => r.x)),
    fim: Math.max(...todos.map((r) => r.x + r.w)),
  }
}

export function encaixarMovimento(r: Ret, outros: Ret[], pag: Pag, o: Opcoes) {
  if (!o.ativo) {
    return { x: Math.round(r.x), y: Math.round(r.y), guias: [] as Guia[] }
  }
  const alvosX = [0, pag.largura / 2, pag.largura, ...outros.flatMap(bordasX)]
  const alvosY = [0, pag.altura / 2, pag.altura, ...outros.flatMap(bordasY)]
  const ex = melhor(bordasX(r), alvosX, o.limiar)
  const ey = melhor(bordasY(r), alvosY, o.limiar)
  const x = Math.round(ex ? r.x + ex.ajuste : arredondarGrade(r.x, o.grade))
  const y = Math.round(ey ? r.y + ey.ajuste : arredondarGrade(r.y, o.grade))
  const final = { ...r, x, y }
  const guias: Guia[] = []
  if (ex) guias.push(guia('x', ex.alvo, final, outros, pag))
  if (ey) guias.push(guia('y', ey.alvo, final, outros, pag))
  return { x, y, guias }
}

export function redimensionar(
  orig: Ret,
  alca: Alca,
  dx: number,
  dy: number,
  outros: Ret[],
  pag: Pag,
  o: Opcoes,
  minimo = 12,
): { ret: Ret; guias: Guia[] } {
  let esq = orig.x
  let dir = orig.x + orig.w
  let topo = orig.y
  let base = orig.y + orig.h
  const guias: Guia[] = []
  const alvosX = [0, pag.largura / 2, pag.largura, ...outros.flatMap(bordasX)]
  const alvosY = [0, pag.altura / 2, pag.altura, ...outros.flatMap(bordasY)]

  const encaixar = (v: number, alvos: number[], eixo: 'x' | 'y') => {
    if (!o.ativo) return Math.round(v)
    const e = melhor([v], alvos, o.limiar)
    if (e) {
      guias.push({ eixo, pos: e.alvo, inicio: 0, fim: 0 })
      return Math.round(e.alvo)
    }
    return arredondarGrade(v, o.grade)
  }

  const moveW = alca.endsWith('w')
  const moveE = alca.endsWith('e')
  const moveN = alca.startsWith('n')
  const moveS = alca.startsWith('s')

  if (moveW) esq = encaixar(orig.x + dx, alvosX, 'x')
  if (moveE) dir = encaixar(orig.x + orig.w + dx, alvosX, 'x')
  if (moveN) topo = encaixar(orig.y + dy, alvosY, 'y')
  if (moveS) base = encaixar(orig.y + orig.h + dy, alvosY, 'y')

  esq = Math.max(0, esq)
  topo = Math.max(0, topo)
  dir = Math.min(pag.largura, dir)
  base = Math.min(pag.altura, base)

  if (dir - esq < minimo) {
    if (moveW) esq = dir - minimo
    else dir = esq + minimo
  }
  if (base - topo < minimo) {
    if (moveN) topo = base - minimo
    else base = topo + minimo
  }

  const ret = { x: esq, y: topo, w: dir - esq, h: base - topo }
  const completas = guias.map((g) => guia(g.eixo, g.pos, ret, outros, pag))
  return { ret, guias: completas }
}

export function intersecta(a: Ret, b: Ret) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function limitesDe(rets: Ret[]): Ret {
  const x = Math.min(...rets.map((r) => r.x))
  const y = Math.min(...rets.map((r) => r.y))
  const x2 = Math.max(...rets.map((r) => r.x + r.w))
  const y2 = Math.max(...rets.map((r) => r.y + r.h))
  return { x, y, w: x2 - x, h: y2 - y }
}
