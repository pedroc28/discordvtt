// Tela do mapa hexagonal: barra de ferramentas, paleta de terrenos e o canvas.
// A lógica fica em controlador.ts, renderizador.ts e entrada.ts. Aqui só se junta tudo.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAparencia } from '../ficha/aparencia'
import { carregarCamera, autorLocal, salvarCamera, CAMERA_INICIAL } from './armazenamento'
import { zoomEm } from './camera'
import { ControladorMapa } from './controlador'
import { EntradaMapa, type Ferramenta } from './entrada'
import type { Hex } from './hex'
import { Icone, type NomeIcone } from './Icones'
import { Renderizador, type CoresMapa } from './renderizador'
import { RepositorioLocal } from './repositorio-local'
import { Tileset } from './tileset'

const MAPA_ID = 'principal'
const URL_TILESET = `${import.meta.env.BASE_URL}tilesets/padrao/tileset.json`

interface Motor {
  ctrl: ControladorMapa
  render: Renderizador
  entrada: EntradaMapa
  tileset: Tileset
}

const FERRAMENTAS: { id: Ferramenta; rotulo: string; icone: NomeIcone; tecla: string }[] = [
  { id: 'navegar', rotulo: 'Navegar', icone: 'navegar', tecla: 'V' },
  { id: 'pintar', rotulo: 'Pintar', icone: 'pincel', tecla: 'B' },
  { id: 'apagar', rotulo: 'Apagar', icone: 'borracha', tecla: 'E' },
]

const PINCEIS = [
  { raio: 0, rotulo: '1', titulo: 'Pincel de 1 hexágono' },
  { raio: 1, rotulo: '7', titulo: 'Pincel de 7 hexágonos' },
  { raio: 2, rotulo: '19', titulo: 'Pincel de 19 hexágonos' },
]

function lerCores(el: HTMLElement): CoresMapa {
  const css = getComputedStyle(el)
  const v = (nome: string, padrao: string) => css.getPropertyValue(nome).trim() || padrao
  return { vazio: v('--mapa-vazio', '#1e2b27'), grade: v('--mapa-grade', 'rgba(255,255,255,0.16)'), destaque: v('--mapa-destaque', '#ffd24a') }
}

const ehCampoDeTexto = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))

export function MapaHex() {
  const { escuro } = useAparencia()
  const raizRef = useRef<HTMLDivElement>(null)
  const palcoRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [motor, setMotor] = useState<Motor | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [ferramenta, setFerramenta] = useState<Ferramenta>('pintar')
  const [terreno, setTerreno] = useState('planicie')
  const [raio, setRaio] = useState(0)
  const [grade, setGrade] = useState(true)
  const [hover, setHover] = useState<Hex | null>(null)
  const [selecionado, setSelecionado] = useState<Hex | null>(null)
  const [zoom, setZoom] = useState(CAMERA_INICIAL.zoom)

  // ----- montar o motor -----
  useEffect(() => {
    const canvas = canvasRef.current
    const palco = palcoRef.current
    const raiz = raizRef.current
    if (!canvas || !palco || !raiz) return
    let cancelado = false
    let desmontar: (() => void) | null = null

    Tileset.carregar(URL_TILESET)
      .then((tileset) => {
        if (cancelado) return
        const repo = new RepositorioLocal(MAPA_ID)
        const ctrl = new ControladorMapa(repo, autorLocal())
        ctrl.aoErro = setAviso
        const camera = carregarCamera(MAPA_ID)
        const render = new Renderizador(canvas, ctrl, tileset, camera, lerCores(raiz))
        const entrada = new EntradaMapa(canvas, render, ctrl, { ferramenta: 'pintar', terreno: 'planicie', raio: 0 })

        const medir = () => {
          const r = palco.getBoundingClientRect()
          render.redimensionar(r.width, r.height, window.devicePixelRatio || 1)
        }
        const observador = new ResizeObserver(medir)
        observador.observe(palco)
        medir()

        let salvar = 0
        render.aoMudarCamera = (c) => {
          setZoom(c.zoom)
          window.clearTimeout(salvar)
          salvar = window.setTimeout(() => salvarCamera(MAPA_ID, c), 300)
        }
        setZoom(camera.zoom)
        entrada.aoPassar = setHover
        entrada.aoSelecionar = (h) => {
          render.definirSelecao(h)
          setSelecionado(h)
        }

        const m = { ctrl, render, entrada, tileset }
        if (import.meta.env.DEV) (window as unknown as { __mapa?: Motor }).__mapa = m
        setMotor(m)
        render.pedirQuadro()

        desmontar = () => {
          window.clearTimeout(salvar)
          salvarCamera(MAPA_ID, render.camera)
          observador.disconnect()
          entrada.destruir()
          render.destruir()
          ctrl.destruir()
          repo.fechar()
        }
      })
      .catch((e) => !cancelado && setErroCarga(e instanceof Error ? e.message : String(e)))

    return () => {
      cancelado = true
      desmontar?.()
      setMotor(null)
    }
  }, [])

  // ----- sincronizar opções com o motor -----
  useEffect(() => {
    if (!motor) return
    motor.entrada.definirOpcoes({ ferramenta, terreno, raio })
  }, [motor, ferramenta, terreno, raio])

  useEffect(() => {
    motor?.render.definirGrade(grade)
  }, [motor, grade])

  useEffect(() => {
    if (motor && raizRef.current) motor.render.definirCores(lerCores(raizRef.current))
  }, [motor, escuro])

  // ----- histórico e contagem como "stores" externos -----
  useSyncExternalStore(
    useCallback((cb: () => void) => (motor ? motor.ctrl.ouvirHistorico(cb) : () => {}), [motor]),
    () => motor?.ctrl.versaoHistorico ?? 0,
  )
  const total = useSyncExternalStore(
    useCallback((cb: () => void) => (motor ? motor.ctrl.armazem.ouvir(() => cb()) : () => {}), [motor]),
    () => motor?.ctrl.armazem.total ?? 0,
  )

  const desfazer = useCallback(() => {
    if (!motor) return
    const conflitos = motor.ctrl.desfazer()
    if (conflitos) setAviso(`${conflitos} hexágono(s) ficaram como estão: outra pessoa mexeu neles depois de você.`)
  }, [motor])

  const refazer = useCallback(() => {
    if (!motor) return
    const conflitos = motor.ctrl.refazer()
    if (conflitos) setAviso(`${conflitos} hexágono(s) ficaram como estão: outra pessoa mexeu neles depois de você.`)
  }, [motor])

  const zoomPor = useCallback(
    (fator: number) => {
      if (!motor) return
      const { largura, altura } = motor.render.tamanhoTela
      motor.render.definirCamera(zoomEm(motor.render.camera, largura, altura, largura / 2, altura / 2, fator))
    },
    [motor],
  )

  const irParaInicio = useCallback(() => motor?.render.definirCamera({ ...CAMERA_INICIAL }), [motor])

  // ----- teclado -----
  const tecladoRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    tecladoRef.current = (e) => {
      if (ehCampoDeTexto(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (ctrl && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) refazer()
        else desfazer()
      } else if (ctrl && k === 'y') {
        e.preventDefault()
        refazer()
      } else if (ctrl || e.altKey) {
        return
      } else if (k === 'v') setFerramenta('navegar')
      else if (k === 'b') setFerramenta('pintar')
      else if (k === 'e') setFerramenta('apagar')
      else if (k === 'g') setGrade((g) => !g)
      else if (k === '[') setRaio((r) => Math.max(0, r - 1))
      else if (k === ']') setRaio((r) => Math.min(2, r + 1))
      else if (k === '0' || k === 'home') irParaInicio()
      else if (k === '+' || k === '=') zoomPor(1.25)
      else if (k === '-') zoomPor(0.8)
      else if (k === 'escape') {
        motor?.render.definirSelecao(null)
        setSelecionado(null)
      }
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => tecladoRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const terrenos = motor?.tileset.def.terrenos ?? []
  const noCursor = hover ?? selecionado
  const hexNoCursor = noCursor ? motor?.ctrl.armazem.ler(noCursor.q, noCursor.r) : null
  const nomeTerreno = hexNoCursor ? (motor?.tileset.terreno(hexNoCursor.terreno)?.nome ?? hexNoCursor.terreno) : null

  return (
    <div className="mapa" ref={raizRef}>
      <header className="mapa__topo">
        <div className="modo" role="radiogroup" aria-label="Ferramenta">
          {FERRAMENTAS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={ferramenta === f.id}
              title={`${f.rotulo} (${f.tecla})`}
              onClick={() => setFerramenta(f.id)}
            >
              <Icone nome={f.icone} />
              <span className="mapa__rotulo">{f.rotulo}</span>
            </button>
          ))}
        </div>

        {ferramenta !== 'navegar' && (
          <div className="modo" role="radiogroup" aria-label="Tamanho do pincel">
            {PINCEIS.map((p) => (
              <button
                key={p.raio}
                type="button"
                role="radio"
                aria-checked={raio === p.raio}
                title={`${p.titulo} ([ e ])`}
                onClick={() => setRaio(p.raio)}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        )}

        <span className="espaco" />

        <div className="grupo-botoes">
          <button type="button" className="botao-icone" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!motor?.ctrl.podeDesfazer} onClick={desfazer}>
            <Icone nome="desfazer" />
          </button>
          <button type="button" className="botao-icone" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled={!motor?.ctrl.podeRefazer} onClick={refazer}>
            <Icone nome="refazer" />
          </button>
        </div>
        <div className="grupo-botoes mapa__grupo-zoom">
          <button type="button" className="botao-icone" title="Menos zoom (-)" aria-label="Menos zoom" onClick={() => zoomPor(0.8)}>
            <Icone nome="menos" />
          </button>
          <span className="mapa__zoom" aria-live="off">{Math.round(zoom * 100)}%</span>
          <button type="button" className="botao-icone" title="Mais zoom (+)" aria-label="Mais zoom" onClick={() => zoomPor(1.25)}>
            <Icone nome="mais" />
          </button>
        </div>
        <div className="grupo-botoes">
          <button type="button" className="botao-icone" title="Ir para o início (0)" aria-label="Ir para o início" onClick={irParaInicio}>
            <Icone nome="centro" />
          </button>
          <button type="button" className="botao-icone" title="Mostrar grade (G)" aria-label="Mostrar grade" aria-pressed={grade} onClick={() => setGrade((g) => !g)}>
            <Icone nome="grade" />
          </button>
        </div>
      </header>

      <div className="mapa__corpo">
        <aside className="mapa__paleta" aria-label="Terrenos">
          {terrenos.map((t) => {
            const url = motor?.tileset.urlArquivo(t.id)
            return (
              <button
                key={t.id}
                type="button"
                className="mapa-terreno"
                aria-pressed={terreno === t.id}
                title={t.nome}
                onClick={() => {
                  setTerreno(t.id)
                  if (ferramenta !== 'pintar') setFerramenta('pintar')
                }}
              >
                {url ? <img src={url} alt="" draggable={false} /> : <span className="mapa-terreno__cor" style={{ background: t.cor }} />}
                <span>{t.nome}</span>
              </button>
            )
          })}
        </aside>

        <div className="mapa__palco" ref={palcoRef}>
          <canvas ref={canvasRef} className="mapa__canvas" />

          {motor && total === 0 && (
            <p className="mapa__dica">
              O mapa está vazio. Escolha um terreno e {ferramenta === 'pintar' ? 'toque ou arraste' : 'selecione Pintar para começar a construir'}.
            </p>
          )}
          {!motor && !erroCarga && <p className="mapa__dica">Carregando o mapa…</p>}
          {erroCarga && <p className="mapa__dica mapa__dica--erro">Não consegui carregar os terrenos: {erroCarga}</p>}

          <div className="mapa__status" aria-live="polite">
            {noCursor ? (
              <>
                <b>
                  {noCursor.q}, {noCursor.r}
                </b>
                <span>{nomeTerreno ?? 'vazio'}</span>
              </>
            ) : (
              <span>Passe o cursor sobre o mapa</span>
            )}
          </div>

          {aviso && (
            <div className="mapa__aviso" role="status">
              {aviso}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
