// Desenha a cena no canvas: fundo, grade, tokens e a linha da régua. Só pinta, não decide nada.
// Depende do canvas, então não roda nos testes. As contas ficam em grade.ts e operacoes.ts.

import { telaParaMundo, type Camera } from '../mapa/camera'
import { cantosDaCelula, celulasNaJanela } from './grade'
import { raioDoToken } from './operacoes'
import type { Cena, CorGrade, Ponto, TokenBatalha } from './tipos'

/** Uma linha sobre o mapa, com o texto no meio: a régua e a medida de calibragem. */
export interface LinhaDesenhada {
  de: Ponto
  ate: Ponto
  texto: string
}

export interface QuadroBatalha {
  cena: Cena
  imagem: ImageBitmap | null
  camera: Camera
  /** Tamanho do canvas em pixels de tela (sem a densidade). */
  largura: number
  altura: number
  densidade: number
  selecionadoId: string | null
  linha: LinhaDesenhada | null
  cores: { fundo: string; acento: string }
}

const COR_DA_GRADE: Record<CorGrade, (opacidade: number, acento: string) => string> = {
  clara: (o) => `rgb(255 255 255 / ${o})`,
  escura: (o) => `rgb(0 0 0 / ${o})`,
  acento: (o, acento) => `color-mix(in srgb, ${acento} ${Math.round(o * 100)}%, transparent)`,
}

/** Iniciais para dentro do token: as duas primeiras palavras. */
export function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean)
  if (!palavras.length) return '?'
  return palavras
    .slice(0, 2)
    .map((p) => Array.from(p)[0].toUpperCase())
    .join('')
}

export function desenhar(ctx: CanvasRenderingContext2D, q: QuadroBatalha) {
  const { cena, camera, largura, altura, densidade } = q
  ctx.setTransform(densidade, 0, 0, densidade, 0, 0)
  ctx.fillStyle = q.cores.fundo
  ctx.fillRect(0, 0, largura, altura)

  // Daqui em diante, as coordenadas são as da imagem.
  ctx.setTransform(
    densidade * camera.zoom,
    0,
    0,
    densidade * camera.zoom,
    densidade * (largura / 2 - camera.x * camera.zoom),
    densidade * (altura / 2 - camera.y * camera.zoom),
  )

  if (q.imagem && cena.fundo) ctx.drawImage(q.imagem, 0, 0, cena.fundo.largura, cena.fundo.altura)

  desenharGrade(ctx, q)
  for (const t of cena.tokens) desenharToken(ctx, q, t)
  if (q.linha) desenharLinha(ctx, q, q.linha)
}

function desenharGrade(ctx: CanvasRenderingContext2D, q: QuadroBatalha) {
  const g = q.cena.grade
  // Muito longe, a grade vira um borrão e custa caro: some.
  if (!g.visivel || g.tipo === 'nenhuma' || g.tamanho * q.camera.zoom < 6) return
  const a = telaParaMundo(q.camera, q.largura, q.altura, 0, 0)
  const b = telaParaMundo(q.camera, q.largura, q.altura, q.largura, q.altura)
  const celulas = celulasNaJanela(g, a.x, a.y, b.x, b.y)
  if (!celulas.length) return
  ctx.beginPath()
  for (const c of celulas) {
    const cantos = cantosDaCelula(g, c)
    ctx.moveTo(cantos[0].x, cantos[0].y)
    for (let i = 1; i < cantos.length; i++) ctx.lineTo(cantos[i].x, cantos[i].y)
    ctx.closePath()
  }
  ctx.lineWidth = 1 / q.camera.zoom
  ctx.strokeStyle = COR_DA_GRADE[g.cor](g.opacidade, q.cores.acento)
  ctx.stroke()
}

function desenharToken(ctx: CanvasRenderingContext2D, q: QuadroBatalha, t: TokenBatalha) {
  const raio = raioDoToken(q.cena, t) * 0.92
  const escolhido = t.id === q.selecionadoId
  const px = 1 / q.camera.zoom
  ctx.beginPath()
  ctx.arc(t.x, t.y, raio, 0, Math.PI * 2)
  ctx.fillStyle = t.cor
  ctx.fill()
  ctx.lineWidth = (escolhido ? 3 : 2) * px
  ctx.strokeStyle = escolhido ? q.cores.acento : 'rgb(255 255 255 / 0.9)'
  ctx.stroke()
  if (escolhido) {
    ctx.beginPath()
    ctx.arc(t.x, t.y, raio + 4 * px, 0, Math.PI * 2)
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = 'rgb(255 255 255 / 0.9)'
    ctx.stroke()
  }
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.max(8 * px, raio * 0.85)}px system-ui, sans-serif`
  ctx.fillText(iniciais(t.nome), t.x, t.y + raio * 0.04, raio * 1.7)
  if (escolhido && t.nome) {
    ctx.font = `600 ${13 * px}px system-ui, sans-serif`
    const y = t.y + raio + 12 * px
    ctx.lineWidth = 3 * px
    ctx.strokeStyle = 'rgb(0 0 0 / 0.7)'
    ctx.strokeText(t.nome, t.x, y)
    ctx.fillText(t.nome, t.x, y)
  }
}

function desenharLinha(ctx: CanvasRenderingContext2D, q: QuadroBatalha, l: LinhaDesenhada) {
  const px = 1 / q.camera.zoom
  ctx.lineCap = 'round'
  for (const [largura, cor] of [[5, 'rgb(0 0 0 / 0.55)'], [2.5, '#fff']] as const) {
    ctx.beginPath()
    ctx.moveTo(l.de.x, l.de.y)
    ctx.lineTo(l.ate.x, l.ate.y)
    ctx.lineWidth = largura * px
    ctx.strokeStyle = cor
    ctx.stroke()
  }
  for (const p of [l.de, l.ate]) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5 * px, 0, Math.PI * 2)
    ctx.fillStyle = q.cores.acento
    ctx.fill()
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = '#fff'
    ctx.stroke()
  }
  // O texto fica em tamanho de tela, num selo legível sobre qualquer fundo.
  const meio = { x: (l.de.x + l.ate.x) / 2, y: (l.de.y + l.ate.y) / 2 }
  ctx.save()
  ctx.setTransform(q.densidade, 0, 0, q.densidade, 0, 0)
  const sx = (meio.x - q.camera.x) * q.camera.zoom + q.largura / 2
  const sy = (meio.y - q.camera.y) * q.camera.zoom + q.altura / 2 - 16
  ctx.font = '600 13px system-ui, sans-serif'
  const w = ctx.measureText(l.texto).width + 16
  ctx.fillStyle = 'rgb(20 20 20 / 0.85)'
  ctx.beginPath()
  ctx.roundRect(sx - w / 2, sy - 12, w, 24, 12)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(l.texto, sx, sy)
  ctx.restore()
}
