// Tela do mapa de batalha: barra de ferramentas, canvas e painel. A lógica fica em grade.ts, regua.ts e
// operacoes.ts. Aqui só se junta tudo e se trata o toque e o mouse.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { arrastar, telaParaMundo, zoomEm, type Camera } from '../mapa/camera'
import { Icone, type NomeIcone } from '../mapa/Icones'
import { useAparencia } from '../nucleo/aparencia'
import { baixarArquivo, imagemDoArquivo, imagemParaArquivo } from './arquivo-navegador'
import { cenaParaImportar, lerArquivo, montarArquivo, nomeDoArquivo, type ArquivoBatalha, type ResumoLeitura } from './arquivo'
import { desenhar, type LinhaDesenhada } from './desenho'
import { encaixar, tamanhoPorMedida } from './grade'
import { abrirImagem, prepararFundo } from './fundo'
import {
  LIMITE_TOKENS,
  adicionarToken,
  cenaNova,
  CORES_TOKEN,
  definirEncaixe,
  definirFundo,
  editarToken,
  enquadrar,
  moverToken,
  mudarGrade,
  mudarMedida,
  pontoDeEntrada,
  removerToken,
  tokenEm,
} from './operacoes'
import { medir, numero } from './regua'
import { RepositorioBatalhaLocal } from './repositorio'
import type { Cena, Ponto, RegraDiagonal, TipoGrade } from './tipos'

const ID_DA_CENA = 'principal'

type Ferramenta = 'mover' | 'regua' | 'alinhar' | 'calibrar'

const FERRAMENTAS: { id: Ferramenta; rotulo: string; icone: NomeIcone; dica: string }[] = [
  { id: 'mover', rotulo: 'Mover', icone: 'navegar', dica: 'Arraste os tokens e o mapa' },
  { id: 'regua', rotulo: 'Régua', icone: 'regua', dica: 'Arraste para medir uma distância' },
  { id: 'alinhar', rotulo: 'Alinhar a grade', icone: 'grade', dica: 'Arraste para encostar a grade nas linhas da imagem' },
  { id: 'calibrar', rotulo: 'Medir a célula', icone: 'centro', dica: 'Arraste ao longo de algumas células para acertar o tamanho da grade' },
]

const TIPOS_DE_GRADE: { id: TipoGrade; rotulo: string }[] = [
  { id: 'quadrada', rotulo: 'Quadrada' },
  { id: 'hex-pontudo', rotulo: 'Hexágono pontudo' },
  { id: 'hex-chato', rotulo: 'Hexágono chato' },
  { id: 'nenhuma', rotulo: 'Sem grade' },
]

const REGRAS_DIAGONAL: { id: RegraDiagonal; rotulo: string }[] = [
  { id: 'simples', rotulo: 'Diagonal vale 1' },
  { id: 'alternada', rotulo: 'Diagonal 1, 2, 1, 2' },
  { id: 'euclidiana', rotulo: 'Em linha reta' },
]

const TAMANHOS_DE_TOKEN = [0.5, 1, 2, 3, 4]

/** Mais que isto não é uma cena de batalha. O arquivo carrega a imagem em base64. */
const TAMANHO_MAXIMO_ARQUIVO = 80 * 1024 * 1024

interface Arrasto {
  tipo: 'camera' | 'token' | 'grade' | 'regua' | 'calibrar'
  ponteiro: number
  /** Ponto do mundo onde o arrasto começou. */
  inicio: Ponto
  /** Token: distância entre o toque e o centro dele. Grade: origem da grade ao começar. */
  base: Ponto
  id?: string
  moveu: boolean
}

/** Campo numérico que deixa digitar à vontade e só corrige o texto ao sair do campo. */
function Campo({ rotulo, valor, passo = 1, sufixo, aoMudar }: { rotulo: string; valor: number; passo?: number; sufixo?: string; aoMudar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor))
  const [foco, setFoco] = useState(false)
  const [visto, setVisto] = useState(valor)
  // O valor mudou por fora (arrastar a grade, medir a célula): mostra, a não ser que a pessoa esteja digitando.
  if (valor !== visto) {
    setVisto(valor)
    if (!foco) setTexto(String(Math.round(valor * 100) / 100))
  }
  return (
    <label className="batalha__campo">
      <span>{rotulo}</span>
      <span className="batalha__entrada">
        <input
          type="number"
          inputMode="decimal"
          step={passo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            const v = parseFloat(e.target.value)
            if (Number.isFinite(v)) aoMudar(v)
          }}
          onFocus={() => setFoco(true)}
          onBlur={() => {
            setFoco(false)
            setTexto(String(Math.round(valor * 100) / 100))
          }}
        />
        {sufixo && <small>{sufixo}</small>}
      </span>
    </label>
  )
}

function lerCores(raiz: HTMLElement): { fundo: string; acento: string } {
  const css = getComputedStyle(raiz)
  return { fundo: css.getPropertyValue('--batalha-vazio').trim() || '#223530', acento: css.getPropertyValue('--acento').trim() || '#c2185b' }
}

export function TelaBatalha() {
  const aparencia = useAparencia()
  const repositorio = useMemo(() => new RepositorioBatalhaLocal(), [])
  const raizRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [cena, setCena] = useState<Cena>(() => cenaNova(ID_DA_CENA))
  const [carregada, setCarregada] = useState(false)
  const [imagem, setImagem] = useState<ImageBitmap | null>(null)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('mover')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [celulasMedidas, setCelulasMedidas] = useState(1)
  const [linha, setLinha] = useState<LinhaDesenhada | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [painelAberto, setPainelAberto] = useState(true)
  /** Arquivo lido, esperando a pessoa confirmar a troca da cena. */
  const [importando, setImportando] = useState<{ nome: string; arquivo: ArquivoBatalha; resumo: ResumoLeitura } | null>(null)

  // O que os ouvintes do mouse e do toque precisam ler sem remontar.
  const cenaRef = useRef(cena)
  const ferramentaRef = useRef(ferramenta)
  const celulasMedidasRef = useRef(celulasMedidas)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 })
  const tamanhoRef = useRef({ largura: 0, altura: 0 })
  const imagemRef = useRef<ImageBitmap | null>(null)
  const selecionadoRef = useRef<string | null>(null)
  const linhaRef = useRef<LinhaDesenhada | null>(null)
  const quadroRef = useRef(0)
  const entradaArquivoRef = useRef<HTMLInputElement>(null)
  const entradaCenaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    cenaRef.current = cena
    ferramentaRef.current = ferramenta
    celulasMedidasRef.current = celulasMedidas
    imagemRef.current = imagem
    selecionadoRef.current = selecionadoId
    linhaRef.current = linha
  })

  // ----- desenhar -----
  const pedirQuadro = useCallback(() => {
    if (quadroRef.current) return
    quadroRef.current = requestAnimationFrame(() => {
      quadroRef.current = 0
      const canvas = canvasRef.current
      const raiz = raizRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !raiz || !ctx) return
      const { largura, altura } = tamanhoRef.current
      desenhar(ctx, {
        cena: cenaRef.current,
        imagem: imagemRef.current,
        camera: cameraRef.current,
        largura,
        altura,
        densidade: window.devicePixelRatio || 1,
        selecionadoId: selecionadoRef.current,
        linha: linhaRef.current,
        cores: lerCores(raiz),
      })
    })
  }, [])

  useEffect(() => {
    pedirQuadro()
  }, [cena, imagem, selecionadoId, linha, aparencia, pedirQuadro])

  const mudarCamera = useCallback(
    (c: Camera) => {
      cameraRef.current = c
      pedirQuadro()
    },
    [pedirQuadro],
  )

  const enquadrarTudo = useCallback(() => {
    const { largura, altura } = tamanhoRef.current
    mudarCamera(enquadrar(cenaRef.current.fundo, largura, altura))
  }, [mudarCamera])

  // ----- tamanho do canvas -----
  useEffect(() => {
    const canvas = canvasRef.current
    const palco = canvas?.parentElement
    if (!canvas || !palco) return
    const medirPalco = () => {
      const r = palco.getBoundingClientRect()
      const d = window.devicePixelRatio || 1
      tamanhoRef.current = { largura: r.width, altura: r.height }
      canvas.width = Math.max(1, Math.round(r.width * d))
      canvas.height = Math.max(1, Math.round(r.height * d))
      pedirQuadro()
    }
    const observador = new ResizeObserver(medirPalco)
    observador.observe(palco)
    medirPalco()
    return () => observador.disconnect()
  }, [pedirQuadro])

  // ----- carregar o que ficou guardado -----
  useEffect(() => {
    let cancelado = false
    repositorio
      .carregar(ID_DA_CENA)
      .then(async ({ cena: guardada, imagem: blob }) => {
        if (cancelado) return
        const bitmap = blob ? await abrirImagem(blob).catch(() => null) : null
        if (cancelado) {
          bitmap?.close()
          return
        }
        const base = guardada ?? cenaNova(ID_DA_CENA)
        // Sem imagem legível, o fundo some da cena: ela não promete uma imagem que não está lá.
        const cenaLida = bitmap || !base.fundo ? base : definirFundo(base, null)
        setCena(cenaLida)
        setImagem(bitmap)
        cenaRef.current = cenaLida
        mudarCamera(enquadrar(cenaLida.fundo, tamanhoRef.current.largura, tamanhoRef.current.altura))
        setCarregada(true)
      })
      .catch((e) => {
        if (cancelado) return
        setAviso(`Não consegui abrir o mapa de batalha guardado: ${e instanceof Error ? e.message : String(e)}`)
        setCarregada(true)
      })
    return () => {
      cancelado = true
    }
  }, [repositorio, mudarCamera])

  // ----- guardar a cena, um instante depois da última mudança -----
  useEffect(() => {
    if (!carregada) return
    const t = window.setTimeout(() => {
      repositorio.salvarCena(cena).catch((e) => setAviso(`Não consegui guardar o mapa de batalha: ${e instanceof Error ? e.message : String(e)}`))
    }, 400)
    return () => window.clearTimeout(t)
  }, [cena, carregada, repositorio])

  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 6000)
    return () => window.clearTimeout(t)
  }, [aviso])

  // ----- mouse e toque -----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ponteiros = new Map<number, Ponto>()
    let arrasto: Arrasto | null = null
    let pinca: { distancia: number; centro: Ponto } | null = null

    const naTela = (e: PointerEvent): Ponto => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const noMundo = (p: Ponto): Ponto => {
      const { largura, altura } = tamanhoRef.current
      return telaParaMundo(cameraRef.current, largura, altura, p.x, p.y)
    }
    const dadosDaPinca = () => {
      const [a, b] = [...ponteiros.values()]
      return { distancia: Math.hypot(b.x - a.x, b.y - a.y), centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    }
    const atualizarLinha = (a: Ponto, b: Ponto, modo: 'regua' | 'calibrar') => {
      const c = cenaRef.current
      if (modo === 'regua') {
        const m = medir(c.grade, c.medida, a, b)
        setLinha({ de: m.de, ate: m.ate, texto: m.texto })
      } else {
        const n = celulasMedidasRef.current
        const tam = tamanhoPorMedida(Math.hypot(b.x - a.x, b.y - a.y), n)
        setLinha({ de: a, ate: b, texto: `${numero(tam)} px por célula (${n} ${n === 1 ? 'célula' : 'células'})` })
      }
    }

    const aoPressionar = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const tela = naTela(e)
      ponteiros.set(e.pointerId, tela)
      if (ponteiros.size === 2) {
        // Dois dedos: o gesto de pinça vale mais que qualquer ferramenta.
        arrasto = null
        pinca = dadosDaPinca()
        return
      }
      if (ponteiros.size > 2) return
      const p = noMundo(tela)
      const c = cenaRef.current
      const f = ferramentaRef.current
      const base: Arrasto = { tipo: 'camera', ponteiro: e.pointerId, inicio: p, base: { x: 0, y: 0 }, moveu: false }
      if (f === 'mover') {
        const t = tokenEm(c, p)
        if (t) {
          arrasto = { ...base, tipo: 'token', id: t.id, base: { x: t.x - p.x, y: t.y - p.y } }
          setSelecionadoId(t.id)
        } else {
          arrasto = base
        }
      } else if (f === 'alinhar') {
        arrasto = { ...base, tipo: 'grade', base: { x: c.grade.x, y: c.grade.y } }
      } else {
        arrasto = { ...base, tipo: f }
        setLinha(null)
      }
    }

    const aoMover = (e: PointerEvent) => {
      if (!ponteiros.has(e.pointerId)) return
      const tela = naTela(e)
      const anterior = ponteiros.get(e.pointerId)!
      ponteiros.set(e.pointerId, tela)
      const { largura, altura } = tamanhoRef.current
      if (ponteiros.size === 2 && pinca) {
        const nova = dadosDaPinca()
        let cam = zoomEm(cameraRef.current, largura, altura, nova.centro.x, nova.centro.y, nova.distancia / (pinca.distancia || 1))
        cam = arrastar(cam, nova.centro.x - pinca.centro.x, nova.centro.y - pinca.centro.y)
        pinca = nova
        mudarCamera(cam)
        return
      }
      if (!arrasto || arrasto.ponteiro !== e.pointerId) return
      const p = noMundo(tela)
      if (Math.hypot(tela.x - anterior.x, tela.y - anterior.y) > 0) arrasto.moveu = true
      switch (arrasto.tipo) {
        case 'camera':
          mudarCamera(arrastar(cameraRef.current, tela.x - anterior.x, tela.y - anterior.y))
          break
        case 'token': {
          const id = arrasto.id!
          const c = cenaRef.current
          const t = c.tokens.find((x) => x.id === id)
          if (!t) break
          let alvo = { x: p.x + arrasto.base.x, y: p.y + arrasto.base.y }
          if (c.encaixar) alvo = encaixar(c.grade, alvo, t.tamanho)
          if (alvo.x !== t.x || alvo.y !== t.y) setCena((atual) => moverToken(atual, id, alvo))
          break
        }
        case 'grade':
          setCena((atual) => mudarGrade(atual, { x: arrasto!.base.x + (p.x - arrasto!.inicio.x), y: arrasto!.base.y + (p.y - arrasto!.inicio.y) }))
          break
        case 'regua':
        case 'calibrar':
          atualizarLinha(arrasto.inicio, p, arrasto.tipo)
          break
      }
    }

    const aoSoltar = (e: PointerEvent) => {
      const tela = ponteiros.get(e.pointerId)
      ponteiros.delete(e.pointerId)
      if (ponteiros.size < 2) pinca = null
      if (!arrasto || arrasto.ponteiro !== e.pointerId) return
      const fim = tela ? noMundo(tela) : arrasto.inicio
      if (arrasto.tipo === 'calibrar' && arrasto.moveu) {
        const tam = tamanhoPorMedida(Math.hypot(fim.x - arrasto.inicio.x, fim.y - arrasto.inicio.y), celulasMedidasRef.current)
        if (tam > 0) setCena((atual) => mudarGrade(atual, { tamanho: tam }))
        setLinha(null)
      } else if (arrasto.tipo === 'camera' && !arrasto.moveu) {
        // Toque sem arrastar no vazio: tira a seleção.
        setSelecionadoId(null)
      }
      arrasto = null
    }

    const aoRoda = (e: WheelEvent) => {
      e.preventDefault()
      const tela = { x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top }
      const { largura, altura } = tamanhoRef.current
      mudarCamera(zoomEm(cameraRef.current, largura, altura, tela.x, tela.y, Math.exp(-e.deltaY * 0.0015)))
    }

    canvas.addEventListener('pointerdown', aoPressionar)
    canvas.addEventListener('pointermove', aoMover)
    canvas.addEventListener('pointerup', aoSoltar)
    canvas.addEventListener('pointercancel', aoSoltar)
    canvas.addEventListener('wheel', aoRoda, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', aoPressionar)
      canvas.removeEventListener('pointermove', aoMover)
      canvas.removeEventListener('pointerup', aoSoltar)
      canvas.removeEventListener('pointercancel', aoSoltar)
      canvas.removeEventListener('wheel', aoRoda)
    }
  }, [mudarCamera])

  // ----- teclado -----
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') {
        setSelecionadoId(null)
        setLinha(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selecionadoRef.current) {
        const id = selecionadoRef.current
        setCena((atual) => removerToken(atual, id))
        setSelecionadoId(null)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  // ----- ações -----
  const escolherFerramenta = (f: Ferramenta) => {
    setFerramenta(f)
    setLinha(null)
  }

  const escolherImagem = useCallback(
    async (arquivo: File | undefined) => {
      if (!arquivo) return
      setOcupado(true)
      try {
        const { blob, bitmap } = await prepararFundo(arquivo)
        await repositorio.salvarImagem(ID_DA_CENA, blob)
        const novaCena = definirFundo(cenaRef.current, { largura: bitmap.width, altura: bitmap.height })
        imagemRef.current?.close()
        cenaRef.current = novaCena
        setImagem(bitmap)
        setCena(novaCena)
        mudarCamera(enquadrar(novaCena.fundo, tamanhoRef.current.largura, tamanhoRef.current.altura))
        setAviso(`Imagem de ${bitmap.width} por ${bitmap.height} pixels posta no fundo. Ajuste a grade para encaixar nela.`)
      } catch (e) {
        setAviso(`Não consegui usar a imagem: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setOcupado(false)
      }
    },
    [repositorio, mudarCamera],
  )

  const tirarImagem = useCallback(async () => {
    setOcupado(true)
    try {
      await repositorio.salvarImagem(ID_DA_CENA, null)
      imagemRef.current?.close()
      setImagem(null)
      setCena((atual) => definirFundo(atual, null))
    } catch (e) {
      setAviso(`Não consegui tirar a imagem: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOcupado(false)
    }
  }, [repositorio])

  const exportarCena = useCallback(async () => {
    setOcupado(true)
    try {
      const { imagem: guardada } = await repositorio.carregar(ID_DA_CENA)
      const naImagem = guardada ? await imagemParaArquivo(guardada) : null
      const c = cenaRef.current
      baixarArquivo(montarArquivo(c, naImagem), nomeDoArquivo(c.nome))
      setAviso(`Cena exportada: ${c.tokens.length} tokens${naImagem ? ' e a imagem de fundo' : ', sem imagem de fundo'}.`)
    } catch (e) {
      setAviso(`Não consegui exportar a cena: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOcupado(false)
    }
  }, [repositorio])

  const escolherArquivoDeCena = useCallback(async (arquivo: File | undefined) => {
    if (!arquivo) return
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
      setAviso('Esse arquivo é grande demais para ser uma cena (mais de 80 MB). Escolha um arquivo exportado pelo mapa de batalha.')
      return
    }
    const lido = lerArquivo(await arquivo.text())
    if (!lido.ok) {
      setAviso(lido.erro)
      return
    }
    setImportando({ nome: arquivo.name, arquivo: lido.arquivo, resumo: lido.resumo })
  }, [])

  const confirmarImportacao = useCallback(async () => {
    if (!importando) return
    setOcupado(true)
    let bitmap: ImageBitmap | null = null
    try {
      const { arquivo } = importando
      const blob = arquivo.imagem ? await imagemDoArquivo(arquivo.imagem) : null
      bitmap = blob ? await abrirImagem(blob).catch(() => null) : null
      if (blob && !bitmap) throw new Error('a imagem de fundo do arquivo não abriu. Exporte de novo, ou use um arquivo sem imagem.')
      const nova = cenaParaImportar(arquivo.cena, ID_DA_CENA, bitmap && { largura: bitmap.width, altura: bitmap.height })
      if (!nova) throw new Error('a imagem de fundo tem mais de 16384 pixels de lado.')
      await repositorio.salvarImagem(ID_DA_CENA, blob)
      imagemRef.current?.close()
      cenaRef.current = nova
      setImagem(bitmap)
      setCena(nova)
      setSelecionadoId(null)
      setLinha(null)
      mudarCamera(enquadrar(nova.fundo, tamanhoRef.current.largura, tamanhoRef.current.altura))
      setImportando(null)
      setAviso(`Cena importada: ${nova.tokens.length} tokens${bitmap ? ' e a imagem de fundo' : ''}.`)
      bitmap = null
    } catch (e) {
      bitmap?.close()
      setAviso(`Não consegui importar a cena: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOcupado(false)
    }
  }, [importando, repositorio, mudarCamera])

  const novoToken = () => {
    const { largura, altura } = tamanhoRef.current
    const centro = telaParaMundo(cameraRef.current, largura, altura, largura / 2, altura / 2)
    const r = adicionarToken(cena, pontoDeEntrada(cena, centro))
    if (!r.token) {
      setAviso(`Cabem no máximo ${LIMITE_TOKENS} tokens num mapa. Tire algum para pôr outro.`)
      return
    }
    setCena(r.cena)
    setSelecionadoId(r.token.id)
  }

  const zoom = (fator: number) => {
    const { largura, altura } = tamanhoRef.current
    mudarCamera(zoomEm(cameraRef.current, largura, altura, largura / 2, altura / 2, fator))
  }

  const escolhido = cena.tokens.find((t) => t.id === selecionadoId) ?? null
  const semCelulas = cena.grade.tipo === 'nenhuma'

  return (
    <div className="batalha" ref={raizRef}>
      <header className="batalha__topo">
        <div className="modo" role="radiogroup" aria-label="Ferramenta">
          {FERRAMENTAS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={ferramenta === f.id} title={`${f.rotulo}: ${f.dica}`} onClick={() => escolherFerramenta(f.id)}>
              <Icone nome={f.icone} />
              <span className="batalha__rotulo">{f.rotulo}</span>
            </button>
          ))}
        </div>
        {ferramenta === 'calibrar' && (
          <div className="batalha__calibrar">
            <Campo rotulo="Células na medida" valor={celulasMedidas} aoMudar={(v) => setCelulasMedidas(Math.max(0.5, Math.min(100, v)))} passo={0.5} />
          </div>
        )}
        <button type="button" className="botao-topo" onClick={novoToken}>
          Adicionar token
        </button>
        <div className="grupo-botoes">
          <button type="button" className="botao-icone" title="Afastar" aria-label="Afastar" onClick={() => zoom(1 / 1.25)}>
            <Icone nome="menos" />
          </button>
          <button type="button" className="botao-icone" title="Aproximar" aria-label="Aproximar" onClick={() => zoom(1.25)}>
            <Icone nome="mais" />
          </button>
          <button type="button" className="botao-icone" title="Mostrar a imagem inteira" aria-label="Mostrar a imagem inteira" onClick={enquadrarTudo}>
            <Icone nome="centro" />
          </button>
        </div>
        <span className="espaco" />
        <button type="button" className="botao-icone" title="Painel da grade e dos tokens" aria-label="Painel da grade e dos tokens" aria-pressed={painelAberto} onClick={() => setPainelAberto((v) => !v)}>
          <Icone nome="lateral" />
        </button>
      </header>

      <div className="batalha__corpo">
        <div className="batalha__palco">
          <canvas ref={canvasRef} className={`batalha__canvas batalha__canvas--${ferramenta}`} aria-label="Mapa de batalha" />
          {!imagem && cena.tokens.length === 0 && carregada && (
            <p className="batalha__dica">Escolha uma imagem de fundo no painel, ajuste a grade por cima e adicione os tokens. Sem imagem, a grade vale do mesmo jeito.</p>
          )}
          {importando && (
            <div className="batalha__importar" role="dialog" aria-label="Importar cena">
              <h2>Importar cena</h2>
              <p>
                <b>{importando.nome}</b>: {importando.resumo.tokens} {importando.resumo.tokens === 1 ? 'token' : 'tokens'}
                {importando.resumo.comImagem ? ' e imagem de fundo' : ', sem imagem de fundo'}, grade {TIPOS_DE_GRADE.find((g) => g.id === importando.arquivo.cena.grade.tipo)?.rotulo.toLowerCase()}.
              </p>
              {importando.resumo.descartados > 0 && (
                <p className="batalha__importar-alerta">{importando.resumo.descartados} token(s) do arquivo estavam quebrados e vão ficar de fora.</p>
              )}
              <p className="batalha__importar-alerta">Isto troca a cena de agora: a imagem, a grade e os tokens. Não dá para desfazer. Exporte antes se quiser guardar a atual.</p>
              <div className="batalha__botoes">
                <button type="button" className="botao-topo botao-topo--principal" disabled={ocupado} onClick={() => void confirmarImportacao()}>
                  Trocar a cena
                </button>
                <button type="button" className="botao-topo" disabled={ocupado} onClick={() => setImportando(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {aviso && (
            <div className="batalha__aviso" role="status">
              {aviso}
            </div>
          )}
        </div>

        {painelAberto && (
          <aside className="batalha__painel" aria-label="Grade e tokens">
            <section className="batalha__secao">
              <h2>Fundo</h2>
              <div className="batalha__botoes">
                <button type="button" className="botao-topo" disabled={ocupado} onClick={() => entradaArquivoRef.current?.click()}>
                  {imagem ? 'Trocar a imagem' : 'Escolher a imagem'}
                </button>
                {imagem && (
                  <button type="button" className="botao-topo" disabled={ocupado} onClick={() => void tirarImagem()}>
                    Tirar a imagem
                  </button>
                )}
              </div>
              <input
                ref={entradaArquivoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  void escolherImagem(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {cena.fundo && (
                <p className="batalha__dica-painel">
                  {cena.fundo.largura} por {cena.fundo.altura} pixels. Ela fica guardada só neste navegador.
                </p>
              )}
            </section>

            <section className="batalha__secao">
              <h2>Arquivo</h2>
              <div className="batalha__botoes">
                <button type="button" className="botao-topo" disabled={ocupado} title="Baixa a cena, os tokens e a imagem de fundo num arquivo" onClick={() => void exportarCena()}>
                  Exportar a cena
                </button>
                <button type="button" className="botao-topo" disabled={ocupado} title="Troca a cena atual pela de um arquivo exportado" onClick={() => entradaCenaRef.current?.click()}>
                  Importar uma cena
                </button>
              </div>
              <input
                ref={entradaCenaRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  void escolherArquivoDeCena(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </section>

            <section className="batalha__secao">
              <h2>Grade</h2>
              <div className="batalha__tipos" role="radiogroup" aria-label="Tipo de grade">
                {TIPOS_DE_GRADE.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={cena.grade.tipo === t.id} onClick={() => setCena((c) => mudarGrade(c, { tipo: t.id }))}>
                    {t.rotulo}
                  </button>
                ))}
              </div>
              <div className="batalha__grade-campos">
                <Campo rotulo={semCelulas ? 'Célula de referência' : 'Tamanho da célula'} valor={cena.grade.tamanho} sufixo="px" aoMudar={(v) => setCena((c) => mudarGrade(c, { tamanho: v }))} />
                {!semCelulas && (
                  <>
                    <Campo rotulo="Deslocamento horizontal" valor={cena.grade.x} sufixo="px" aoMudar={(v) => setCena((c) => mudarGrade(c, { x: v }))} />
                    <Campo rotulo="Deslocamento vertical" valor={cena.grade.y} sufixo="px" aoMudar={(v) => setCena((c) => mudarGrade(c, { y: v }))} />
                  </>
                )}
              </div>
              {!semCelulas && (
                <>
                  <label className="batalha__marca">
                    <input type="checkbox" checked={cena.grade.visivel} onChange={(e) => setCena((c) => mudarGrade(c, { visivel: e.target.checked }))} />
                    Mostrar a grade
                  </label>
                  <div className="batalha__linha">
                    <label>
                      Cor
                      <select value={cena.grade.cor} onChange={(e) => setCena((c) => mudarGrade(c, { cor: e.target.value as Cena['grade']['cor'] }))}>
                        <option value="clara">Clara</option>
                        <option value="escura">Escura</option>
                        <option value="acento">Framboesa</option>
                      </select>
                    </label>
                    <label>
                      Força
                      <input type="range" min={0.1} max={1} step={0.05} value={cena.grade.opacidade} onChange={(e) => setCena((c) => mudarGrade(c, { opacidade: parseFloat(e.target.value) }))} />
                    </label>
                  </div>
                  <p className="batalha__dica-painel">
                    Para encaixar na imagem: use "Medir a célula" arrastando ao longo de algumas células, e depois "Alinhar a grade" arrastando até as linhas coincidirem.
                  </p>
                </>
              )}
            </section>

            <section className="batalha__secao">
              <h2>Distância</h2>
              <div className="batalha__grade-campos">
                <Campo rotulo="Uma célula vale" valor={cena.medida.valorPorCelula} passo={0.5} aoMudar={(v) => setCena((c) => mudarMedida(c, { valorPorCelula: v }))} />
                <label className="batalha__campo">
                  <span>Unidade</span>
                  <span className="batalha__entrada">
                    <input type="text" maxLength={12} value={cena.medida.unidade} onChange={(e) => setCena((c) => mudarMedida(c, { unidade: e.target.value }))} />
                  </span>
                </label>
              </div>
              {cena.grade.tipo === 'quadrada' && (
                <label className="batalha__campo">
                  <span>Régua na diagonal</span>
                  <select value={cena.medida.diagonal} onChange={(e) => setCena((c) => mudarMedida(c, { diagonal: e.target.value as RegraDiagonal }))}>
                    {REGRAS_DIAGONAL.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>

            <section className="batalha__secao">
              <h2>Tokens</h2>
              <label className="batalha__marca">
                <input type="checkbox" checked={cena.encaixar} disabled={semCelulas} onChange={(e) => setCena((c) => definirEncaixe(c, e.target.checked))} />
                Encaixar na grade ao mover
              </label>
              {escolhido ? (
                <div className="batalha__token">
                  <label className="batalha__campo">
                    <span>Nome</span>
                    <span className="batalha__entrada">
                      <input type="text" maxLength={40} value={escolhido.nome} onChange={(e) => setCena((c) => editarToken(c, escolhido.id, { nome: e.target.value }))} />
                    </span>
                  </label>
                  <div className="batalha__tipos" role="radiogroup" aria-label="Tamanho do token">
                    {TAMANHOS_DE_TOKEN.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={escolhido.tamanho === t} title={`${numero(t)} ${t === 1 ? 'célula' : 'células'} de lado`} onClick={() => setCena((c) => editarToken(c, escolhido.id, { tamanho: t }))}>
                        {numero(t)}
                      </button>
                    ))}
                  </div>
                  <div className="batalha__cores" role="radiogroup" aria-label="Cor do token">
                    {CORES_TOKEN.map((cor) => (
                      <button key={cor} type="button" role="radio" aria-checked={escolhido.cor.toLowerCase() === cor} aria-label={`Cor ${cor}`} style={{ background: cor }} onClick={() => setCena((c) => editarToken(c, escolhido.id, { cor }))} />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="botao-topo"
                    onClick={() => {
                      setCena((c) => removerToken(c, escolhido.id))
                      setSelecionadoId(null)
                    }}
                  >
                    Tirar o token
                  </button>
                </div>
              ) : (
                <p className="batalha__dica-painel">
                  {cena.tokens.length === 0 ? 'Nenhum token ainda. Use "Adicionar token" na barra.' : 'Toque num token para editar o nome, o tamanho e a cor. Delete tira o token escolhido.'}
                </p>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
