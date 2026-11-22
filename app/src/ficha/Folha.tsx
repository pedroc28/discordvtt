// A folha: desenha a página e, no modo de edição, cuida de selecionar,
// arrastar, redimensionar e selecionar por área (laço).

import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type RefObject } from 'react'
import type { CoresFolha } from './aparencia'
import { CampoVisual } from './CampoVisual'
import {
  ALCAS,
  encaixarMovimento,
  intersecta,
  limitesDe,
  redimensionar,
  type Alca,
  type Guia,
  type Ret,
} from './geometria'
import { atualizarElementos, moverElementos } from './operacoes'
import type { Elemento, Modelo, Modo, Pagina, TipoCampo, Valor, Valores } from './tipos'

export const TIPO_ARRASTE = 'application/x-ficha-tipo'

type Gesto =
  | {
      tipo: 'mover'
      ids: string[]
      cx: number
      cy: number
      base: Ret
      dx: number
      dy: number
      guias: Guia[]
      moveu: boolean
      clicado: string
      modificador: boolean
    }
  | { tipo: 'redim'; id: string; alca: Alca; cx: number; cy: number; orig: Ret; ret: Ret; guias: Guia[] }
  | {
      tipo: 'laco'
      x0: number
      y0: number
      x1: number
      y1: number
      aditivo: boolean
      base: string[]
      moveu: boolean
    }

interface Props {
  modelo: Modelo
  pagina: Pagina
  modo: Modo
  zoom: number
  valores: Valores
  definirValor: (chave: string, v: Valor) => void
  avisar: (t: string) => void
  selecao: string[]
  setSelecao: (ids: string[]) => void
  aplicar: (f: (m: Modelo) => Modelo, grupo?: string) => void
  mostrarGrade: boolean
  aoSoltarTipo: (tipo: TipoCampo, x: number, y: number) => void
  folhaRef: RefObject<HTMLDivElement | null>
  cores: CoresFolha
}

export function Folha(p: Props) {
  const { modelo, pagina, modo, zoom, selecao, setSelecao, folhaRef, mostrarGrade, cores } = p
  const editar = modo === 'editar'
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const gestoRef = useRef<Gesto | null>(null)
  const definirGesto = (g: Gesto | null) => {
    gestoRef.current = g
    setGesto(g)
  }

  const pag = { largura: modelo.largura, altura: modelo.altura }
  const opcoesEncaixe = (alt: boolean) => ({ grade: modelo.grade, limiar: 6 / zoom, ativo: !alt })

  const paraPagina = (cx: number, cy: number) => {
    const r = folhaRef.current!.getBoundingClientRect()
    return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom }
  }

  // ----- início dos gestos -----

  const pressionarElemento = (e: PointerEvent<HTMLDivElement>, el: Elemento) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const mod = e.shiftKey || e.metaKey || e.ctrlKey
    let ids: string[]
    if (mod) {
      ids = selecao.includes(el.id) ? selecao.filter((i) => i !== el.id) : [...selecao, el.id]
      setSelecao(ids)
      if (!ids.includes(el.id)) return
    } else {
      ids = selecao.includes(el.id) ? selecao : [el.id]
      if (!selecao.includes(el.id)) setSelecao(ids)
    }
    const rets = pagina.elementos.filter((x) => ids.includes(x.id))
    e.currentTarget.setPointerCapture(e.pointerId)
    definirGesto({
      tipo: 'mover',
      ids,
      cx: e.clientX,
      cy: e.clientY,
      base: limitesDe(rets),
      dx: 0,
      dy: 0,
      guias: [],
      moveu: false,
      clicado: el.id,
      modificador: mod,
    })
  }

  const pressionarAlca = (e: PointerEvent<HTMLDivElement>, el: Elemento, alca: Alca) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h }
    definirGesto({ tipo: 'redim', id: el.id, alca, cx: e.clientX, cy: e.clientY, orig, ret: orig, guias: [] })
  }

  const pressionarFolha = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const pt = paraPagina(e.clientX, e.clientY)
    const aditivo = e.shiftKey || e.metaKey || e.ctrlKey
    e.currentTarget.setPointerCapture(e.pointerId)
    definirGesto({ tipo: 'laco', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, aditivo, base: aditivo ? selecao : [], moveu: false })
  }

  // ----- movimento -----

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const g = gestoRef.current
    if (!g) return
    if (g.tipo === 'mover') {
      if (!g.moveu && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 3) return
      const proposto = {
        ...g.base,
        x: g.base.x + (e.clientX - g.cx) / zoom,
        y: g.base.y + (e.clientY - g.cy) / zoom,
      }
      const outros = pagina.elementos.filter((x) => !g.ids.includes(x.id))
      const r = encaixarMovimento(proposto, outros, pag, opcoesEncaixe(e.altKey))
      const x = Math.max(0, Math.min(pag.largura - g.base.w, r.x))
      const y = Math.max(0, Math.min(pag.altura - g.base.h, r.y))
      definirGesto({ ...g, dx: x - g.base.x, dy: y - g.base.y, guias: r.guias, moveu: true })
    } else if (g.tipo === 'redim') {
      const outros = pagina.elementos.filter((x) => x.id !== g.id)
      const r = redimensionar(
        g.orig,
        g.alca,
        (e.clientX - g.cx) / zoom,
        (e.clientY - g.cy) / zoom,
        outros,
        pag,
        opcoesEncaixe(e.altKey),
      )
      definirGesto({ ...g, ret: r.ret, guias: r.guias })
    } else {
      const pt = paraPagina(e.clientX, e.clientY)
      const moveu = g.moveu || Math.hypot(pt.x - g.x0, pt.y - g.y0) * zoom > 3
      const area = {
        x: Math.min(g.x0, pt.x),
        y: Math.min(g.y0, pt.y),
        w: Math.abs(pt.x - g.x0),
        h: Math.abs(pt.y - g.y0),
      }
      if (moveu) {
        const dentro = pagina.elementos.filter((el) => intersecta(area, el)).map((el) => el.id)
        setSelecao([...new Set([...g.base, ...dentro])])
      }
      definirGesto({ ...g, x1: pt.x, y1: pt.y, moveu })
    }
  }

  const soltar = () => {
    const g = gestoRef.current
    if (!g) return
    definirGesto(null)
    if (g.tipo === 'mover') {
      if (g.moveu && (g.dx || g.dy)) p.aplicar((m) => moverElementos(m, g.ids, g.dx, g.dy))
      else if (!g.moveu && !g.modificador && g.ids.length > 1) setSelecao([g.clicado])
    } else if (g.tipo === 'redim') {
      const { ret } = g
      if (ret.x !== g.orig.x || ret.y !== g.orig.y || ret.w !== g.orig.w || ret.h !== g.orig.h) {
        p.aplicar((m) => atualizarElementos(m, [g.id], (el) => ({ ...el, ...ret })))
      }
    } else if (!g.moveu && !g.aditivo) {
      setSelecao([])
    }
  }

  // ----- soltar um campo vindo da paleta -----

  const sobre = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(TIPO_ARRASTE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const largar = (e: DragEvent<HTMLDivElement>) => {
    const tipo = e.dataTransfer.getData(TIPO_ARRASTE) as TipoCampo
    if (!tipo) return
    e.preventDefault()
    const pt = paraPagina(e.clientX, e.clientY)
    p.aoSoltarTipo(tipo, pt.x, pt.y)
  }

  // ----- desenho -----

  const retExibido = (el: Elemento): Ret => {
    if (gesto?.tipo === 'mover' && gesto.ids.includes(el.id)) {
      return { x: el.x + gesto.dx, y: el.y + gesto.dy, w: el.w, h: el.h }
    }
    if (gesto?.tipo === 'redim' && gesto.id === el.id) return gesto.ret
    return el
  }

  const passoGrade = modelo.grade < 8 ? modelo.grade * 2 : modelo.grade
  const unicoSelecionado = selecao.length === 1 ? selecao[0] : null

  const estiloFolha = {
    width: modelo.largura,
    height: modelo.altura,
    transform: `scale(${zoom})`,
    '--fundo': cores.fundo,
    '--tinta': cores.tinta,
    '--destaque': cores.destaque,
    '--zoom': zoom,
  } as CSSProperties

  return (
    <div className="folha-espaco" style={{ width: modelo.largura * zoom, height: modelo.altura * zoom }}>
      <div
        ref={folhaRef}
        className={`folha folha--${modo} fonte--${modelo.fonte}${cores.invertida ? ' folha--escura' : ''}${gesto ? ' folha--gesto' : ''}`}
        style={estiloFolha}
        onPointerDown={editar ? pressionarFolha : undefined}
        onPointerMove={editar ? mover : undefined}
        onPointerUp={editar ? soltar : undefined}
        onPointerCancel={editar ? soltar : undefined}
        onDragOver={editar ? sobre : undefined}
        onDrop={editar ? largar : undefined}
      >
        {editar && mostrarGrade && modelo.grade > 1 && (
          <div className="folha__grade" style={{ backgroundSize: `${passoGrade}px ${passoGrade}px` }} />
        )}

        {pagina.elementos.map((el) => {
          const r = retExibido(el)
          const sel = selecao.includes(el.id)
          return (
            <div
              key={el.id}
              data-id={el.id}
              className={`el el--${el.tipo}${sel ? ' el--sel' : ''}${unicoSelecionado === el.id ? ' el--unico' : ''}`}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              onPointerDown={editar ? (e) => pressionarElemento(e, el) : undefined}
            >
              <CampoVisual
                el={el}
                valor={el.chave ? p.valores[el.chave] : undefined}
                modo={modo}
                definir={(v) => el.chave && p.definirValor(el.chave, v)}
                avisar={p.avisar}
              />
              {editar && el.chave && <span className="el__chave">{el.chave}</span>}
              {editar &&
                unicoSelecionado === el.id &&
                ALCAS.map((a) => (
                  <div
                    key={a}
                    className={`alca alca--${a}`}
                    onPointerDown={(e) => pressionarAlca(e, el, a)}
                  />
                ))}
              {gesto?.tipo === 'redim' && gesto.id === el.id && (
                <span className="el__medida">
                  {r.w} × {r.h}
                </span>
              )}
            </div>
          )
        })}

        {gesto &&
          gesto.tipo !== 'laco' &&
          gesto.guias.map((g, i) => (
            <div
              key={i}
              className={`guia guia--${g.eixo}`}
              style={
                g.eixo === 'x'
                  ? { left: g.pos, top: g.inicio, height: g.fim - g.inicio }
                  : { top: g.pos, left: g.inicio, width: g.fim - g.inicio }
              }
            />
          ))}

        {gesto?.tipo === 'laco' && gesto.moveu && (
          <div
            className="laco"
            style={{
              left: Math.min(gesto.x0, gesto.x1),
              top: Math.min(gesto.y0, gesto.y1),
              width: Math.abs(gesto.x1 - gesto.x0),
              height: Math.abs(gesto.y1 - gesto.y0),
            }}
          />
        )}
      </div>
    </div>
  )
}
