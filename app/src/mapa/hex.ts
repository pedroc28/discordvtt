// Geometria de hexágonos: coordenadas axiais (q, r), orientação pointy-top.
//
//   q cresce para a direita (leste). r cresce para baixo e para a direita (sudeste).
//   Cada fileira r é deslocada meio hexágono para a direita em relação à de cima.
//
// Tudo aqui é puro e não depende de React nem do navegador.
// Referência: https://www.redblobgames.com/grids/hexagons/

export const RAIZ3 = Math.sqrt(3)

export interface Hex {
  q: number
  r: number
}

/** Os 6 vizinhos, em sentido horário a partir do leste. A ordem é um contrato: arestas dependem dela. */
export const DIRECOES: readonly Hex[] = [
  { q: 1, r: 0 }, // 0 leste
  { q: 0, r: 1 }, // 1 sudeste
  { q: -1, r: 1 }, // 2 sudoeste
  { q: -1, r: 0 }, // 3 oeste
  { q: 0, r: -1 }, // 4 noroeste
  { q: 1, r: -1 }, // 5 nordeste
]

/** Evita o -0, que o JavaScript distingue de 0 em comparações como Object.is e toEqual. */
const limpa = (n: number) => (n === 0 ? 0 : n)

export const chave = (q: number, r: number) => `${q},${r}`

export function daChave(k: string): Hex {
  const [q, r] = k.split(',')
  return { q: Number(q), r: Number(r) }
}

export const mesmoHex = (a: Hex | null, b: Hex | null) =>
  a === b || (!!a && !!b && a.q === b.q && a.r === b.r)

export function vizinho(h: Hex, direcao: number): Hex {
  const d = DIRECOES[((direcao % 6) + 6) % 6]
  return { q: h.q + d.q, r: h.r + d.r }
}

export const vizinhos = (h: Hex): Hex[] => DIRECOES.map((_, i) => vizinho(h, i))

/** Distância em passos de hexágono. */
export function distancia(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** Todos os hexágonos a até `raio` passos do centro (inclusive o centro). */
export function disco(centro: Hex, raio: number): Hex[] {
  const saida: Hex[] = []
  for (let dq = -raio; dq <= raio; dq++) {
    const r1 = Math.max(-raio, -dq - raio)
    const r2 = Math.min(raio, -dq + raio)
    for (let dr = r1; dr <= r2; dr++) saida.push({ q: centro.q + dq, r: centro.r + dr })
  }
  return saida
}

/** Só os hexágonos a exatamente `raio` passos do centro. */
export function anel(centro: Hex, raio: number): Hex[] {
  if (raio <= 0) return [{ ...centro }]
  const saida: Hex[] = []
  let h: Hex = { q: centro.q + DIRECOES[4].q * raio, r: centro.r + DIRECOES[4].r * raio }
  // Começa no noroeste e anda pelos 6 lados.
  for (let lado = 0; lado < 6; lado++) {
    for (let i = 0; i < raio; i++) {
      saida.push(h)
      h = vizinho(h, lado)
    }
  }
  return saida
}

/** Arredonda coordenadas axiais fracionárias para o hexágono mais próximo. */
export function arredondar(q: number, r: number): Hex {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  return { q: limpa(rq), r: limpa(rr) }
}

/** Hexágonos do caminho reto entre dois hexágonos, incluindo os dois. */
export function linha(a: Hex, b: Hex): Hex[] {
  const n = distancia(a, b)
  if (n === 0) return [{ ...a }]
  const saida: Hex[] = []
  // O deslocamento mínimo evita empates exatamente na fronteira entre dois hexágonos.
  const e = 1e-6
  for (let i = 0; i <= n; i++) {
    const t = i / n
    saida.push(arredondar(a.q + e + (b.q - a.q) * t, a.r + e + (b.r - a.r) * t))
  }
  return saida
}

// ---------- pixels ----------
// R é a distância do centro a um canto. Largura do hexágono = √3·R, altura = 2·R.

export function hexParaPixel(h: Hex, R: number): { x: number; y: number } {
  return { x: R * RAIZ3 * (h.q + h.r / 2), y: R * 1.5 * h.r }
}

export function pixelParaHex(x: number, y: number, R: number): Hex {
  return arredondar(((RAIZ3 / 3) * x - y / 3) / R, ((2 / 3) * y) / R)
}

/** Posição dos 6 cantos relativa ao centro. O canto i e o i+1 formam a aresta i (mesma ordem de DIRECOES). */
export function cantos(R: number): { x: number; y: number }[] {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const ang = ((60 * i - 30) * Math.PI) / 180
    return { x: R * Math.cos(ang), y: R * Math.sin(ang) }
  })
}

// ---------- chunks ----------
// Um chunk é um bloco de 16×16 coordenadas axiais. É a unidade de carregar,
// guardar e sincronizar, para o mapa ser infinito sem carregar tudo.

export const TAMANHO_CHUNK = 16

export function chunkDe(h: Hex): Hex {
  return { q: Math.floor(h.q / TAMANHO_CHUNK), r: Math.floor(h.r / TAMANHO_CHUNK) }
}

export function chaveChunk(h: Hex): string {
  const c = chunkDe(h)
  return chave(c.q, c.r)
}

// ---------- arestas ----------
// Rios e estradas passam pelas arestas. Cada aresta é compartilhada por dois hexágonos,
// então só o dono (a aresta leste, sudeste ou sudoeste do hexágono) a identifica:
// as arestas oeste, noroeste e nordeste pertencem ao vizinho do outro lado.

export interface Aresta {
  q: number
  r: number
  /** 0 leste, 1 sudeste, 2 sudoeste. */
  d: 0 | 1 | 2
}

export function arestaCanonica(h: Hex, direcao: number): Aresta {
  const dir = ((direcao % 6) + 6) % 6
  if (dir < 3) return { q: h.q, r: h.r, d: dir as 0 | 1 | 2 }
  const v = vizinho(h, dir)
  return { q: v.q, r: v.r, d: (dir - 3) as 0 | 1 | 2 }
}

export const chaveAresta = (a: Aresta) => `${a.q},${a.r},${a.d}`

/** Os dois hexágonos que a aresta separa. */
export function ladosDaAresta(a: Aresta): [Hex, Hex] {
  return [
    { q: a.q, r: a.r },
    vizinho({ q: a.q, r: a.r }, a.d),
  ]
}

/** Aresta do hexágono `h` cujo ponto médio está mais perto do ponto (x, y) do mundo. Serve ao desenho de rios. */
export function arestaMaisProxima(x: number, y: number, R: number): Aresta {
  const h = pixelParaHex(x, y, R)
  const c = hexParaPixel(h, R)
  const cs = cantos(R)
  let melhor = 0
  let menor = Infinity
  for (let i = 0; i < 6; i++) {
    const a = cs[i]
    const b = cs[(i + 1) % 6]
    const d = Math.hypot(x - (c.x + (a.x + b.x) / 2), y - (c.y + (a.y + b.y) / 2))
    if (d < menor) {
      menor = d
      melhor = i
    }
  }
  return arestaCanonica(h, melhor)
}

/**
 * Arestas por onde passa um traço de `de` até `ate` (pontos do mundo), sem repetir.
 * Amostra o trajeto em passos curtos para um traço rápido não deixar buracos.
 */
export function arestasEntrePontos(de: { x: number; y: number } | null, ate: { x: number; y: number }, R: number): Aresta[] {
  const saida = new Map<string, Aresta>()
  const dist = de ? Math.hypot(ate.x - de.x, ate.y - de.y) : 0
  const passos = Math.max(1, Math.ceil(dist / (R / 3)))
  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const x = de ? de.x + (ate.x - de.x) * t : ate.x
    const y = de ? de.y + (ate.y - de.y) * t : ate.y
    const a = arestaMaisProxima(x, y, R)
    saida.set(chaveAresta(a), a)
  }
  return [...saida.values()]
}

/** Arestas entre hexágonos vizinhos consecutivos de um caminho. Pares que não são vizinhos são ignorados. */
export function arestasDoCaminho(hexes: readonly Hex[]): Aresta[] {
  const saida = new Map<string, Aresta>()
  for (let i = 1; i < hexes.length; i++) {
    const a = hexes[i - 1]
    const b = hexes[i]
    const d = DIRECOES.findIndex((v) => a.q + v.q === b.q && a.r + v.r === b.r)
    if (d < 0) continue
    const aresta = arestaCanonica(a, d)
    saida.set(chaveAresta(aresta), aresta)
  }
  return [...saida.values()]
}
