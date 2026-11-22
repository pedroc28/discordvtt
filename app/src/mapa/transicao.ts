// Transição entre terrenos vizinhos: na faixa junto à borda, uma parte dos pixels do hexágono é
// trocada por pixels do vizinho, escolhidos por pontilhado ordenado (Bayer). O vizinho é espelhado
// pela borda comum, então a textura dele "continua" para dentro deste hexágono. Dos dois lados da
// borda a mistura chega a 50%, e cai a zero no fim da faixa: a emenda vira um degradê de pixels, sem
// precisar de arte nova para cada par de terrenos. Puro, sem canvas: opera sobre listas de pixels.

export interface FontePixels {
  /** RGBA, 4 bytes por pixel. */
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Quantos pixels de arte tem o lado do tile quadrado de arte (os PNGs do PixelLab são 128 × 128). */
export const RESOLUCAO = 128
/** Largura da faixa de mistura, em fração da largura do hexágono. */
export const BANDA = 0.13
/** Mistura máxima na própria borda. */
export const MISTURA_NA_BORDA = 0.5

/** Matriz de Bayer 8 × 8 com limiares entre 0 e 1. */
const BAYER: number[] = (() => {
  let m = [[0, 2], [3, 1]]
  while (m.length < 8) {
    const n = m.length
    const g = Array.from({ length: n * 2 }, () => new Array<number>(n * 2).fill(0))
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4
        g[y][x] = v
        g[y][x + n] = v + 2
        g[y + n][x] = v + 3
        g[y + n][x + n] = v + 1
      }
    }
    m = g
  }
  return m.flat().map((v) => (v + 0.5) / 64)
})()

const COS = [0, 1, 2, 3, 4, 5].map((i) => Math.cos((i * Math.PI) / 3))
const SEN = [0, 1, 2, 3, 4, 5].map((i) => Math.sin((i * Math.PI) / 3))

/** Fração de mistura (0 a MISTURA_NA_BORDA) a `dist` unidades do mundo da borda. */
export function misturaNaDistancia(dist: number, largura: number): number {
  const banda = BANDA * largura
  if (dist < 0 || dist >= banda) return 0
  return MISTURA_NA_BORDA * (1 - dist / banda)
}

/**
 * Pixels (RESOLUCAO × RESOLUCAO, RGBA) que cobrem a faixa da borda `d` (0 leste, 1 sudeste, 2 sudoeste,
 * 3 oeste, 4 noroeste, 5 nordeste) com a textura do vizinho dessa borda. `fonte` é a imagem do vizinho
 * no tamanho do tile (largura × altura do tileset). Pixels fora da faixa, fora do hexágono ou onde o
 * vizinho é transparente saem transparentes.
 */
export function gerarSobreposicao(fonte: FontePixels, d: number, largura: number, altura: number): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(RESOLUCAO * RESOLUCAO * 4)
  const apotema = largura / 2
  const nx = COS[d]
  const ny = SEN[d]
  for (let y = 0; y < RESOLUCAO; y++) {
    const wy = ((y + 0.5) * altura) / RESOLUCAO - altura / 2
    for (let x = 0; x < RESOLUCAO; x++) {
      const wx = ((x + 0.5) * largura) / RESOLUCAO - largura / 2
      // Dentro do hexágono: distância não negativa até as 6 bordas.
      let dentro = true
      for (let i = 0; i < 6; i++) {
        if (apotema - (wx * COS[i] + wy * SEN[i]) < -0.001) {
          dentro = false
          break
        }
      }
      if (!dentro) continue
      const dist = apotema - (wx * nx + wy * ny)
      const mistura = misturaNaDistancia(dist, largura)
      if (mistura <= 0 || BAYER[(y & 7) * 8 + (x & 7)] >= mistura) continue
      // Espelha pela borda comum: o ponto equivalente no vizinho, em coordenadas locais dele.
      const proj = wx * nx + wy * ny
      const qx = wx - 2 * proj * nx
      const qy = wy - 2 * proj * ny
      const sx = Math.floor(qx + largura / 2)
      const sy = Math.floor(qy + altura / 2)
      if (sx < 0 || sy < 0 || sx >= fonte.width || sy >= fonte.height) continue
      const o = (sy * fonte.width + sx) * 4
      if (fonte.data[o + 3] === 0) continue
      const k = (y * RESOLUCAO + x) * 4
      saida[k] = fonte.data[o]
      saida[k + 1] = fonte.data[o + 1]
      saida[k + 2] = fonte.data[o + 2]
      saida[k + 3] = 255
    }
  }
  return saida
}
