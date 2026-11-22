// Linhas em pixel art: rios e estradas desenhados pixel a pixel, sem suavização, para combinar com
// o tileset em pixel art. Puro (só matemática de pixels), o desenho em si fica no renderizador.

export type Ponto = readonly [number, number]

/**
 * Pixels de uma linha reta entre dois pontos, pelo algoritmo de Bresenham. Inclui os dois extremos.
 * Coordenadas fracionárias são arredondadas para o pixel mais próximo.
 */
export function pixelsDaLinha(x0: number, y0: number, x1: number, y1: number): Ponto[] {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const fx = Math.round(x1)
  const fy = Math.round(y1)
  const dx = Math.abs(fx - x)
  const dy = -Math.abs(fy - y)
  const sx = x < fx ? 1 : -1
  const sy = y < fy ? 1 : -1
  let erro = dx + dy
  const saida: Ponto[] = []
  // O limite evita laço infinito se vier um valor absurdo (NaN já cai fora no Math.round abaixo).
  for (let i = 0; i < 100000; i++) {
    saida.push([x, y])
    if (x === fx && y === fy) break
    const e2 = 2 * erro
    if (e2 >= dy) {
      erro += dy
      x += sx
    }
    if (e2 <= dx) {
      erro += dx
      y += sy
    }
  }
  return saida
}

/** Um número pseudoaleatório estável (0 a 1) para um pixel, para salpicar detalhe sem piscar entre quadros. */
export function ruidoDoPixel(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) / 0x100000000
}
