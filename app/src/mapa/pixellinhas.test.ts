import { describe, expect, it } from 'vitest'
import { pixelsDaLinha, ruidoDoPixel } from './pixellinhas'

describe('linhas em pixel art', () => {
  it('linha horizontal e vertical passam por todos os pixels', () => {
    expect(pixelsDaLinha(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
    expect(pixelsDaLinha(2, 5, 2, 2)).toEqual([[2, 5], [2, 4], [2, 3], [2, 2]])
  })

  it('diagonal de 45 graus anda um pixel nos dois eixos', () => {
    expect(pixelsDaLinha(0, 0, 3, 3)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]])
  })

  it('inclui os dois extremos e nunca pula pixel entre vizinhos', () => {
    const p = pixelsDaLinha(0, 0, 10, 4)
    expect(p[0]).toEqual([0, 0])
    expect(p[p.length - 1]).toEqual([10, 4])
    for (let i = 1; i < p.length; i++) {
      expect(Math.abs(p[i][0] - p[i - 1][0])).toBeLessThanOrEqual(1)
      expect(Math.abs(p[i][1] - p[i - 1][1])).toBeLessThanOrEqual(1)
    }
  })

  it('a volta tem o mesmo tamanho e os mesmos extremos', () => {
    // Bresenham pode escolher pixels diferentes na volta, mas o desenho usa sempre o mesmo sentido para cada aresta.
    const ida = pixelsDaLinha(1, 2, 9, 5)
    const volta = pixelsDaLinha(9, 5, 1, 2)
    expect(volta).toHaveLength(ida.length)
    expect(volta[0]).toEqual([9, 5])
    expect(volta[volta.length - 1]).toEqual([1, 2])
  })

  it('ponto único devolve um pixel e coordenada fracionária arredonda', () => {
    expect(pixelsDaLinha(4, 4, 4, 4)).toEqual([[4, 4]])
    expect(pixelsDaLinha(0.4, 0.4, 2.6, 0.4).map((q) => q[0])).toEqual([0, 1, 2, 3])
  })

  it('o ruído é estável e fica entre 0 e 1', () => {
    expect(ruidoDoPixel(3, 7)).toBe(ruidoDoPixel(3, 7))
    for (let i = 0; i < 50; i++) {
      const r = ruidoDoPixel(i, i * 3)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
    }
  })
})
