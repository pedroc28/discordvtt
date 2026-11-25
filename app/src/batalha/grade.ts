// Geometria das grades: de ponto da imagem para célula e de volta, encaixe, distância e contorno.
// Puro, sem React nem canvas.
//
// Hexágonos: `tamanho` é a distância entre dois lados paralelos. Em coordenadas axiais (q, r):
//   pontudo: centro = (q + r/2, (√3/2) r) × tamanho      chato: centro = ((√3/2) q, r + q/2) × tamanho

import type { Celula, Grade, Ponto, RegraDiagonal } from './tipos'

const RAIZ3_2 = Math.sqrt(3) / 2

/** A grade tem células? Sem grade, só há pontos livres. */
export const temCelulas = (g: Grade) => g.tipo !== 'nenhuma'

export const ehHexagonal = (g: Grade) => g.tipo === 'hex-pontudo' || g.tipo === 'hex-chato'

/** Centro de uma célula. */
export function centroDaCelula(g: Grade, c: Celula): Ponto {
  const t = g.tamanho
  switch (g.tipo) {
    case 'hex-pontudo':
      return { x: g.x + t * (c.q + c.r / 2), y: g.y + RAIZ3_2 * t * c.r }
    case 'hex-chato':
      return { x: g.x + RAIZ3_2 * t * c.q, y: g.y + t * (c.r + c.q / 2) }
    default:
      return { x: g.x + (c.q + 0.5) * t, y: g.y + (c.r + 0.5) * t }
  }
}

/** Arredonda coordenadas axiais fracionárias para o hexágono mais próximo. */
function arredondarHex(q: number, r: number): Celula {
  const s = -q - r
  let rq = Math.round(q)
  let rs = Math.round(s)
  let rr = Math.round(r)
  const dq = Math.abs(rq - q)
  const ds = Math.abs(rs - s)
  const dr = Math.abs(rr - r)
  if (dq > ds && dq > dr) rq = -rs - rr
  else if (ds > dr) rs = -rq - rr
  else rr = -rq - rs
  // `+ 0` troca -0 por 0, para a célula comparar igual em testes e chaves.
  return { q: rq + 0, r: rr + 0 }
}

/** Célula que contém o ponto. Null sem grade. */
export function celulaEm(g: Grade, p: Ponto): Celula | null {
  const t = g.tamanho
  switch (g.tipo) {
    case 'quadrada':
      return { q: Math.floor((p.x - g.x) / t) + 0, r: Math.floor((p.y - g.y) / t) + 0 }
    case 'hex-pontudo': {
      const r = (p.y - g.y) / (RAIZ3_2 * t)
      return arredondarHex((p.x - g.x) / t - r / 2, r)
    }
    case 'hex-chato': {
      const q = (p.x - g.x) / (RAIZ3_2 * t)
      return arredondarHex(q, (p.y - g.y) / t - q / 2)
    }
    default:
      return null
  }
}

/**
 * Onde um token de `celulas` de tamanho assenta ao ser solto perto de `p`. Sem grade, onde estiver.
 * Na quadrada, tamanho ímpar centra na célula e tamanho par centra no cruzamento das linhas, como numa mesa.
 * Nos hexágonos, sempre no centro da célula.
 */
export function encaixar(g: Grade, p: Ponto, celulas: number): Ponto {
  if (!temCelulas(g)) return p
  if (g.tipo === 'quadrada' && Math.max(1, Math.round(celulas)) % 2 === 0) {
    return { x: g.x + Math.round((p.x - g.x) / g.tamanho) * g.tamanho, y: g.y + Math.round((p.y - g.y) / g.tamanho) * g.tamanho }
  }
  const c = celulaEm(g, p)
  return c ? centroDaCelula(g, c) : p
}

/** Quantas células separam duas células. Diagonal só conta na grade quadrada. */
export function distanciaEmCelulas(g: Grade, a: Celula, b: Celula, diagonal: RegraDiagonal): number {
  const dq = b.q - a.q
  const dr = b.r - a.r
  if (ehHexagonal(g)) return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
  const x = Math.abs(dq)
  const y = Math.abs(dr)
  if (diagonal === 'euclidiana') return Math.hypot(x, y)
  if (diagonal === 'alternada') return Math.max(x, y) + Math.floor(Math.min(x, y) / 2)
  return Math.max(x, y)
}

/** Células que tocam o retângulo (com uma de folga). Vazio se forem mais que `maximo`, para não travar com zoom muito aberto. */
export function celulasNaJanela(g: Grade, x0: number, y0: number, x1: number, y1: number, maximo = 12000): Celula[] {
  if (!temCelulas(g)) return []
  const t = g.tamanho
  const saida: Celula[] = []
  const cabe = () => saida.length <= maximo
  if (g.tipo === 'quadrada') {
    const q0 = Math.floor((x0 - g.x) / t)
    const q1 = Math.floor((x1 - g.x) / t)
    const r0 = Math.floor((y0 - g.y) / t)
    const r1 = Math.floor((y1 - g.y) / t)
    if ((q1 - q0 + 1) * (r1 - r0 + 1) > maximo) return []
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) saida.push({ q, r })
    return saida
  }
  if (g.tipo === 'hex-pontudo') {
    const r0 = Math.floor((y0 - g.y) / (RAIZ3_2 * t)) - 1
    const r1 = Math.ceil((y1 - g.y) / (RAIZ3_2 * t)) + 1
    for (let r = r0; r <= r1 && cabe(); r++) {
      const q0 = Math.floor((x0 - g.x) / t - r / 2) - 1
      const q1 = Math.ceil((x1 - g.x) / t - r / 2) + 1
      for (let q = q0; q <= q1 && cabe(); q++) saida.push({ q, r })
    }
  } else {
    const q0 = Math.floor((x0 - g.x) / (RAIZ3_2 * t)) - 1
    const q1 = Math.ceil((x1 - g.x) / (RAIZ3_2 * t)) + 1
    for (let q = q0; q <= q1 && cabe(); q++) {
      const r0 = Math.floor((y0 - g.y) / t - q / 2) - 1
      const r1 = Math.ceil((y1 - g.y) / t - q / 2) + 1
      for (let r = r0; r <= r1 && cabe(); r++) saida.push({ q, r })
    }
  }
  return cabe() ? saida : []
}

/** Cantos da célula, em ordem, para desenhar o contorno. */
export function cantosDaCelula(g: Grade, c: Celula): Ponto[] {
  if (g.tipo === 'quadrada') {
    const x = g.x + c.q * g.tamanho
    const y = g.y + c.r * g.tamanho
    const t = g.tamanho
    return [
      { x, y },
      { x: x + t, y },
      { x: x + t, y: y + t },
      { x, y: y + t },
    ]
  }
  const centro = centroDaCelula(g, c)
  const raio = g.tamanho / Math.sqrt(3)
  // Pontudo tem um canto para cima (começa a 30 graus), chato tem um lado para cima (começa a 0).
  const inicio = g.tipo === 'hex-pontudo' ? Math.PI / 6 : 0
  return Array.from({ length: 6 }, (_, k) => {
    const ang = inicio + (Math.PI / 3) * k
    return { x: centro.x + raio * Math.cos(ang), y: centro.y + raio * Math.sin(ang) }
  })
}

/** Tamanho da célula que faz uma distância medida na imagem valer `celulas` células. */
export function tamanhoPorMedida(distanciaEmPixels: number, celulas: number): number {
  if (!(celulas > 0) || !Number.isFinite(distanciaEmPixels)) return 0
  return distanciaEmPixels / celulas
}
