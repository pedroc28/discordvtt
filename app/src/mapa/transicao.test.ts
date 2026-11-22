import { describe, expect, it } from 'vitest'
import { gerarSobreposicao, misturaNaDistancia, MISTURA_NA_BORDA, RESOLUCAO, type FontePixels } from './transicao'

const L = 256
const A = 296

/** Imagem de tile toda vermelha e opaca. */
function vermelho(): FontePixels {
  const data = new Uint8ClampedArray(L * A * 4)
  for (let i = 0; i < L * A; i++) {
    data[i * 4] = 255
    data[i * 4 + 3] = 255
  }
  return { data, width: L, height: A }
}

const alfa = (px: Uint8ClampedArray, x: number, y: number) => px[(y * RESOLUCAO + x) * 4 + 3]
const contar = (px: Uint8ClampedArray, ok: (x: number, y: number) => boolean) => {
  let n = 0
  for (let y = 0; y < RESOLUCAO; y++) for (let x = 0; x < RESOLUCAO; x++) if (alfa(px, x, y) && ok(x, y)) n++
  return n
}

describe('transição entre terrenos', () => {
  it('a mistura é máxima na borda e cai a zero no fim da faixa', () => {
    expect(misturaNaDistancia(0, L)).toBeCloseTo(MISTURA_NA_BORDA)
    expect(misturaNaDistancia(L * 0.065, L)).toBeCloseTo(MISTURA_NA_BORDA / 2)
    expect(misturaNaDistancia(L * 0.13, L)).toBe(0)
    expect(misturaNaDistancia(L, L)).toBe(0)
    expect(misturaNaDistancia(-1, L)).toBe(0)
  })

  it('a borda leste só pinta pixels do lado leste do hexágono', () => {
    const px = gerarSobreposicao(vermelho(), 0, L, A)
    const total = contar(px, () => true)
    expect(total).toBeGreaterThan(100)
    // Metade esquerda do tile não é tocada.
    expect(contar(px, (x) => x < RESOLUCAO / 2)).toBe(0)
  })

  it('cada uma das 6 bordas pinta o lado certo', () => {
    // 0 leste, 1 sudeste, 2 sudoeste, 3 oeste, 4 noroeste, 5 nordeste (y cresce para baixo)
    const lado: ((x: number, y: number) => boolean)[] = [
      (x) => x > 64,
      (x, y) => x > 20 && y > 64,
      (x, y) => x < 108 && y > 64,
      (x) => x < 64,
      (x, y) => x < 108 && y < 64,
      (x, y) => x > 20 && y < 64,
    ]
    for (let d = 0; d < 6; d++) {
      const px = gerarSobreposicao(vermelho(), d, L, A)
      const total = contar(px, () => true)
      expect(total, `borda ${d}`).toBeGreaterThan(100)
      expect(contar(px, lado[d]), `borda ${d}`).toBe(total)
    }
  })

  it('mais perto da borda tem mais pixels trocados do que longe', () => {
    const px = gerarSobreposicao(vermelho(), 0, L, A)
    const perto = contar(px, (x, y) => x >= 118 && y > 50 && y < 78)
    const longe = contar(px, (x, y) => x >= 104 && x < 112 && y > 50 && y < 78)
    expect(perto).toBeGreaterThan(longe)
  })

  it('perto da borda, cerca de metade dos pixels é trocada', () => {
    const px = gerarSobreposicao(vermelho(), 0, L, A)
    // Coluna colada na borda leste, no meio do lado (onde a borda é reta).
    let tot = 0
    let trocados = 0
    for (let y = 50; y < 78; y++) {
      for (let x = 125; x < 128; x++) {
        tot++
        if (alfa(px, x, y)) trocados++
      }
    }
    expect(trocados / tot).toBeGreaterThan(0.4)
    expect(trocados / tot).toBeLessThan(0.6)
  })

  it('vizinho transparente não pinta nada, e tudo fica fora do hexágono é transparente', () => {
    const vazio: FontePixels = { data: new Uint8ClampedArray(L * A * 4), width: L, height: A }
    expect(contar(gerarSobreposicao(vazio, 0, L, A), () => true)).toBe(0)
    const px = gerarSobreposicao(vermelho(), 1, L, A)
    // Cantos do quadrado, fora do hexágono.
    expect(alfa(px, 0, 0)).toBe(0)
    expect(alfa(px, RESOLUCAO - 1, 0)).toBe(0)
    expect(alfa(px, 0, RESOLUCAO - 1)).toBe(0)
  })

  it('é determinístico e copia a cor do vizinho', () => {
    const a = gerarSobreposicao(vermelho(), 2, L, A)
    const b = gerarSobreposicao(vermelho(), 2, L, A)
    expect(Array.from(a)).toEqual(Array.from(b))
    const i = a.findIndex((v, k) => k % 4 === 3 && v === 255)
    expect([a[i - 3], a[i - 2], a[i - 1]]).toEqual([255, 0, 0])
  })
})
