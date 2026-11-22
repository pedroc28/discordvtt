// Desenha um campo da ficha. O mesmo componente serve para o modo de edição
// (só mostra, sem interação) e para o modo de uso (preenchível).

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { valorPadrao } from './campos'
import type { Celula, ColunaTabela, Elemento, LinhaTabela, Modo, Recurso, Valor } from './tipos'
import { limitar, novoId, reduzirImagem } from './util'

interface Props {
  el: Elemento
  valor: Valor | undefined
  modo: Modo
  definir: (v: Valor) => void
  avisar?: (texto: string) => void
}

const alinhamentoCss = { esquerda: 'left', centro: 'center', direita: 'right' } as const

export function CampoVisual({ el, valor, modo, definir, avisar }: Props) {
  const v = valor === undefined ? valorPadrao(el) : valor
  const usar = modo === 'usar'
  const { estilo } = el
  const estiloRaiz = {
    fontSize: estilo.tamanhoFonte,
    textAlign: alinhamentoCss[estilo.alinhamento],
    fontWeight: estilo.negrito ? 700 : undefined,
    '--tam-rotulo': `${estilo.tamanhoRotulo}px`,
  } as CSSProperties

  if (el.tipo === 'moldura') return <Moldura el={el} />
  if (el.tipo === 'titulo') {
    return (
      <div className="campo campo--titulo" style={estiloRaiz}>
        <div className="titulo-texto">{el.config.texto}</div>
      </div>
    )
  }

  let corpo: ReactNode
  switch (el.tipo) {
    case 'texto':
      corpo = (
        <input
          type="text"
          value={typeof v === 'string' ? v : ''}
          placeholder={el.config.dica || undefined}
          readOnly={!usar}
          tabIndex={usar ? 0 : -1}
          aria-label={el.rotulo || el.chave}
          onChange={(e) => definir(e.target.value)}
        />
      )
      break
    case 'textoLongo':
      corpo = (
        <textarea
          className={el.config.pautado ? 'pautado' : undefined}
          value={typeof v === 'string' ? v : ''}
          placeholder={el.config.dica || undefined}
          readOnly={!usar}
          tabIndex={usar ? 0 : -1}
          aria-label={el.rotulo || el.chave}
          onChange={(e) => definir(e.target.value)}
        />
      )
      break
    case 'numero':
      corpo = (
        <EntradaNumero
          valor={typeof v === 'number' ? v : null}
          min={el.config.min}
          max={el.config.max}
          passo={el.config.passo}
          ativo={usar}
          rotulo={el.rotulo || el.chave}
          aoMudar={definir}
        />
      )
      break
    case 'recurso':
      corpo = <CampoRecurso el={el} valor={v as Recurso} usar={usar} definir={definir} />
      break
    case 'checkbox':
      corpo = (
        <Marca
          forma={el.config.forma ?? 'quadrado'}
          marcado={v === true}
          ativo={usar}
          rotulo={el.rotulo || el.chave}
          aoAlternar={() => definir(!(v === true))}
        />
      )
      break
    case 'marcadores':
      corpo = <CampoMarcadores el={el} valor={v} usar={usar} definir={definir} />
      break
    case 'lista':
      corpo = (
        <>
          <select
            value={typeof v === 'string' ? v : ''}
            disabled={!usar}
            tabIndex={usar ? 0 : -1}
            aria-label={el.rotulo || el.chave}
            onChange={(e) => definir(e.target.value)}
          >
            <option value=""></option>
            {(el.config.opcoes ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {typeof v === 'string' && v && !(el.config.opcoes ?? []).includes(v) && <option value={v}>{v}</option>}
          </select>
          <svg className="seta-lista" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="m2 3.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </>
      )
      break
    case 'tabela':
      corpo = (
        <CampoTabela
          colunas={el.config.colunas ?? []}
          linhas={Array.isArray(v) ? (v as LinhaTabela[]) : []}
          usar={usar}
          definir={definir}
        />
      )
      break
    case 'relogio':
      corpo = <CampoRelogio el={el} valor={v} usar={usar} definir={definir} />
      break
    case 'imagem':
      corpo = (
        <CampoImagem
          src={typeof v === 'string' ? v : ''}
          ajuste={el.config.ajuste ?? 'cobrir'}
          usar={usar}
          rotulo={el.rotulo || 'imagem'}
          definir={definir}
          avisar={avisar}
        />
      )
      break
  }

  const pos = estilo.rotulo
  const rotulo =
    pos !== 'oculto' && el.rotulo ? (
      <span
        className="campo__rotulo"
        onClick={
          usar && el.tipo === 'checkbox' ? () => definir(!(v === true)) : undefined
        }
      >
        {el.rotulo}
      </span>
    ) : null

  return (
    <div
      className={`campo campo--${el.tipo} rotulo--${pos} borda--${estilo.borda} alinhar--${estilo.alinhamento}${el.tipo === 'recurso' && el.config.estiloRecurso === 'barra' ? ' recurso--barra' : ''}`}
      style={estiloRaiz}
    >
      {(pos === 'acima' || pos === 'esquerda') && rotulo}
      <div className="campo__corpo">{corpo}</div>
      {(pos === 'abaixo' || pos === 'direita') && rotulo}
    </div>
  )
}

function Moldura({ el }: { el: Elemento }) {
  const { espessura = 1.5, raio = 6, preenchimento } = el.config
  const borda = el.estilo.borda
  const estilo: CSSProperties = {
    borderRadius: borda === 'caixa' ? raio : 0,
    '--preench': preenchimento || undefined,
    borderStyle: 'solid',
    borderColor: 'var(--tinta)',
    borderWidth:
      borda === 'caixa' ? espessura : borda === 'linha' ? `${espessura}px 0 0 0` : 0,
    '--tam-rotulo': `${el.estilo.tamanhoRotulo}px`,
  } as CSSProperties
  return (
    <div
      className={`moldura alinhar--${el.estilo.alinhamento}${preenchimento ? ' moldura--preenchida' : ''}`}
      style={estilo}
    >
      {el.estilo.rotulo !== 'oculto' && el.rotulo && (
        <span className="moldura__titulo" style={{ fontWeight: el.estilo.negrito ? 700 : undefined }}>
          {el.rotulo}
        </span>
      )}
    </div>
  )
}

// ---------- Número ----------

interface PropsNumero {
  valor: number | null
  min?: number | null
  max?: number | null
  passo?: number
  ativo: boolean
  rotulo: string
  aoMudar: (v: number | null) => void
  className?: string
  style?: CSSProperties
}

export function EntradaNumero({ valor, min, max, passo = 1, ativo, rotulo, aoMudar, className, style }: PropsNumero) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  const exibido = rascunho ?? (valor == null ? '' : String(valor))

  const confirmar = () => {
    if (rascunho === null) return
    const t = rascunho.trim().replace(',', '.')
    if (t === '') aoMudar(null)
    else {
      const n = Number(t)
      if (Number.isFinite(n)) aoMudar(limitar(n, min, max))
    }
    setRascunho(null)
  }

  const teclado = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const atual = rascunho !== null ? Number(rascunho.replace(',', '.')) || 0 : (valor ?? 0)
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * passo * (e.shiftKey ? 5 : 1)
      setRascunho(null)
      aoMudar(limitar(atual + delta, min, max))
    } else if (e.key === 'Enter') {
      confirmar()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setRascunho(null)
      e.currentTarget.blur()
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      value={exibido}
      readOnly={!ativo}
      tabIndex={ativo ? 0 : -1}
      aria-label={rotulo}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={teclado}
    />
  )
}

// ---------- Atual / máximo ----------

/** Setas, Home, End, PageUp e PageDown para campos de contagem (barra e relógio). */
function teclasDeContagem(e: KeyboardEvent<Element>, atual: number, max: number, definir: (n: number) => void) {
  const grande = Math.max(1, Math.round(max / 10))
  const destino: Record<string, number> = {
    ArrowRight: atual + 1,
    ArrowUp: atual + 1,
    ArrowLeft: atual - 1,
    ArrowDown: atual - 1,
    PageUp: atual + grande,
    PageDown: atual - grande,
    Home: 0,
    End: max,
  }
  if (!(e.key in destino)) return
  e.preventDefault()
  definir(Math.max(0, Math.min(max, destino[e.key])))
}

function CampoRecurso({
  el,
  valor,
  usar,
  definir,
}: {
  el: Elemento
  valor: Recurso
  usar: boolean
  definir: (v: Valor) => void
}) {
  const r: Recurso = valor && typeof valor === 'object' && 'atual' in valor ? valor : { atual: null, max: null }
  const maxEfetivo = r.max ?? el.config.maxPadrao ?? null

  if (el.config.estiloRecurso === 'barra') {
    return <BarraDeVida el={el} r={r} max={maxEfetivo} usar={usar} definir={definir} />
  }

  const larg = (n: number | null) => ({ '--digitos': Math.max(2, String(n ?? '').length) }) as CSSProperties
  const mudarAtual = (n: number) => definir({ ...r, atual: n })
  const fracao = maxEfetivo ? Math.max(0, Math.min(1, (r.atual ?? 0) / maxEfetivo)) : 0
  return (
    <div className="recurso">
      {usar && el.config.botoes && (
        <button
          type="button"
          className="recurso__botao"
          aria-label={`Diminuir ${el.rotulo}`}
          onClick={() => mudarAtual((r.atual ?? 0) - 1)}
        >
          −
        </button>
      )}
      <NumerosRecurso el={el} r={r} max={maxEfetivo} usar={usar} definir={definir} larg={larg} />
      {usar && el.config.botoes && (
        <button
          type="button"
          className="recurso__botao"
          aria-label={`Aumentar ${el.rotulo}`}
          onClick={() => mudarAtual((r.atual ?? 0) + 1)}
        >
          +
        </button>
      )}
      {el.config.barra && (
        <div className="recurso__trilho" aria-hidden="true">
          <div className="recurso__preenchido" style={{ width: `${fracao * 100}%` }} />
        </div>
      )}
    </div>
  )
}

function NumerosRecurso({
  el,
  r,
  max,
  usar,
  definir,
  larg,
}: {
  el: Elemento
  r: Recurso
  max: number | null
  usar: boolean
  definir: (v: Valor) => void
  larg: (n: number | null) => CSSProperties
}) {
  return (
    <div className="recurso__valores">
      <EntradaNumero
        className="recurso__atual"
        style={larg(r.atual)}
        valor={r.atual}
        ativo={usar}
        rotulo={`${el.rotulo} atual`}
        aoMudar={(n) => definir({ ...r, atual: n })}
      />
      <span className="recurso__barra-sep">/</span>
      <EntradaNumero
        className="recurso__max"
        style={larg(max)}
        valor={max}
        ativo={usar}
        rotulo={`${el.rotulo} máximo`}
        aoMudar={(n) => definir({ ...r, max: n })}
      />
    </div>
  )
}

/** Acima disto a barra vira um preenchimento contínuo, sem uma peça por parte. */
const LIMITE_PARTES = 400

// ---------- Barra de vida ----------

function BarraDeVida({
  el,
  r,
  max,
  usar,
  definir,
}: {
  el: Elemento
  r: Recurso
  max: number | null
  usar: boolean
  definir: (v: Valor) => void
}) {
  const trilho = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ x: number; moveu: boolean } | null>(null)

  // No modo de edição, sem máximo ainda, mostra uma prévia para dar noção das partes.
  const previa = !usar && !(max && max > 0)
  const total = previa ? 10 : Math.max(0, Math.floor(max ?? 0))
  const atual = previa ? 7 : Math.max(0, Math.min(total, Math.round(r.atual ?? 0)))
  const larguraParte = total ? el.w / total : 0
  const divisoes = el.config.divisoes !== false && larguraParte >= 3
  const mostrarNumeros = el.config.mostrarNumeros !== false

  const mudar = (n: number) => definir({ ...r, atual: n })
  const valorNoPonto = (clientX: number) => {
    const caixa = trilho.current!.getBoundingClientRect()
    const fracao = (clientX - caixa.left) / caixa.width
    return Math.max(0, Math.min(total, Math.ceil(fracao * total)))
  }

  const pressionar = (e: PointerEvent<HTMLDivElement>) => {
    if (!usar || !total || e.button !== 0) return
    if ((e.target as HTMLElement).closest('input')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    arrasto.current = { x: e.clientX, moveu: false }
    const v = valorNoPonto(e.clientX)
    // clicar na última parte preenchida esvazia ela, como nos marcadores
    mudar(v === atual ? v - 1 : v)
  }
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrasto.current
    if (!a) return
    // só começa a arrastar depois de alguns pixels, para o clique não ser desfeito por um tremido
    if (!a.moveu && Math.abs(e.clientX - a.x) < 4) return
    a.moveu = true
    const v = valorNoPonto(e.clientX)
    if (v !== atual) mudar(v)
  }
  const soltar = () => {
    arrasto.current = null
  }

  const larg = (n: number | null) => ({ '--digitos': Math.max(2, String(n ?? '').length) }) as CSSProperties

  return (
    <div
      className={`barra${previa ? ' barra--previa' : ''}`}
      style={{ '--cor-barra': el.config.cor || 'var(--destaque)' } as CSSProperties}
    >
      <div
        ref={trilho}
        className={`barra__trilho${divisoes ? ' barra__trilho--divisoes' : ''}`}
        role="slider"
        tabIndex={usar ? 0 : -1}
        aria-label={el.rotulo || el.chave}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={atual}
        aria-valuetext={`${atual} de ${total}`}
        title={usar ? `${atual} / ${total}` : undefined}
        onPointerDown={pressionar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onKeyDown={usar ? (e) => teclasDeContagem(e, atual, total, mudar) : undefined}
      >
        {total <= LIMITE_PARTES ? (
          Array.from({ length: total }, (_, i) => <span key={i} className={i < atual ? 'cheia' : undefined} />)
        ) : (
          <span className="barra__continua" style={{ width: `${(atual / total) * 100}%` }} />
        )}
      </div>
      {mostrarNumeros && (
        <div className="barra__numeros">
          {previa ? (
            <span>
              {atual} / {total}
            </span>
          ) : (
            <NumerosRecurso el={el} r={r} max={max} usar={usar} definir={definir} larg={larg} />
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Relógio (Apocalypse World) ----------

/** Ângulos das divisões do relógio do Apocalypse World: 12, 3, 6, 9, 10, 11 e 12 de novo. */
const ANGULOS_AW = [0, 90, 180, 270, 300, 330, 360]
const HORAS_AW = ['12', '3', '6', '9', '10', '11']

function CampoRelogio({
  el,
  valor,
  usar,
  definir,
}: {
  el: Elemento
  valor: Valor
  usar: boolean
  definir: (v: Valor) => void
}) {
  const aw = (el.config.formatoRelogio ?? 'apocalypse') === 'apocalypse'
  const n = aw ? 6 : Math.max(2, Math.min(24, Math.round(el.config.quantidade ?? 4)))
  const angulos = aw ? ANGULOS_AW : Array.from({ length: n + 1 }, (_, i) => (i * 360) / n)
  const marcados = Math.max(0, Math.min(n, typeof valor === 'number' ? Math.round(valor) : 0))
  const horas = aw && el.config.mostrarHoras !== false
  const raio = 44
  const meia = horas ? 62 : 48
  const ponto = (graus: number, r: number) => {
    const a = (graus * Math.PI) / 180
    return [r * Math.sin(a), -r * Math.cos(a)].map((v) => Math.round(v * 100) / 100)
  }
  const clicar = (i: number) => definir(i === marcados - 1 ? i : i + 1)

  return (
    <svg
      className="relogio"
      viewBox={`${-meia} ${-meia} ${meia * 2} ${meia * 2}`}
      role="slider"
      tabIndex={usar ? 0 : -1}
      aria-label={el.rotulo || el.chave}
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={marcados}
      aria-valuetext={`${marcados} de ${n} partes marcadas`}
      onKeyDown={usar ? (e) => teclasDeContagem(e, marcados, n, definir) : undefined}
      style={{ '--cor-relogio': el.config.cor || 'var(--destaque)' } as CSSProperties}
    >
      {angulos.slice(0, -1).map((a1, i) => {
        const a2 = angulos[i + 1]
        const [x1, y1] = ponto(a1, raio)
        const [x2, y2] = ponto(a2, raio)
        const grande = a2 - a1 > 180 ? 1 : 0
        return (
          <path
            key={i}
            d={`M0 0L${x1} ${y1}A${raio} ${raio} 0 ${grande} 1 ${x2} ${y2}Z`}
            className={i < marcados ? 'marcado' : undefined}
            onClick={usar ? () => clicar(i) : undefined}
          />
        )
      })}
      <circle r={raio} className="relogio__aro" />
      {horas &&
        HORAS_AW.map((h, i) => {
          const [x, y] = ponto(ANGULOS_AW[i], raio + 10)
          return (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="central">
              {h}
            </text>
          )
        })}
    </svg>
  )
}

// ---------- Marcas ----------

function Marca({
  forma,
  marcado,
  ativo,
  rotulo,
  aoAlternar,
}: {
  forma: string
  marcado: boolean
  ativo: boolean
  rotulo: string
  aoAlternar: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      aria-label={rotulo}
      tabIndex={ativo ? 0 : -1}
      className={`marca marca--${forma}`}
      onClick={ativo ? aoAlternar : undefined}
    />
  )
}

function CampoMarcadores({
  el,
  valor,
  usar,
  definir,
}: {
  el: Elemento
  valor: Valor
  usar: boolean
  definir: (v: Valor) => void
}) {
  const q = Math.max(1, el.config.quantidade ?? 3)
  const bruto = Array.isArray(valor) ? (valor as boolean[]) : []
  const marcas = Array.from({ length: q }, (_, i) => bruto[i] === true)
  const clicar = (i: number) => {
    if (!el.config.sequencial) {
      definir(marcas.map((m, j) => (j === i ? !m : m)))
      return
    }
    const n = marcas.filter(Boolean).length
    const novoN = i === n - 1 ? i : i + 1
    definir(marcas.map((_, j) => j < novoN))
  }
  return (
    <div className="marcadores">
      {marcas.map((m, i) => (
        <Marca
          key={i}
          forma={el.config.forma ?? 'circulo'}
          marcado={m}
          ativo={usar}
          rotulo={`${el.rotulo} ${i + 1}`}
          aoAlternar={() => clicar(i)}
        />
      ))}
    </div>
  )
}

// ---------- Tabela ----------

function CampoTabela({
  colunas,
  linhas,
  usar,
  definir,
}: {
  colunas: ColunaTabela[]
  linhas: LinhaTabela[]
  usar: boolean
  definir: (v: Valor) => void
}) {
  const fimRef = useRef<HTMLDivElement>(null)
  const grade = colunas.map((c) => `minmax(0, ${c.largura}fr)`).join(' ') + (usar ? ' 1.5em' : '')
  const estilo = { '--colunas': grade } as CSSProperties
  const mudarCelula = (id: string, col: string, v: Celula) =>
    definir(linhas.map((l) => (l._id === id ? { ...l, [col]: v } : l)))

  const adicionar = () => {
    const nova: LinhaTabela = { _id: novoId('l') }
    definir([...linhas, nova])
    requestAnimationFrame(() => {
      const linhas = fimRef.current?.querySelectorAll<HTMLElement>('.tabela__linha')
      const ultima = linhas?.[linhas.length - 1]
      ultima?.querySelector<HTMLElement>('input, [role="checkbox"]')?.focus()
    })
  }

  return (
    <div className="tabela" style={estilo}>
      <div className="tabela__cab">
        {colunas.map((c) => (
          <span key={c.id} className={c.tipo !== 'texto' ? 'centro' : undefined}>
            {c.rotulo}
          </span>
        ))}
        {usar && <span />}
      </div>
      <div className="tabela__linhas" ref={fimRef}>
        {linhas.map((l) => (
          <div className="tabela__linha" key={l._id}>
            {colunas.map((c) => {
              const cel = l[c.id] ?? null
              if (c.tipo === 'checkbox') {
                return (
                  <span key={c.id} className="centro">
                    <Marca
                      forma="quadrado"
                      marcado={cel === true}
                      ativo={usar}
                      rotulo={c.rotulo}
                      aoAlternar={() => mudarCelula(l._id, c.id, !(cel === true))}
                    />
                  </span>
                )
              }
              if (c.tipo === 'numero') {
                return (
                  <EntradaNumero
                    key={c.id}
                    className="centro"
                    valor={typeof cel === 'number' ? cel : null}
                    ativo={usar}
                    rotulo={c.rotulo}
                    aoMudar={(n) => mudarCelula(l._id, c.id, n)}
                  />
                )
              }
              return (
                <input
                  key={c.id}
                  type="text"
                  value={typeof cel === 'string' ? cel : ''}
                  readOnly={!usar}
                  tabIndex={usar ? 0 : -1}
                  aria-label={c.rotulo}
                  onChange={(e) => mudarCelula(l._id, c.id, e.target.value)}
                />
              )
            })}
            {usar && (
              <button
                type="button"
                className="tabela__remover"
                aria-label="Remover linha"
                onClick={() => definir(linhas.filter((x) => x._id !== l._id))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {usar && (
          <button type="button" className="tabela__adicionar" onClick={adicionar}>
            + Adicionar linha
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Imagem ----------

function CampoImagem({
  src,
  ajuste,
  usar,
  rotulo,
  definir,
  avisar,
}: {
  src: string
  ajuste: 'cobrir' | 'conter'
  usar: boolean
  rotulo: string
  definir: (v: Valor) => void
  avisar?: (t: string) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const escolher = () => entrada.current?.click()
  const aoEscolher = async (arquivo: File | undefined) => {
    if (!arquivo) return
    try {
      definir(await reduzirImagem(arquivo))
    } catch {
      avisar?.('Não deu para abrir essa imagem. Tente um arquivo PNG, JPG ou WebP.')
    }
  }
  return (
    <div className="imagem">
      {src ? (
        <img src={src} alt={rotulo} style={{ objectFit: ajuste === 'cobrir' ? 'cover' : 'contain' }} />
      ) : (
        <div className="imagem__vazia" aria-hidden={usar ? undefined : true}>
          {usar ? (
            <button type="button" onClick={escolher}>
              Escolher imagem
            </button>
          ) : (
            <span>{rotulo}</span>
          )}
        </div>
      )}
      {usar && src && (
        <div className="imagem__acoes">
          <button type="button" onClick={escolher}>
            Trocar
          </button>
          <button type="button" onClick={() => definir('')}>
            Remover
          </button>
        </div>
      )}
      {usar && (
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void aoEscolher(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      )}
    </div>
  )
}
