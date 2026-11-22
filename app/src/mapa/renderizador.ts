// Desenha o mapa num <canvas> 2D. Não conhece React.
//
// Mundo: unidades de tela com zoom 1. R (centro ao canto do hexágono) vem da largura do tile,
// para a imagem encaixar exatamente. Camada de baixo para cima: fundo, terrenos, grade, prévia, seleção.
// Por enquanto tudo é redesenhado a cada quadro; se um dia pesar, o próximo passo é guardar
// cada chunk num bitmap (ver README do mapa).

import type { ControladorMapa } from './controlador'
import { limitarZoom, telaParaMundo, type Camera } from './camera'
import { RAIZ3, TAMANHO_CHUNK, cantos, chave, hexParaPixel, pixelParaHex, type Hex } from './hex'
import type { Tileset } from './tileset'

export interface CoresMapa {
  vazio: string
  grade: string
  destaque: string
}

/** O que mostrar sob o cursor: contorno do pincel, com preenchimento opcional. */
export interface Previa {
  hexes: Hex[]
  preenchimento: string | null
}

/** Abaixo disto o hexágono é pequeno demais: pula as imagens e a grade e usa só a cor. */
const ZOOM_SO_COR = 0.11
const RAIO_MIN_GRADE = 7
const LIMITE_GRADE = 9000
const LIMITE_CHUNKS = 400

export class Renderizador {
  camera: Camera
  hover: Hex | null = null
  selecionado: Hex | null = null
  previa: Previa | null = null
  mostrarGrade = true
  cores: CoresMapa
  aoMudarCamera: (c: Camera) => void = () => {}

  readonly R: number
  private largura = 1
  private altura = 1
  private dpr = 1
  private quadro = 0
  private ctx: CanvasRenderingContext2D
  private cantosRel: { x: number; y: number }[]
  private extraMax: number
  private sair: () => void

  private canvas: HTMLCanvasElement
  private ctrl: ControladorMapa
  private tileset: Tileset

  constructor(canvas: HTMLCanvasElement, ctrl: ControladorMapa, tileset: Tileset, camera: Camera, cores: CoresMapa) {
    this.canvas = canvas
    this.ctrl = ctrl
    this.tileset = tileset
    this.camera = camera
    this.cores = cores
    this.R = tileset.def.largura / RAIZ3
    this.cantosRel = cantos(this.R)
    this.extraMax = Math.max(0, ...tileset.def.terrenos.map((t) => t.extra))
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.sair = ctrl.armazem.ouvir(() => this.pedirQuadro())
  }

  destruir() {
    this.sair()
    if (this.quadro) cancelAnimationFrame(this.quadro)
  }

  redimensionar(largura: number, altura: number, dpr: number) {
    this.largura = Math.max(1, largura)
    this.altura = Math.max(1, altura)
    this.dpr = dpr
    this.canvas.width = Math.round(this.largura * dpr)
    this.canvas.height = Math.round(this.altura * dpr)
    this.pedirQuadro()
  }

  definirCamera(c: Camera) {
    this.camera = { x: c.x, y: c.y, zoom: limitarZoom(c.zoom) }
    this.aoMudarCamera(this.camera)
    this.pedirQuadro()
  }

  centrarEm(h: Hex) {
    const p = hexParaPixel(h, this.R)
    this.definirCamera({ ...this.camera, x: p.x, y: p.y })
  }

  definirGrade(mostrar: boolean) {
    this.mostrarGrade = mostrar
    this.pedirQuadro()
  }

  definirCores(cores: CoresMapa) {
    this.cores = cores
    this.pedirQuadro()
  }

  definirSelecao(h: Hex | null) {
    this.selecionado = h
    this.pedirQuadro()
  }

  corDoTerreno(id: string): string | null {
    return this.tileset.terreno(id)?.cor ?? null
  }

  get tamanhoTela() {
    return { largura: this.largura, altura: this.altura }
  }

  hexSob(sx: number, sy: number): Hex {
    const m = telaParaMundo(this.camera, this.largura, this.altura, sx, sy)
    return pixelParaHex(m.x, m.y, this.R)
  }

  pedirQuadro() {
    if (this.quadro) return
    this.quadro = requestAnimationFrame(() => {
      this.quadro = 0
      this.desenhar()
    })
  }

  private caminhoHex(x: number, y: number, raio = this.R) {
    const k = raio / this.R
    const ctx = this.ctx
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const c = this.cantosRel[i]
      if (i === 0) ctx.moveTo(x + c.x * k, y + c.y * k)
      else ctx.lineTo(x + c.x * k, y + c.y * k)
    }
    ctx.closePath()
  }

  /** Caixa visível em coordenadas axiais, com folga. */
  private limitesAxiais() {
    const { camera: c, R } = this
    const hw = this.largura / (2 * c.zoom)
    const hh = this.altura / (2 * c.zoom)
    let qmin = Infinity
    let qmax = -Infinity
    let rmin = Infinity
    let rmax = -Infinity
    for (const [x, y] of [
      [c.x - hw, c.y - hh],
      [c.x + hw, c.y - hh],
      [c.x - hw, c.y + hh],
      [c.x + hw, c.y + hh],
    ]) {
      const q = ((RAIZ3 / 3) * x - y / 3) / R
      const r = ((2 / 3) * y) / R
      qmin = Math.min(qmin, q)
      qmax = Math.max(qmax, q)
      rmin = Math.min(rmin, r)
      rmax = Math.max(rmax, r)
    }
    return {
      qmin: Math.floor(qmin) - 2,
      qmax: Math.ceil(qmax) + 2,
      rmin: Math.floor(rmin) - 2,
      rmax: Math.ceil(rmax) + 3,
      x0: c.x - hw,
      x1: c.x + hw,
      y0: c.y - hh,
      y1: c.y + hh,
    }
  }

  desenhar() {
    const { ctx, camera: cam, R, dpr } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = this.cores.vazio
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    const z = cam.zoom
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.largura / 2 - cam.x * z), dpr * (this.altura / 2 - cam.y * z))

    const lim = this.limitesAxiais()
    this.pedirChunks(lim)

    const largTile = this.tileset.def.largura
    const comImagem = z >= ZOOM_SO_COR
    const folgaX = largTile
    const folgaCima = R * 1.2
    const folgaBaixo = R * 1.2 + this.extraMax

    // 1. terrenos, de cima para baixo, para o que passa por cima do vizinho de cima ficar certo
    const visiveis: { q: number; r: number; x: number; y: number; terreno: string }[] = []
    const cq0 = Math.floor(lim.qmin / TAMANHO_CHUNK)
    const cq1 = Math.floor(lim.qmax / TAMANHO_CHUNK)
    const cr0 = Math.floor(lim.rmin / TAMANHO_CHUNK)
    const cr1 = Math.floor(lim.rmax / TAMANHO_CHUNK)
    for (let cq = cq0; cq <= cq1; cq++) {
      for (let cr = cr0; cr <= cr1; cr++) {
        for (const h of this.ctrl.armazem.hexagonosDoChunk(chave(cq, cr))) {
          const { x, y } = hexParaPixel(h, R)
          if (x < lim.x0 - folgaX || x > lim.x1 + folgaX || y < lim.y0 - folgaCima || y > lim.y1 + folgaBaixo) continue
          visiveis.push({ q: h.q, r: h.r, x, y, terreno: h.terreno })
        }
      }
    }
    visiveis.sort((a, b) => a.r - b.r || a.q - b.q)
    for (const v of visiveis) {
      const def = this.tileset.terreno(v.terreno)
      ctx.fillStyle = def?.cor ?? '#7a7a7a'
      this.caminhoHex(v.x, v.y, R + 1)
      ctx.fill()
      const img = comImagem && def ? this.tileset.imagem(v.terreno, v.q, v.r) : null
      if (img) ctx.drawImage(img, v.x - largTile / 2, v.y - R - def!.extra, largTile, 2 * R + def!.extra)
    }

    // 2. grade, cada aresta uma vez (as arestas leste, sudeste e sudoeste de cada hexágono)
    if (this.mostrarGrade && R * z >= RAIZ3 * RAIO_MIN_GRADE * 0.6) {
      const total = (lim.qmax - lim.qmin + 1) * (lim.rmax - lim.rmin + 1)
      if (total <= LIMITE_GRADE) {
        ctx.beginPath()
        for (let r = lim.rmin; r <= lim.rmax; r++) {
          for (let q = lim.qmin; q <= lim.qmax; q++) {
            const { x, y } = hexParaPixel({ q, r }, R)
            if (x < lim.x0 - R || x > lim.x1 + R || y < lim.y0 - R || y > lim.y1 + R) continue
            for (let i = 0; i < 3; i++) {
              const a = this.cantosRel[i]
              const b = this.cantosRel[i + 1]
              ctx.moveTo(x + a.x, y + a.y)
              ctx.lineTo(x + b.x, y + b.y)
            }
          }
        }
        ctx.strokeStyle = this.cores.grade
        ctx.lineWidth = Math.max(1 / z, 1)
        ctx.stroke()
      }
    }

    // 3. prévia do pincel
    if (this.previa && this.previa.hexes.length) {
      if (this.previa.preenchimento) {
        ctx.fillStyle = this.previa.preenchimento
        for (const h of this.previa.hexes) {
          const { x, y } = hexParaPixel(h, R)
          this.caminhoHex(x, y)
          ctx.fill()
        }
      }
      ctx.strokeStyle = this.cores.destaque
      ctx.lineWidth = 2 / z
      ctx.beginPath()
      for (const h of this.previa.hexes) {
        const { x, y } = hexParaPixel(h, R)
        for (let i = 0; i < 6; i++) {
          const c = this.cantosRel[i]
          if (i === 0) ctx.moveTo(x + c.x, y + c.y)
          else ctx.lineTo(x + c.x, y + c.y)
        }
        ctx.closePath()
      }
      ctx.stroke()
    }

    // 4. seleção
    if (this.selecionado) {
      const { x, y } = hexParaPixel(this.selecionado, R)
      this.caminhoHex(x, y)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 6 / z
      ctx.stroke()
      ctx.strokeStyle = this.cores.destaque
      ctx.lineWidth = 3.5 / z
      ctx.stroke()
    }
  }

  /** Pede ao controlador os chunks da área visível. Os que chegam provocam novo quadro. */
  private pedirChunks(lim: { qmin: number; qmax: number; rmin: number; rmax: number }) {
    const cq0 = Math.floor(lim.qmin / TAMANHO_CHUNK)
    const cq1 = Math.floor(lim.qmax / TAMANHO_CHUNK)
    const cr0 = Math.floor(lim.rmin / TAMANHO_CHUNK)
    const cr1 = Math.floor(lim.rmax / TAMANHO_CHUNK)
    if ((cq1 - cq0 + 1) * (cr1 - cr0 + 1) > LIMITE_CHUNKS) return
    for (let cq = cq0; cq <= cq1; cq++) {
      for (let cr = cr0; cr <= cr1; cr++) void this.ctrl.garantirChunk(chave(cq, cr))
    }
  }
}
