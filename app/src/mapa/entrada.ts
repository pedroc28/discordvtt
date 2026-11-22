// Mouse, toque e caneta no mapa, tudo por Pointer Events.
//
//   Ferramenta Navegar: um dedo (ou o mouse) arrasta o mapa; um toque rápido seleciona o hexágono.
//   Ferramentas Pintar e Apagar: um dedo pinta; dois dedos sempre arrastam e dão zoom (e cancelam
//   a pincelada em andamento, para um gesto de pinça não deixar rastro).
//   Botão do meio, botão direito ou Espaço + arrastar: sempre movem o mapa, em qualquer ferramenta.
//   Roda do mouse (ou pinça no touchpad): zoom no ponto sob o cursor.

import { arrastar, zoomEm } from './camera'
import type { ControladorMapa, Traco } from './controlador'
import { disco, linha, mesmoHex, type Hex } from './hex'
import type { Renderizador } from './renderizador'

/**
 * Pintar, Apagar e Região usam o pincel (arrastando). Navegar e Marcador movem o mapa arrastando
 * e agem num toque rápido: Navegar seleciona o hexágono, Marcador coloca um marcador nele.
 */
export type Ferramenta = 'navegar' | 'pintar' | 'apagar' | 'regiao' | 'marcador'

export interface OpcoesEntrada {
  ferramenta: Ferramenta
  terreno: string
  /** Região usada pela ferramenta Região. Null tira os hexágonos de qualquer região. */
  regiaoId: string | null
  /** Raio do pincel: 0 = 1 hexágono, 1 = 7, 2 = 19. */
  raio: number
}

const usaPincel = (f: Ferramenta) => f === 'pintar' || f === 'apagar' || f === 'regiao'

const LIMITE_TOQUE_PX = 8
const LIMITE_TOQUE_MS = 450

type Modo = 'nenhum' | 'arrastar' | 'traco' | 'gesto'

export class EntradaMapa {
  opcoes: OpcoesEntrada
  aoSelecionar: (h: Hex) => void = () => {}
  aoMarcar: (h: Hex) => void = () => {}
  aoPassar: (h: Hex | null) => void = () => {}
  aoMudarPrevia: () => void = () => {}

  private ponteiros = new Map<number, { x: number; y: number }>()
  private modo: Modo = 'nenhum'
  private traco: Traco | null = null
  private ultimoHex: Hex | null = null
  private inicioToque = { x: 0, y: 0, t: 0 }
  private gesto = { dist: 0, cx: 0, cy: 0 }
  private espaco = false
  private limpar: (() => void)[] = []

  private canvas: HTMLCanvasElement
  private render: Renderizador
  private ctrl: ControladorMapa

  constructor(canvas: HTMLCanvasElement, render: Renderizador, ctrl: ControladorMapa, opcoes: OpcoesEntrada) {
    this.canvas = canvas
    this.render = render
    this.ctrl = ctrl
    this.opcoes = opcoes
    this.ligar(canvas, 'pointerdown', this.aoPressionar as EventListener)
    this.ligar(canvas, 'pointermove', this.aoMover as EventListener)
    this.ligar(canvas, 'pointerup', this.aoSoltar as EventListener)
    this.ligar(canvas, 'pointercancel', this.aoCancelar as EventListener)
    this.ligar(canvas, 'pointerleave', this.aoSair as EventListener)
    this.ligar(canvas, 'wheel', this.aoRoda as EventListener, { passive: false })
    this.ligar(canvas, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener)
    this.ligar(window, 'keydown', this.aoTecla as EventListener)
    this.ligar(window, 'keyup', this.aoTecla as EventListener)
    this.ligar(window, 'blur', (() => (this.espaco = false)) as EventListener)
  }

  destruir() {
    this.traco?.cancelar()
    for (const f of this.limpar) f()
  }

  definirOpcoes(opcoes: OpcoesEntrada) {
    this.opcoes = opcoes
    this.atualizarPrevia()
  }

  /** Atualiza o contorno do pincel (ao trocar ferramenta, terreno ou raio). */
  atualizarPrevia() {
    const { ferramenta, terreno, regiaoId, raio } = this.opcoes
    const h = this.render.hover
    if (!h) {
      this.render.previa = null
    } else if (!usaPincel(ferramenta)) {
      this.render.previa = { hexes: [h], preenchimento: null }
    } else {
      let preenchimento: string
      if (ferramenta === 'apagar') preenchimento = 'rgba(220,40,40,0.28)'
      else if (ferramenta === 'regiao') {
        const cor = this.render.corDaRegiao(regiaoId)
        preenchimento = cor ? `${cor}88` : 'rgba(255,255,255,0.22)'
      } else preenchimento = this.corDoTerreno(terreno)
      this.render.previa = { hexes: disco(h, raio), preenchimento }
    }
    this.render.pedirQuadro()
    this.aoMudarPrevia()
  }

  private corDoTerreno(id: string) {
    const cor = this.render.corDoTerreno(id)
    return cor ? `${cor}99` : 'rgba(255,255,255,0.3)'
  }

  private ligar(alvo: EventTarget, tipo: string, f: EventListener, opcoes?: AddEventListenerOptions) {
    alvo.addEventListener(tipo, f, opcoes)
    this.limpar.push(() => alvo.removeEventListener(tipo, f, opcoes))
  }

  private posicao(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private aoPressionar = (e: PointerEvent) => {
    const p = this.posicao(e)
    this.canvas.setPointerCapture(e.pointerId)
    this.ponteiros.set(e.pointerId, p)

    if (this.ponteiros.size >= 2) {
      this.traco?.cancelar()
      this.traco = null
      this.modo = 'gesto'
      this.gesto = this.medirGesto()
      return
    }

    this.inicioToque = { ...p, t: performance.now() }
    // Na tela de toque não houve movimento antes: o hexágono sob o dedo vale como cursor.
    const sob = this.render.hexSob(p.x, p.y)
    if (!mesmoHex(sob, this.render.hover)) {
      this.render.hover = sob
      this.aoPassar(sob)
      this.atualizarPrevia()
    }
    const arrasta = e.button === 1 || e.button === 2 || this.espaco || !usaPincel(this.opcoes.ferramenta)
    if (arrasta) {
      this.modo = 'arrastar'
      return
    }
    this.modo = 'traco'
    this.traco = this.ctrl.iniciarTraco()
    this.ultimoHex = null
    this.pincelar(this.render.hexSob(p.x, p.y))
  }

  private aoMover = (e: PointerEvent) => {
    const p = this.posicao(e)
    const anterior = this.ponteiros.get(e.pointerId)
    if (anterior) this.ponteiros.set(e.pointerId, p)

    const h = this.render.hexSob(p.x, p.y)
    if (!mesmoHex(h, this.render.hover)) {
      this.render.hover = h
      this.aoPassar(h)
      this.atualizarPrevia()
    }
    if (!anterior) return

    if (this.modo === 'gesto' && this.ponteiros.size >= 2) {
      const g = this.medirGesto()
      let c = arrastar(this.render.camera, g.cx - this.gesto.cx, g.cy - this.gesto.cy)
      if (this.gesto.dist > 0 && g.dist > 0) {
        const { largura, altura } = this.render.tamanhoTela
        c = zoomEm(c, largura, altura, g.cx, g.cy, g.dist / this.gesto.dist)
      }
      this.gesto = g
      this.render.definirCamera(c)
    } else if (this.modo === 'arrastar') {
      this.render.definirCamera(arrastar(this.render.camera, p.x - anterior.x, p.y - anterior.y))
    } else if (this.modo === 'traco') {
      this.pincelar(h)
    }
  }

  private aoSoltar = (e: PointerEvent) => {
    const p = this.posicao(e)
    const eraToque =
      this.modo === 'arrastar' &&
      this.ponteiros.size === 1 &&
      Math.hypot(p.x - this.inicioToque.x, p.y - this.inicioToque.y) < LIMITE_TOQUE_PX &&
      performance.now() - this.inicioToque.t < LIMITE_TOQUE_MS &&
      e.button === 0
    this.ponteiros.delete(e.pointerId)

    if (this.modo === 'traco') {
      this.traco?.confirmar()
      this.traco = null
    } else if (eraToque) {
      const h = this.render.hexSob(p.x, p.y)
      if (this.opcoes.ferramenta === 'marcador') this.aoMarcar(h)
      else this.aoSelecionar(h)
    }
    if (this.ponteiros.size === 0) this.modo = 'nenhum'
    else if (this.ponteiros.size === 1) {
      // Sobrou um dedo depois de uma pinça: segue arrastando, sem pintar por acidente.
      this.modo = 'arrastar'
      this.inicioToque = { x: -1e6, y: -1e6, t: 0 }
    }
    // Em tela de toque não há cursor: some a prévia ao levantar o dedo.
    if (e.pointerType !== 'mouse' && this.ponteiros.size === 0) {
      this.render.hover = null
      this.aoPassar(null)
      this.atualizarPrevia()
    }
  }

  private aoCancelar = (e: PointerEvent) => {
    this.ponteiros.delete(e.pointerId)
    if (this.modo === 'traco') {
      this.traco?.cancelar()
      this.traco = null
    }
    if (this.ponteiros.size === 0) this.modo = 'nenhum'
  }

  private aoSair = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.ponteiros.size > 0) return
    this.render.hover = null
    this.aoPassar(null)
    this.atualizarPrevia()
  }

  private aoRoda = (e: WheelEvent) => {
    e.preventDefault()
    const p = this.posicao(e)
    const unidade = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1
    // Pinça no touchpad chega como ctrl+roda, com passos pequenos.
    const sensibilidade = e.ctrlKey ? 0.01 : 0.0015
    const fator = Math.exp(-e.deltaY * unidade * sensibilidade)
    const { largura, altura } = this.render.tamanhoTela
    this.render.definirCamera(zoomEm(this.render.camera, largura, altura, p.x, p.y, fator))
  }

  private aoTecla = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return
    const alvo = e.target as HTMLElement | null
    if (alvo && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(alvo.tagName)) return
    if (e.type === 'keydown') e.preventDefault()
    this.espaco = e.type === 'keydown'
  }

  private medirGesto() {
    const [a, b] = [...this.ponteiros.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }

  /** Pinta ou apaga o pincel no hexágono, ligando ao anterior para não deixar buracos em traço rápido. */
  private pincelar(h: Hex) {
    if (!this.traco) return
    const trilha = this.ultimoHex ? linha(this.ultimoHex, h) : [h]
    this.ultimoHex = h
    const vistos = new Set<string>()
    const hexes: Hex[] = []
    for (const centro of trilha) {
      for (const x of disco(centro, this.opcoes.raio)) {
        const k = `${x.q},${x.r}`
        if (!vistos.has(k)) {
          vistos.add(k)
          hexes.push(x)
        }
      }
    }
    const { ferramenta, terreno, regiaoId } = this.opcoes
    if (ferramenta === 'apagar') this.traco.apagar(hexes)
    else if (ferramenta === 'regiao') this.traco.regiao(hexes, regiaoId)
    else this.traco.pintar(hexes, terreno)
  }
}
