import { describe, expect, it } from 'vitest'
import {
  DIRECOES,
  RAIZ3,
  anel,
  arestaCanonica,
  arredondar,
  cantos,
  chaveChunk,
  chunkDe,
  daChave,
  chave,
  disco,
  distancia,
  hexParaPixel,
  ladosDaAresta,
  linha,
  pixelParaHex,
  vizinho,
  vizinhos,
} from './hex'

const R = 100

describe('vizinhança e distância', () => {
  it('tem 6 vizinhos, todos a distância 1', () => {
    const v = vizinhos({ q: 3, r: -2 })
    expect(v).toHaveLength(6)
    expect(new Set(v.map((h) => chave(h.q, h.r))).size).toBe(6)
    for (const h of v) expect(distancia({ q: 3, r: -2 }, h)).toBe(1)
  })

  it('vizinho de ida e volta pela direção oposta', () => {
    for (let d = 0; d < 6; d++) {
      const ida = vizinho({ q: 5, r: 7 }, d)
      expect(vizinho(ida, d + 3)).toEqual({ q: 5, r: 7 })
    }
  })

  it('aceita direção negativa ou maior que 5', () => {
    expect(vizinho({ q: 0, r: 0 }, -1)).toEqual(DIRECOES[5])
    expect(vizinho({ q: 0, r: 0 }, 7)).toEqual(DIRECOES[1])
  })

  it('calcula distância em hexágonos', () => {
    expect(distancia({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0)
    expect(distancia({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3)
    expect(distancia({ q: -2, r: 4 }, { q: 3, r: -1 })).toBe(5)
  })
})

describe('disco, anel e linha', () => {
  it('disco tem 3n(n+1)+1 hexágonos, todos dentro do raio', () => {
    for (const n of [0, 1, 2, 5]) {
      const d = disco({ q: 2, r: -3 }, n)
      expect(d).toHaveLength(3 * n * (n + 1) + 1)
      for (const h of d) expect(distancia({ q: 2, r: -3 }, h)).toBeLessThanOrEqual(n)
    }
  })

  it('anel tem 6n hexágonos, todos a distância exata n, sem repetir', () => {
    for (const n of [1, 2, 4]) {
      const a = anel({ q: -1, r: 2 }, n)
      expect(a).toHaveLength(6 * n)
      expect(new Set(a.map((h) => chave(h.q, h.r))).size).toBe(6 * n)
      for (const h of a) expect(distancia({ q: -1, r: 2 }, h)).toBe(n)
    }
    expect(anel({ q: 1, r: 1 }, 0)).toEqual([{ q: 1, r: 1 }])
  })

  it('linha liga dois hexágonos sem buracos', () => {
    const a = { q: -3, r: 2 }
    const b = { q: 4, r: -5 }
    const l = linha(a, b)
    expect(l[0]).toEqual(a)
    expect(l[l.length - 1]).toEqual(b)
    expect(l).toHaveLength(distancia(a, b) + 1)
    for (let i = 1; i < l.length; i++) expect(distancia(l[i - 1], l[i])).toBe(1)
  })

  it('linha de um hexágono para ele mesmo', () => {
    expect(linha({ q: 2, r: 2 }, { q: 2, r: 2 })).toEqual([{ q: 2, r: 2 }])
  })
})

describe('pixels', () => {
  it('o centro de cada hexágono volta ao mesmo hexágono', () => {
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        const { x, y } = hexParaPixel({ q, r }, R)
        expect(pixelParaHex(x, y, R)).toEqual({ q, r })
      }
    }
  })

  it('pontos perto do centro continuam no mesmo hexágono, e a 0,9R do centro ainda no hexágono', () => {
    const c = hexParaPixel({ q: 2, r: -1 }, R)
    for (const [dx, dy] of [
      [0.3, 0.3],
      [-0.4, 0.5],
      [0.8, 0],
      [0, -0.85],
    ]) {
      expect(pixelParaHex(c.x + dx * R, c.y + dy * R, R)).toEqual({ q: 2, r: -1 })
    }
  })

  it('o vizinho leste fica a √3·R, à direita, na mesma altura', () => {
    const a = hexParaPixel({ q: 0, r: 0 }, R)
    const b = hexParaPixel({ q: 1, r: 0 }, R)
    expect(b.x - a.x).toBeCloseTo(RAIZ3 * R)
    expect(b.y).toBeCloseTo(a.y)
  })

  it('a fileira de baixo é deslocada meio hexágono para a direita', () => {
    const a = hexParaPixel({ q: 0, r: 0 }, R)
    const b = hexParaPixel({ q: 0, r: 1 }, R)
    expect(b.x - a.x).toBeCloseTo((RAIZ3 * R) / 2)
    expect(b.y - a.y).toBeCloseTo(1.5 * R)
  })

  it('arredondar não devolve -0', () => {
    const h = arredondar(-0.2, 0.1)
    expect(Object.is(h.q, -0)).toBe(false)
    expect(Object.is(h.r, -0)).toBe(false)
  })

  it('cantos formam a aresta i entre o canto i e o i+1, voltada para a direção i', () => {
    const c = cantos(R)
    expect(c).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      const a = c[i]
      const b = c[(i + 1) % 6]
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      // O meio da aresta i aponta para o centro do vizinho i.
      const alvo = hexParaPixel(DIRECOES[i], R)
      expect(meio.x / Math.hypot(meio.x, meio.y)).toBeCloseTo(alvo.x / Math.hypot(alvo.x, alvo.y))
      expect(meio.y / Math.hypot(meio.x, meio.y)).toBeCloseTo(alvo.y / Math.hypot(alvo.x, alvo.y))
    }
  })
})

describe('chunks', () => {
  it('agrupa em blocos de 16, inclusive com coordenadas negativas', () => {
    expect(chunkDe({ q: 0, r: 0 })).toEqual({ q: 0, r: 0 })
    expect(chunkDe({ q: 15, r: 15 })).toEqual({ q: 0, r: 0 })
    expect(chunkDe({ q: 16, r: -1 })).toEqual({ q: 1, r: -1 })
    expect(chunkDe({ q: -16, r: -17 })).toEqual({ q: -1, r: -2 })
    expect(chaveChunk({ q: -1, r: 0 })).toBe('-1,0')
  })

  it('chave e daChave são inversas', () => {
    expect(daChave(chave(-4, 9))).toEqual({ q: -4, r: 9 })
  })
})

describe('arestas', () => {
  it('a mesma aresta vista dos dois hexágonos tem a mesma identidade', () => {
    for (let d = 0; d < 6; d++) {
      const h = { q: 2, r: 3 }
      const v = vizinho(h, d)
      expect(arestaCanonica(h, d)).toEqual(arestaCanonica(v, d + 3))
    }
  })

  it('só leste, sudeste e sudoeste são "donos" da aresta', () => {
    const h = { q: 0, r: 0 }
    for (let d = 0; d < 3; d++) expect(arestaCanonica(h, d)).toEqual({ q: 0, r: 0, d })
    for (let d = 3; d < 6; d++) expect([0, 1, 2]).toContain(arestaCanonica(h, d).d)
  })

  it('os lados da aresta são dois hexágonos vizinhos', () => {
    const [a, b] = ladosDaAresta({ q: 1, r: 1, d: 2 })
    expect(distancia(a, b)).toBe(1)
  })
})
