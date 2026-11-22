// Desenha o mapa num <canvas> 2D. Não conhece React.
//
// Mundo: unidades de tela com zoom 1. R (centro ao canto do hexágono) vem da largura do tile,
// para a imagem encaixar exatamente. Camadas de baixo para cima: fundo, terrenos, regiões (cor e
// bordas), grade, rios, estradas, marcadores e nomes, rótulos de região, régua, prévia, seleção
// e token do grupo.
// Por enquanto tudo é redesenhado a cada quadro; se um dia pesar, o próximo passo é guardar
// cada chunk num bitmap (ver README do mapa).

import type { ControladorMapa } from './controlador'
import { limitarZoom, mundoParaTela, telaParaMundo, type Camera } from './camera'
import { RAIZ3, TAMANHO_CHUNK, cantos, chave, hexParaPixel, pixelParaHex, vizinho, type Aresta, type Hex } from './hex'
import { raizDaRegiao } from './operacoes'
import { pixelsDaLinha, ruidoDoPixel } from './pixellinhas'
import { medirRegua, textoDaMedida, type Regua } from './regua'
import type { Regiao } from './tipos'
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

interface HexVisivel {
  q: number
  r: number
  x: number
  y: number
  terreno: string
  nome: string
  marcadores: { tipo: string }[]
  rios: number[]
  estradas: number[]
  regiao: Regiao | null
}

interface RotuloRegiao {
  nome: string
  x: number
  y: number
}

/** Abaixo disto o hexágono é pequeno demais: pula as imagens e a grade e usa só a cor. */
const ZOOM_SO_COR = 0.11
const ZOOM_NOMES = 0.22
const RAIO_MIN_GRADE = 7
const LIMITE_GRADE = 9000
const LIMITE_CHUNKS = 400
const COR_PADRAO_MARCADOR = '#d6336c'
/** Largura, em pixels da arte, de um hexágono no tileset em pixel art. Define o tamanho do "pixel" de rios e estradas. */
const RESOLUCAO_ARTE = 128
const FONTE = "'Atkinson Hyperlegible Next', system-ui, sans-serif"

export class Renderizador {
  camera: Camera
  hover: Hex | null = null
  selecionado: Hex | null = null
  previa: Previa | null = null
  /** Aresta que a ferramenta Rio vai pegar no próximo toque. */
  previaAresta: Aresta | null = null
  /** Onde o token vai cair enquanto alguém o arrasta. Null se ninguém está arrastando. */
  tokenFantasma: Hex | null = null
  /** Rota de viagem em andamento: os pontos marcados e o caminho calculado entre eles. Só local. */
  rota: { pontos: Hex[]; caminho: Hex[] } | null = null
  /** Régua em andamento. Só local. */
  regua: Regua | null = null
  /** Onde o cursor está enquanto a régua só tem o primeiro ponto. */
  reguaPonta: Hex | null = null
  mostrarGrade = true
  mostrarRegioes = true
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
  private sairRegioes: () => void
  private sairToken: () => void
  private canvas: HTMLCanvasElement
  private ctrl: ControladorMapa
  private tileset: Tileset
  private cacheRotulos: { versao: number; versaoRegioes: number; lista: RotuloRegiao[] } | null = null

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
    this.sairRegioes = ctrl.armazem.ouvirRegioes(() => this.pedirQuadro())
    this.sairToken = ctrl.ouvirToken(() => this.pedirQuadro())
  }

  destruir() {
    this.sair()
    this.sairRegioes()
    this.sairToken()
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

  /**
   * Se o hexágono está embaixo na tela, sobe o mapa para ele ficar à vista. Serve para o painel
   * que sobe da base no celular não cobrir o que acabou de ser selecionado.
   */
  trazerParaCima(h: Hex, limite = 0.38, alvo = 0.2) {
    const p = hexParaPixel(h, this.R)
    const t = mundoParaTela(this.camera, this.largura, this.altura, p.x, p.y)
    if (t.y <= this.altura * limite) return
    this.definirCamera({ ...this.camera, y: p.y - (this.altura * alvo - this.altura / 2) / this.camera.zoom })
  }

  definirGrade(mostrar: boolean) {
    this.mostrarGrade = mostrar
    this.pedirQuadro()
  }

  definirMostrarRegioes(mostrar: boolean) {
    this.mostrarRegioes = mostrar
    this.pedirQuadro()
  }

  definirCores(cores: CoresMapa) {
    this.cores = cores
    this.pedirQuadro()
  }

  definirFantasmaToken(h: Hex | null) {
    this.tokenFantasma = h
    this.pedirQuadro()
  }

  definirRota(rota: { pontos: Hex[]; caminho: Hex[] } | null) {
    this.rota = rota
    this.pedirQuadro()
  }

  /** Troca (ou limpa, com null) a régua e esquece o ponto do cursor. */
  definirRegua(regua: Regua | null) {
    this.regua = regua
    this.reguaPonta = null
    this.pedirQuadro()
  }

  definirSelecao(h: Hex | null) {
    this.selecionado = h
    this.pedirQuadro()
  }

  corDoTerreno(id: string): string | null {
    return this.tileset.terreno(id)?.cor ?? null
  }

  corDaRegiao(id: string | null): string | null {
    return id ? (this.ctrl.armazem.lerRegiao(id)?.cor ?? null) : null
  }

  get tamanhoTela() {
    return { largura: this.largura, altura: this.altura }
  }

  /** Ponto da tela em coordenadas do mundo. */
  pontoMundo(sx: number, sy: number) {
    return telaParaMundo(this.camera, this.largura, this.altura, sx, sy)
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
    // Os tiles são rasterizados em tamanho nativo (largura do tileset): com zoom acima de 1 ampliam, e pixel art não pode suavizar.
    ctx.imageSmoothingEnabled = !(this.tileset.def.pixelart && z >= 1)
    const comImagem = z >= ZOOM_SO_COR
    const folgaX = largTile
    const folgaCima = R * 1.2
    const folgaBaixo = R * 1.2 + this.extraMax
    const armazem = this.ctrl.armazem

    // 1. terrenos, de cima para baixo, para o que passa por cima do vizinho de cima ficar certo
    const visiveis: HexVisivel[] = []
    const cq0 = Math.floor(lim.qmin / TAMANHO_CHUNK)
    const cq1 = Math.floor(lim.qmax / TAMANHO_CHUNK)
    const cr0 = Math.floor(lim.rmin / TAMANHO_CHUNK)
    const cr1 = Math.floor(lim.rmax / TAMANHO_CHUNK)
    for (let cq = cq0; cq <= cq1; cq++) {
      for (let cr = cr0; cr <= cr1; cr++) {
        for (const h of armazem.hexagonosDoChunk(chave(cq, cr))) {
          const { x, y } = hexParaPixel(h, R)
          if (x < lim.x0 - folgaX || x > lim.x1 + folgaX || y < lim.y0 - folgaCima || y > lim.y1 + folgaBaixo) continue
          visiveis.push({
            q: h.q,
            r: h.r,
            x,
            y,
            terreno: h.terreno,
            nome: h.nome,
            marcadores: h.marcadores,
            rios: h.rios,
            estradas: h.estradas,
            regiao: h.regiaoId ? armazem.lerRegiao(h.regiaoId) : null,
          })
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

    // 1b. transição entre terrenos: pixels do vizinho misturados na borda (por pontilhado)
    if (this.tileset.def.transicoes && comImagem) this.desenharTransicoes(visiveis)

    // 2. regiões: cor suave por cima do terreno e borda onde a região muda
    if (this.mostrarRegioes) this.desenharRegioes(visiveis, z)

    // 3. grade, cada aresta uma vez (as arestas leste, sudeste e sudoeste de cada hexágono)
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

    // 4. rios e estradas (a estrada passa por cima do rio, como uma ponte)
    if (this.tileset.def.pixelart) {
      this.desenharLinhasPixel(visiveis, lim)
    } else {
      this.desenharRios(visiveis, z)
      this.desenharEstradas(visiveis, z)
    }

    // 5. marcadores e nomes dos hexágonos
    if (z >= ZOOM_SO_COR) this.desenharMarcadoresENomes(visiveis, z)

    // 6. rótulos das regiões
    if (this.mostrarRegioes) this.desenharRotulos(lim, z)

    // 7. rota de viagem e régua
    this.desenharRota(z)
    this.desenharRegua(z)

    // 8. prévia do pincel
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
    if (this.previaAresta) {
      const a = this.previaAresta
      const { x, y } = hexParaPixel(a, R)
      ctx.lineCap = 'round'
      ctx.strokeStyle = this.cores.destaque
      ctx.lineWidth = Math.max(R * 0.2, 4 / z)
      ctx.beginPath()
      ctx.moveTo(x + this.cantosRel[a.d].x, y + this.cantosRel[a.d].y)
      ctx.lineTo(x + this.cantosRel[a.d + 1].x, y + this.cantosRel[a.d + 1].y)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }

    // 9. seleção
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

    // 10. token do grupo, por cima de tudo
    this.desenharToken(z)
  }

  /** Em cada borda onde o vizinho é de outro terreno, põe a faixa de mistura com a textura dele. */
  private desenharTransicoes(visiveis: HexVisivel[]) {
    const { ctx, R } = this
    const armazem = this.ctrl.armazem
    const larg = this.tileset.def.largura
    for (const v of visiveis) {
      for (let d = 0; d < 6; d++) {
        const o = vizinho(v, d)
        const viz = armazem.ler(o.q, o.r)
        if (!viz || viz.terreno === v.terreno) continue
        const faixa = this.tileset.sobreposicao(viz.terreno, o.q, o.r, d)
        if (faixa) ctx.drawImage(faixa, v.x - larg / 2, v.y - R, larg, 2 * R)
      }
    }
  }

  private camadaPixel: HTMLCanvasElement | null = null

  /**
   * Rios e estradas no estilo da arte: cada traço é feito pixel a pixel numa camada do tamanho da tela
   * em "pixels da arte" (o mesmo tamanho dos pixels dos tiles) e ampliada sem suavizar. Rio azul com
   * brilho, estrada de terra com salpicos. A estrada passa por cima do rio, como uma ponte.
   */
  private desenharLinhasPixel(visiveis: HexVisivel[], lim: { x0: number; x1: number; y0: number; y1: number }) {
    const { ctx, R } = this
    if (!visiveis.some((v) => v.rios.length || v.estradas.length)) return
    const armazem = this.ctrl.armazem
    const px = this.tileset.def.largura / RESOLUCAO_ARTE
    const ox = Math.floor(lim.x0 / px) - 4
    const oy = Math.floor(lim.y0 / px) - 4
    const w = Math.ceil((lim.x1 - lim.x0) / px) + 9
    const h = Math.ceil((lim.y1 - lim.y0) / px) + 9
    if (w * h > 4_000_000) return
    const c = (this.camadaPixel ??= document.createElement('canvas'))
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
    const g = c.getContext('2d')!
    g.clearRect(0, 0, w, h)

    type Seg = [number, number, number, number]
    const rios: Seg[] = []
    const estradas: Seg[] = []
    const paraPixel = (x: number, y: number): [number, number] => [x / px - ox, y / px - oy]
    for (const v of visiveis) {
      for (const d of v.rios) {
        const o = vizinho(v, d)
        if (!armazem.ler(o.q, o.r)) continue
        const a = this.cantosRel[d]
        const b = this.cantosRel[(d + 1) % 6]
        rios.push([...paraPixel(v.x + a.x, v.y + a.y), ...paraPixel(v.x + b.x, v.y + b.y)])
      }
      for (const d of v.estradas) {
        const o = vizinho(v, d)
        if (!armazem.ler(o.q, o.r)) continue
        const p = hexParaPixel(o, R)
        estradas.push([...paraPixel(v.x, v.y), ...paraPixel(p.x, p.y)])
      }
    }

    const carimbar = (segs: Seg[], tam: number, cor: string) => {
      g.fillStyle = cor
      const m = Math.floor(tam / 2)
      for (const [x0, y0, x1, y1] of segs) {
        for (const [x, y] of pixelsDaLinha(x0, y0, x1, y1)) g.fillRect(x - m, y - m, tam, tam)
      }
    }
    const salpicar = (segs: Seg[], tam: number, cor: string, chance: number) => {
      g.fillStyle = cor
      const m = Math.floor(tam / 2)
      for (const [x0, y0, x1, y1] of segs) {
        for (const [x, y] of pixelsDaLinha(x0, y0, x1, y1)) {
          if (ruidoDoPixel(x + ox, y + oy) < chance) g.fillRect(x - m, y - m, tam, tam)
        }
      }
    }

    // Larguras ímpares, para o traço ficar centrado no pixel.
    carimbar(rios, 7, '#1f4f86') // contorno
    carimbar(rios, 5, '#3b86c6') // água
    carimbar(rios, 3, '#79c4ec') // meio claro
    salpicar(rios, 1, '#e6f7ff', 0.16) // brilho
    carimbar(estradas, 7, '#4a3520') // contorno
    carimbar(estradas, 5, '#c9a56b') // terra
    salpicar(estradas, 3, '#e3c98f', 0.2) // trechos claros
    salpicar(estradas, 1, '#8a6a3b', 0.25) // pedrinhas

    ctx.drawImage(c, ox * px, oy * px, w * px, h * px)
  }

  /** Rio pela borda do hexágono dono. Só aparece se os dois lados existem (se um foi apagado, o dado fica guardado). */
  private desenharRios(visiveis: HexVisivel[], z: number) {
    const { ctx, R } = this
    if (!visiveis.some((v) => v.rios.length)) return
    const armazem = this.ctrl.armazem
    ctx.beginPath()
    for (const v of visiveis) {
      for (const d of v.rios) {
        const o = vizinho(v, d)
        if (!armazem.ler(o.q, o.r)) continue
        const a = this.cantosRel[d]
        const b = this.cantosRel[(d + 1) % 6]
        ctx.moveTo(v.x + a.x, v.y + a.y)
        ctx.lineTo(v.x + b.x, v.y + b.y)
      }
    }
    const largura = Math.max(R * 0.15, 3 / z)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#2b66a6'
    ctx.lineWidth = largura
    ctx.stroke()
    ctx.strokeStyle = '#8fd0f2'
    ctx.lineWidth = largura * 0.55
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** Estrada ligando o centro do hexágono dono ao do vizinho, em linha reta. */
  private desenharEstradas(visiveis: HexVisivel[], z: number) {
    const { ctx, R } = this
    if (!visiveis.some((v) => v.estradas.length)) return
    const armazem = this.ctrl.armazem
    ctx.beginPath()
    for (const v of visiveis) {
      for (const d of v.estradas) {
        const o = vizinho(v, d)
        if (!armazem.ler(o.q, o.r)) continue
        const p = hexParaPixel(o, R)
        ctx.moveTo(v.x, v.y)
        ctx.lineTo(p.x, p.y)
      }
    }
    const largura = Math.max(R * 0.12, 2.5 / z)
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#4e3a20'
    ctx.lineWidth = largura
    ctx.stroke()
    ctx.strokeStyle = '#dcc088'
    ctx.lineWidth = largura * 0.55
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** Linha reta entre os dois pontos, hexágonos do caminho levemente marcados e a distância no meio. */
  private desenharRegua(z: number) {
    const regua = this.regua
    if (!regua) return
    const fim = regua.b ?? this.reguaPonta
    const { ctx, R } = this
    const a = hexParaPixel(regua.a, R)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const ponto = (p: { x: number; y: number }, cor: string) => {
      ctx.fillStyle = cor
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 2 / z
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(R * 0.13, 5 / z), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    if (!fim) {
      ponto(a, '#ffd24a')
      return
    }
    const medida = medirRegua(regua.a, fim)
    ctx.fillStyle = 'rgba(255,210,74,0.22)'
    for (const h of medida.caminho) {
      const p = hexParaPixel(h, R)
      this.caminhoHex(p.x, p.y)
      ctx.fill()
    }
    const b = hexParaPixel(fim, R)
    ctx.setLineDash([R * 0.25, R * 0.18])
    for (const [cor, largura] of [['#1a1a1a', 5], ['#ffd24a', 2.5]] as const) {
      ctx.strokeStyle = cor
      ctx.lineWidth = largura / z
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ponto(a, '#ffd24a')
    ponto(b, regua.b ? '#ffd24a' : '#ffffff')

    // Etiqueta com a distância, no meio da linha.
    const px = 14 / z
    const texto = textoDaMedida(medida.passos)
    ctx.font = `700 ${px}px ${FONTE}`
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const w = ctx.measureText(texto).width + px
    ctx.fillStyle = 'rgba(20,20,20,0.88)'
    ctx.beginPath()
    ctx.roundRect(mx - w / 2, my - px * 0.85, w, px * 1.7, px * 0.5)
    ctx.fill()
    ctx.fillStyle = '#ffd24a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(texto, mx, my + px * 0.04)
  }

  /** Alfinete framboesa com a ponta no centro do hexágono onde o grupo está. */
  /** Linha tracejada pelo caminho da rota, com um selo numerado em cada ponto marcado. */
  private desenharRota(z: number) {
    const rota = this.rota
    if (!rota || !rota.pontos.length) return
    const { ctx, R } = this
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (rota.caminho.length > 1) {
      const pts = rota.caminho.map((h) => hexParaPixel(h, R))
      ctx.setLineDash([R * 0.22, R * 0.16])
      for (const [cor, largura] of [['#1a1a1a', 6], ['#ff8a1f', 3]] as const) {
        ctx.strokeStyle = cor
        ctx.lineWidth = largura / z
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
    const raio = Math.max(R * 0.14, 9 / z)
    ctx.font = `800 ${raio * 1.2}px ${FONTE}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    rota.pontos.forEach((h, i) => {
      const { x, y } = hexParaPixel(h, R)
      ctx.fillStyle = '#ff8a1f'
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 2 / z
      ctx.beginPath()
      ctx.arc(x, y, raio, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#1a1a1a'
      ctx.fillText(String(i + 1), x, y + raio * 0.05)
    })
  }

  /** Desenha o token do grupo. Enquanto alguém o arrasta, o lugar de origem fica apagado e a peça aparece no destino. */
  private desenharToken(z: number) {
    const t = this.ctrl.token
    const f = this.tokenFantasma
    if (f) {
      if (t) this.desenharPeca(z, t, 0.35)
      this.desenharPeca(z, f, 0.95)
    } else if (t) {
      this.desenharPeca(z, t, 1)
    }
  }

  private desenharPeca(z: number, t: Hex, alfa: number) {
    const { ctx } = this
    ctx.globalAlpha = alfa
    this.desenharFormaDoToken(z, t)
    ctx.globalAlpha = 1
  }

  private desenharFormaDoToken(z: number, t: Hex) {
    const { ctx, R } = this
    const { x, y } = hexParaPixel(t, R)
    const sprite = this.tileset.imagemToken()
    if (sprite) {
      // Sprite do tileset: a base do desenho (a parte de baixo, ~92% da altura) fica um pouco abaixo do centro do hexágono.
      const lado = R * 1.25
      ctx.drawImage(sprite, x - lado / 2, y + R * 0.3 - lado * 0.92, lado, lado)
      return
    }
    const raio = R * 0.27
    const cy = y - R * 0.4
    const ponta = y + R * 0.12
    const alfa = Math.acos(raio / (ponta - cy))
    ctx.beginPath()
    ctx.moveTo(x, ponta)
    ctx.lineTo(x + Math.sin(alfa) * raio, cy + Math.cos(alfa) * raio)
    ctx.arc(x, cy, raio, Math.PI / 2 - alfa, Math.PI / 2 + alfa, true)
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.fillStyle = COR_PADRAO_MARCADOR
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(R * 0.07, 2.5 / z)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, cy, raio * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  private desenharRegioes(visiveis: HexVisivel[], z: number) {
    const { ctx, R } = this
    const armazem = this.ctrl.armazem
    const doRegiao = visiveis.filter((v) => v.regiao)
    if (!doRegiao.length) return

    ctx.globalAlpha = 0.27
    for (const v of doRegiao) {
      ctx.fillStyle = v.regiao!.cor
      this.caminhoHex(v.x, v.y, R + 0.5)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Borda: grossa onde muda a região de topo (reino), fina onde muda só a sub-região (província).
    const raizes = new Map<string, string | null>()
    const raizDe = (id: string) => {
      if (!raizes.has(id)) raizes.set(id, raizDaRegiao(armazem, id))
      return raizes.get(id)!
    }
    const grossa = Math.max(R * 0.07, 3 / z)
    const fina = Math.max(R * 0.03, 1.5 / z)
    const recuo = 0.93
    ctx.lineCap = 'round'
    for (const v of doRegiao) {
      const propria = v.regiao!
      for (let i = 0; i < 6; i++) {
        const viz = vizinho(v, i)
        const idViz = armazem.ler(viz.q, viz.r)?.regiaoId ?? null
        const regiaoViz = idViz ? armazem.lerRegiao(idViz) : null
        if (regiaoViz?.id === propria.id) continue
        const mesmaRaiz = !!regiaoViz && raizDe(regiaoViz.id) === raizDe(propria.id)
        const a = this.cantosRel[i]
        const b = this.cantosRel[(i + 1) % 6]
        ctx.beginPath()
        ctx.moveTo(v.x + a.x * recuo, v.y + a.y * recuo)
        ctx.lineTo(v.x + b.x * recuo, v.y + b.y * recuo)
        ctx.strokeStyle = propria.cor
        ctx.lineWidth = mesmaRaiz ? fina : grossa
        ctx.stroke()
      }
    }
    ctx.lineCap = 'butt'
  }

  private desenharMarcadoresENomes(visiveis: HexVisivel[], z: number) {
    const { ctx, R } = this
    const comNomes = z >= ZOOM_NOMES
    for (const v of visiveis) {
      const n = Math.min(v.marcadores.length, 3)
      const temNome = comNomes && !!v.nome
      const subir = temNome ? R * 0.14 : 0
      if (n > 0) {
        const tamanho = n === 1 ? R * 0.82 : n === 2 ? R * 0.62 : R * 0.5
        const passo = n === 1 ? 0 : tamanho * 1.02
        const x0 = v.x - (passo * (n - 1)) / 2
        for (let i = 0; i < n; i++) {
          const cx = x0 + passo * i
          const cy = v.y - subir
          const img = this.tileset.imagemMarcador(v.marcadores[i].tipo)
          if (img) {
            ctx.drawImage(img, cx - tamanho / 2, cy - tamanho / 2, tamanho, tamanho)
          } else {
            ctx.fillStyle = COR_PADRAO_MARCADOR
            ctx.strokeStyle = '#1a1a1a'
            ctx.lineWidth = tamanho * 0.08
            ctx.beginPath()
            ctx.arc(cx, cy, tamanho * 0.42, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        }
        if (v.marcadores.length > 3) {
          const raio = R * 0.17
          const cx = v.x + R * 0.62
          const cy = v.y - R * 0.5
          ctx.fillStyle = '#1a1a1a'
          ctx.beginPath()
          ctx.arc(cx, cy, raio, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = `700 ${raio * 1.3}px ${FONTE}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(`+${v.marcadores.length - 3}`, cx, cy + raio * 0.05)
        }
      }
      if (temNome) {
        const tamanho = R * 0.2
        ctx.font = `700 ${tamanho}px ${FONTE}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = tamanho * 0.28
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'
        const y = v.y + (n > 0 ? R * 0.56 : R * 0.08)
        ctx.strokeText(v.nome, v.x, y, R * 1.55)
        ctx.fillStyle = '#fff'
        ctx.fillText(v.nome, v.x, y, R * 1.55)
      }
    }
  }

  /** Nome de cada região, no hexágono dela mais perto do centro. Só recalcula quando o mapa muda. */
  private rotulos(): RotuloRegiao[] {
    const armazem = this.ctrl.armazem
    const c = this.cacheRotulos
    if (c && c.versao === armazem.versao && c.versaoRegioes === armazem.versaoRegioes) return c.lista
    const R = this.R
    const somas = new Map<string, { x: number; y: number; n: number }>()
    for (const h of armazem.todosOsHexagonos()) {
      if (!h.regiaoId || !armazem.lerRegiao(h.regiaoId)) continue
      const p = hexParaPixel(h, R)
      const s = somas.get(h.regiaoId)
      if (s) {
        s.x += p.x
        s.y += p.y
        s.n++
      } else {
        somas.set(h.regiaoId, { x: p.x, y: p.y, n: 1 })
      }
    }
    const melhor = new Map<string, { x: number; y: number; d: number }>()
    for (const h of armazem.todosOsHexagonos()) {
      if (!h.regiaoId) continue
      const s = somas.get(h.regiaoId)
      if (!s) continue
      const p = hexParaPixel(h, R)
      const d = Math.hypot(p.x - s.x / s.n, p.y - s.y / s.n)
      const m = melhor.get(h.regiaoId)
      if (!m || d < m.d) melhor.set(h.regiaoId, { x: p.x, y: p.y, d })
    }
    const lista: RotuloRegiao[] = []
    for (const [id, m] of melhor) lista.push({ nome: armazem.lerRegiao(id)!.nome, x: m.x, y: m.y })
    this.cacheRotulos = { versao: armazem.versao, versaoRegioes: armazem.versaoRegioes, lista }
    return lista
  }

  private desenharRotulos(lim: { x0: number; x1: number; y0: number; y1: number }, z: number) {
    const { ctx, R } = this
    const px = Math.min(32, Math.max(14, R * z * 0.38))
    const tamanho = px / z
    ctx.font = `800 ${tamanho}px ${FONTE}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = tamanho * 0.24
    for (const r of this.rotulos()) {
      if (!r.nome || r.x < lim.x0 - R * 6 || r.x > lim.x1 + R * 6 || r.y < lim.y0 - R * 3 || r.y > lim.y1 + R * 3) continue
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx.strokeText(r.nome, r.x, r.y)
      ctx.fillStyle = '#fff'
      ctx.fillText(r.nome, r.x, r.y)
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
