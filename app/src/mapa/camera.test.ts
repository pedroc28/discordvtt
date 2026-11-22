import { describe, expect, it } from 'vitest'
import { ZOOM_MAX, ZOOM_MIN, arrastar, mundoParaTela, telaParaMundo, zoomEm } from './camera'

const L = 800
const A = 600

describe('câmera', () => {
  it('o centro da tela mostra o ponto (x, y) da câmera', () => {
    const c = { x: 120, y: -40, zoom: 0.5 }
    expect(telaParaMundo(c, L, A, L / 2, A / 2)).toEqual({ x: 120, y: -40 })
  })

  it('mundoParaTela e telaParaMundo são inversas', () => {
    const c = { x: 33, y: 71, zoom: 1.7 }
    const m = telaParaMundo(c, L, A, 123, 456)
    const t = mundoParaTela(c, L, A, m.x, m.y)
    expect(t.x).toBeCloseTo(123)
    expect(t.y).toBeCloseTo(456)
  })

  it('o zoom mantém o ponto sob o cursor no mesmo lugar', () => {
    const c = { x: 10, y: 20, zoom: 0.6 }
    const antes = telaParaMundo(c, L, A, 200, 150)
    const nova = zoomEm(c, L, A, 200, 150, 1.8)
    expect(nova.zoom).toBeCloseTo(1.08)
    const depois = telaParaMundo(nova, L, A, 200, 150)
    expect(depois.x).toBeCloseTo(antes.x)
    expect(depois.y).toBeCloseTo(antes.y)
  })

  it('o zoom respeita os limites', () => {
    const c = { x: 0, y: 0, zoom: 1 }
    expect(zoomEm(c, L, A, 0, 0, 1000).zoom).toBe(ZOOM_MAX)
    expect(zoomEm(c, L, A, 0, 0, 0.0001).zoom).toBe(ZOOM_MIN)
  })

  it('arrastar para a direita move a câmera para a esquerda no mundo', () => {
    expect(arrastar({ x: 0, y: 0, zoom: 2 }, 100, -50)).toEqual({ x: -50, y: 25, zoom: 2 })
  })
})
