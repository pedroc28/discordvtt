// Mouse, toque e caneta no mapa, tudo por Pointer Events.
//
//   Ferramenta Navegar: um dedo (ou o mouse) arrasta o mapa; um toque rápido seleciona o hexágono.
//   Ferramentas Pintar e Apagar: um dedo pinta; dois dedos sempre arrastam e dão zoom (e cancelam
//   a pincelada em andamento, para um gesto de pinça não deixar rastro).
//   Botão do meio, botão direito ou Espaço + arrastar: sempre movem o mapa, em qualquer ferramenta.
//   Roda do mouse (ou pinça no touchpad): zoom no ponto sob o cursor.

import { arrastar, zoomEm } from './camera'
import type { CamadaDeEdicao, ControladorMapa, Traco } from './controlador'
import { arestasDoCaminho, arestasEntrePontos, disco, linha, mesmoHex, type Hex } from './hex'
import type { Renderizador } from './renderizador'
import { tocarRegua } from './regua'

/**
 * Pintar, Apagar e Região usam o pincel (arrastando). Rio e Estrada também riscam arrastando, mas por
 * arestas. Navegar, Marcador, Token e Régua movem o mapa arrastando e agem num toque rápido: Navegar
 * seleciona o hexágono, Marcador coloca um marcador nele, Token leva o token do grupo até ele e
 * Régua marca o início e o fim da medida e Rota acrescenta um ponto à rota de viagem. Com Navegar ou Token,
 * pegar o token e arrastar o leva para outro hexágono (um toque no token, sem arrastar, continua selecionando).
 */
export type Ferramenta = 'navegar' | 'pintar' | 'apagar' | 'regiao' | 'marcador' | 'rio' | 'estrada' | 'token' | 'regua' | 'rota'

export interface OpcoesEntrada {
  ferramenta: Ferramenta
  terreno: string
  /** Região usada pela ferramenta Região. Null tira os hexágonos de qualquer região. */
  regiaoId: string | null
  /** Raio do pincel: 0 = 1 hexágono, 1 = 7, 2 = 19. */
  raio: number
  /** Rio e Estrada: tira o traço em vez de desenhar. */
  tirarTraco: boolean
  /** Só o mestre: pinta e apaga na camada oculta, que os jogadores não veem. */
  camada?: CamadaDeEdicao
}

const usaPincel = (f: Ferramenta) => f === 'pintar' || f === 'apagar' || f === 'regiao'
const usaTraco = (f: Ferramenta) => usaPincel(f) || f === 'rio' || f === 'estrada'

const LIMITE_TOQUE_PX = 8
const LIMITE_TOQUE_MS = 450

type Modo = 'nenhum' | 'arrastar' | 'traco' | 'gesto' | 'token'

export class EntradaMapa {
  opcoes: OpcoesEntrada
  aoSelecionar: (h: Hex) => void = () => {}
  aoMarcar: (h: Hex) => void = () => {}
  aoMoverToken: (h: Hex) => void = () => {}
  aoRota: (h: Hex) => void = () => {}
  aoMudarRegua: () => void = () => {}
  aoPassar: (h: Hex | null) => void = () => {}
  aoMudarPrevia: () => void = () => {}

  private ponteiros = new Map<number, { x: number; y: number }>()
  private modo: Modo = 'nenhum'
  private traco: Traco | null = null
  private ultimoHex: Hex | null = null
  private ultimoPonto: { x: number; y: number } | null = null
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
    this.render.previaAresta = null
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
      this.render.definirFantasmaToken(null)
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
    // Pegar o token: com Navegar ou Token, apertar no hexágono do token e arrastar leva o token junto.
    const f0 = this.opcoes.ferramenta
    const token = this.ctrl.token
    if (e.button === 0 && !this.espaco && (f0 === 'navegar' || f0 === 'token') && token && mesmoHex(sob, token)) {
      this.modo = 'token'
      this.render.definirFantasmaToken(sob)
      return
    }
    const arrasta = e.button === 1 || e.button === 2 || this.espaco || !usaTraco(this.opcoes.ferramenta)
    if (arrasta) {
      this.modo = 'arrastar'
      return
    }
    this.modo = 'traco'
    this.traco = this.ctrl.iniciarTraco(this.opcoes.camada)
    this.ultimoHex = null
    this.ultimoPonto = null
    this.pincelar(p)
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
    this.acompanharRegua(h)
    this.acompanharAresta(p)
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
      this.pincelar(p)
    } else if (this.modo === 'token') {
      this.render.definirFantasmaToken(h)
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

    if (this.modo === 'token') {
      const destino = this.render.tokenFantasma
      this.render.definirFantasmaToken(null)
      const token = this.ctrl.token
      if (destino && token && !mesmoHex(destino, token)) {
        this.aoMoverToken(destino)
      } else if (this.opcoes.ferramenta === 'navegar' && e.button === 0) {
        // Apertou no token e soltou no mesmo lugar: é um toque comum, seleciona o hexágono.
        this.aoSelecionar(this.render.hexSob(p.x, p.y))
      }
    } else if (this.modo === 'traco') {
      this.traco?.confirmar()
      this.traco = null
    } else if (eraToque) {
      const h = this.render.hexSob(p.x, p.y)
      const f = this.opcoes.ferramenta
      if (f === 'marcador') this.aoMarcar(h)
      else if (f === 'token') this.aoMoverToken(h)
      else if (f === 'rota') this.aoRota(h)
      else if (f === 'regua') {
        this.render.regua = tocarRegua(this.render.regua, h)
        this.render.pedirQuadro()
        this.aoMudarRegua()
      } else this.aoSelecionar(h)
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
    this.render.definirFantasmaToken(null)
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

  /** Mostra a régua até o cursor enquanto só o primeiro ponto foi marcado. */
  private acompanharRegua(h: Hex) {
    if (this.opcoes.ferramenta !== 'regua' || !this.render.regua || this.render.regua.b) return
    this.render.reguaPonta = h
    this.render.pedirQuadro()
    this.aoMudarRegua()
  }

  /** Na ferramenta Rio, destaca a aresta que o próximo toque vai pegar. */
  private acompanharAresta(p: { x: number; y: number }) {
    if (this.opcoes.ferramenta !== 'rio') return
    const m = this.render.pontoMundo(p.x, p.y)
    this.render.previaAresta = arestasEntrePontos(null, m, this.render.R)[0]
    this.render.pedirQuadro()
  }

  /** Aplica o pincel (ou o traço de rio e estrada) ligando ao ponto anterior, para não deixar buracos em traço rápido. */
  private pincelar(p: { x: number; y: number }) {
    if (!this.traco) return
    const h = this.render.hexSob(p.x, p.y)
    const { ferramenta, terreno, regiaoId, tirarTraco } = this.opcoes

    if (ferramenta === 'rio') {
      const m = this.render.pontoMundo(p.x, p.y)
      this.traco.rio(arestasEntrePontos(this.ultimoPonto, m, this.render.R), !tirarTraco)
      this.ultimoPonto = m
      return
    }

    const trilha = this.ultimoHex ? linha(this.ultimoHex, h) : [h]
    this.ultimoHex = h
    if (ferramenta === 'estrada') {
      this.traco.estrada(arestasDoCaminho(trilha), !tirarTraco)
      return
    }

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
    if (ferramenta === 'apagar') this.traco.apagar(hexes)
    else if (ferramenta === 'regiao') this.traco.regiao(hexes, regiaoId)
    else this.traco.pintar(hexes, terreno)
  }
}
