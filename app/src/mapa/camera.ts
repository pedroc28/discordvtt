// Câmera do mapa. (x, y) é o ponto do mundo que fica no centro da tela.
// Tudo puro, para testar sem navegador.

export interface Camera {
  x: number
  y: number
  zoom: number
}

export const ZOOM_MIN = 0.08
export const ZOOM_MAX = 2.5

export const limitarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

export function telaParaMundo(c: Camera, largura: number, altura: number, sx: number, sy: number) {
  return { x: c.x + (sx - largura / 2) / c.zoom, y: c.y + (sy - altura / 2) / c.zoom }
}

export function mundoParaTela(c: Camera, largura: number, altura: number, x: number, y: number) {
  return { x: (x - c.x) * c.zoom + largura / 2, y: (y - c.y) * c.zoom + altura / 2 }
}

/** Muda o zoom mantendo o ponto sob (sx, sy) no mesmo lugar da tela. */
export function zoomEm(c: Camera, largura: number, altura: number, sx: number, sy: number, fator: number): Camera {
  const zoom = limitarZoom(c.zoom * fator)
  if (zoom === c.zoom) return c
  const antes = telaParaMundo(c, largura, altura, sx, sy)
  return {
    zoom,
    x: antes.x - (sx - largura / 2) / zoom,
    y: antes.y - (sy - altura / 2) / zoom,
  }
}

/** Arrasta o mapa por dx, dy pixels de tela. */
export function arrastar(c: Camera, dx: number, dy: number): Camera {
  return { ...c, x: c.x - dx / c.zoom, y: c.y - dy / c.zoom }
}
