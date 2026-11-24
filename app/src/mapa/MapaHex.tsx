// Tela do mapa hexagonal: barra de ferramentas, paletas, canvas e painéis.
// A lógica fica em controlador.ts, renderizador.ts e entrada.ts. Aqui só se junta tudo.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useAparencia } from '../nucleo/aparencia'
import { abrirRepositorioMapa, useServidor } from '../servidor/conexao'
import { carregarCamera, autorLocal, salvarCamera, metaPadrao, carregarViagem, salvarViagem, carregarPainelAberto, salvarPainelAberto, CAMERA_INICIAL } from './armazenamento'
import { lerArquivo, nomeDoArquivo, terrenosDesconhecidos, type ArquivoMapa, type ModoImportacao, type ResumoLeitura } from './arquivo'
import { zoomEm } from './camera'
import { ControladorMapa, novoId } from './controlador'
import { EntradaMapa, type Ferramenta } from './entrada'
import type { Hex } from './hex'
import { Icone, type NomeIcone } from './Icones'
import { InspetorHexagono } from './InspetorHexagono'
import { PaletaTerrenos } from './PaletaTerrenos'
import { PainelViagem, type ResultadoDaRota } from './PainelViagem'
import { resumirViagem, rotaPorPontos, terrenosDaRota, type ConfigViagem } from './viagem'
import { CORES_REGIAO } from './operacoes'
import { medirRegua, textoDaMedida } from './regua'
import { EditorDeRegiao, ListaDeRegioes } from './Regioes'
import { Renderizador, type CoresMapa } from './renderizador'
import type { RepositorioMapa } from './repositorio'
import { RepositorioLocal } from './repositorio-local'
import { Tileset } from './tileset'

const MAPA_ID = 'principal'
/**
 * Tileset em uso: a arte em pixel art (`pixel`). Para ver outra pasta sem mexer no código, abra o mapa com
 * `?tileset=<pasta>` no endereço, por exemplo `?tileset=padrao` para o tileset gerado por script.
 */
function urlDoTileset(): string {
  let id = 'pixel'
  try {
    const pedido = new URLSearchParams(window.location.search).get('tileset')
    if (pedido && /^[a-z0-9-]+$/.test(pedido)) id = pedido
  } catch {
    // sem endereço legível: fica a arte em pixel art
  }
  return `${import.meta.env.BASE_URL}tilesets/${id}/tileset.json`
}

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
  { id: 'regiao', rotulo: 'Região', icone: 'regiao', tecla: 'R' },
  { id: 'marcador', rotulo: 'Marcador', icone: 'marcador', tecla: 'M' },
  { id: 'rio', rotulo: 'Rio', icone: 'rio', tecla: 'I' },
  { id: 'estrada', rotulo: 'Estrada', icone: 'estrada', tecla: 'D' },
  { id: 'token', rotulo: 'Token', icone: 'token', tecla: 'T' },
  { id: 'regua', rotulo: 'Régua', icone: 'regua', tecla: 'L' },
  { id: 'rota', rotulo: 'Rota', icone: 'rota', tecla: 'P' },
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

const usaPincel = (f: Ferramenta) => f === 'pintar' || f === 'apagar' || f === 'regiao'

const NOME_PALETA: Partial<Record<Ferramenta, string>> = {
  regiao: 'Regiões',
  marcador: 'Marcadores',
  rio: 'Rio',
  estrada: 'Estrada',
  token: 'Token do grupo',
  regua: 'Régua',
  rota: 'Rota de viagem',
}

export function MapaHex() {
  const { escuro } = useAparencia()
  const raizRef = useRef<HTMLDivElement>(null)
  const palcoRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [motor, setMotor] = useState<Motor | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** O servidor avisou que o mapa ficou desatualizado e há edição que ainda não foi enviada: a pessoa decide. */
  const [pedirRecarga, setPedirRecarga] = useState(false)
  /** Sobe para montar o mapa de novo (recarga depois de ficar desatualizado). */
  const [geracao, setGeracao] = useState(0)

  // De onde vem o mapa: da campanha aberta, se houver login, ou deste navegador.
  const servidor = useServidor()
  const papelNaCampanha = servidor.campanhas.find((c) => c.id === servidor.campanhaAtualId)?.papel ?? null
  const pronto = servidor.fase === 'conectado' || servidor.fase === 'desconectado'
  const campanhaId = servidor.fase === 'conectado' && papelNaCampanha ? servidor.campanhaAtualId : null
  const usuarioId = servidor.usuario?.id ?? null
  const nomeDaCampanha = campanhaId ? (servidor.campanhas.find((c) => c.id === campanhaId)?.nome ?? '') : ''
  /** Arquivo de mapa lido e esperando o jogador escolher mesclar, substituir ou cancelar. */
  const [importando, setImportando] = useState<{
    nome: string
    arquivo: ArquivoMapa
    resumo: ResumoLeitura
    desconhecidos: [string, number][]
  } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const entradaArquivoRef = useRef<HTMLInputElement>(null)

  const [ferramenta, setFerramenta] = useState<Ferramenta>('pintar')
  const [terreno, setTerreno] = useState('planicie')
  const [marcadorAtivo, setMarcadorAtivo] = useState('')
  /** Região que a ferramenta Região pinta. Null = tirar da região. Undefined = ainda não escolheu. */
  const [regiaoAtiva, setRegiaoAtiva] = useState<string | null | undefined>(undefined)
  const [regiaoEditando, setRegiaoEditando] = useState<string | null>(null)
  const [raio, setRaio] = useState(0)
  /** Rio e Estrada: tira o traço em vez de desenhar. */
  const [tirarTraco, setTirarTraco] = useState(false)
  const [versaoRegua, setVersaoRegua] = useState(0)
  const [grade, setGrade] = useState(true)
  const [mostrarRegioes, setMostrarRegioes] = useState(true)
  const [hover, setHover] = useState<Hex | null>(null)
  const [selecionado, setSelecionado] = useState<Hex | null>(null)
  const [zoom, setZoom] = useState(CAMERA_INICIAL.zoom)
  // Aba lateral de viagem e provisões.
  const [painelAberto, setPainelAberto] = useState(carregarPainelAberto)
  const [configViagem, setConfigViagem] = useState<ConfigViagem>(carregarViagem)
  const [pontosRota, setPontosRota] = useState<Hex[]>([])
  const [comecarNoToken, setComecarNoToken] = useState(true)

  // ----- ações que mexem na seleção e nos painéis -----
  const limparSelecao = useCallback(() => {
    motor?.render.definirSelecao(null)
    setSelecionado(null)
  }, [motor])

  const selecionar = useCallback(
    (h: Hex) => {
      motor?.render.definirSelecao(h)
      setSelecionado(h)
      setRegiaoEditando(null)
      if (window.matchMedia('(max-width: 720px)').matches) motor?.render.trazerParaCima(h)
    },
    [motor],
  )
  const aoSelecionarRef = useRef<(h: Hex) => void>(() => {})
  useEffect(() => {
    aoSelecionarRef.current = selecionar
  })

  const escolherFerramenta = useCallback(
    (f: Ferramenta) => {
      setFerramenta(f)
      // O painel do hexágono cobriria a paleta e atrapalharia pintar: sai da frente.
      if (f === 'pintar' || f === 'apagar' || f === 'regiao' || f === 'rio' || f === 'estrada') limparSelecao()
      if (f !== 'regiao') setRegiaoEditando(null)
      if (f !== 'regua' && motor?.render.regua) motor.render.definirRegua(null)
      if (f === 'rota') setPainelAberto(true)
    },
    [limparSelecao, motor],
  )

  const aoMarcarRef = useRef<(h: Hex) => void>(() => {})
  useEffect(() => {
    aoMarcarRef.current = (h) => {
      if (!motor) return
      const existente = motor.ctrl.armazem.ler(h.q, h.r)
      if (!existente) {
        setAviso('Pinte o terreno deste hexágono antes de colocar um marcador nele.')
        return
      }
      if (marcadorAtivo) {
        motor.ctrl.editarHexagono(h.q, h.r, {
          marcadores: [...existente.marcadores, { id: novoId(), tipo: marcadorAtivo, nome: '' }],
        })
      }
      selecionar(h)
    }
  })

  // ----- montar o motor -----
  // Monta de novo quando a campanha, o papel ou a conta mudam: o repositório do servidor se fecha sozinho
  // nesses casos, e o mapa de uma campanha não pode ficar misturado com o de outra.
  useEffect(() => {
    const canvas = canvasRef.current
    const palco = palcoRef.current
    const raiz = raizRef.current
    if (!canvas || !palco || !raiz || !pronto) return
    let cancelado = false
    let desmontar: (() => void) | null = null
    setPedirRecarga(false)

    Tileset.carregar(urlDoTileset())
      .then((tileset) => {
        if (cancelado) return
        const doServidor = campanhaId && usuarioId ? abrirRepositorioMapa() : null
        const repo: RepositorioMapa = doServidor ?? new RepositorioLocal(MAPA_ID)
        const autor = doServidor && usuarioId ? usuarioId : autorLocal()
        // Câmera e visão de cada mapa ficam separadas: o da campanha não herda a posição do mapa local.
        const mapaChave = doServidor ? `campanha-${campanhaId}` : MAPA_ID
        const ctrl = new ControladorMapa(repo, autor, { reaplicarPendentes: !!doServidor })
        ctrl.aoErro = setAviso
        ctrl.aoRecuperar = () => setAviso((a) => (a?.startsWith('Não consegui carregar') ? null : a))
        const cancelarDesatualizado = doServidor?.aoDesatualizar(() => {
          // Sem edição a perder, recarrega sozinho. Com edição no ar, quem decide é a pessoa.
          if (ctrl.pendente) {
            setPedirRecarga(true)
          } else {
            setAviso('Mapa atualizado.')
            setGeracao((g) => g + 1)
          }
        })
        void ctrl.carregarRegioes()
        void ctrl.carregarToken()
        const camera = carregarCamera(mapaChave)
        const render = new Renderizador(canvas, ctrl, tileset, camera, lerCores(raiz))
        const entrada = new EntradaMapa(canvas, render, ctrl, { ferramenta: 'pintar', terreno: 'planicie', regiaoId: null, raio: 0, tirarTraco: false })

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
          salvar = window.setTimeout(() => salvarCamera(mapaChave, c), 300)
        }
        setZoom(camera.zoom)
        setMarcadorAtivo(tileset.def.marcadores[0]?.id ?? '')
        entrada.aoPassar = setHover
        entrada.aoMarcar = (h) => aoMarcarRef.current(h)
        entrada.aoMoverToken = (h) => ctrl.moverToken(h)
        entrada.aoRota = (h) => {
          if (!ctrl.armazem.ler(h.q, h.r)) {
            setAviso('Marque a rota sobre hexágonos que já têm terreno.')
            return
          }
          setPontosRota((ps) => (ps.length && ps[ps.length - 1].q === h.q && ps[ps.length - 1].r === h.r ? ps : [...ps, h]))
        }
        entrada.aoMudarRegua = () => setVersaoRegua((v) => v + 1)
        entrada.aoSelecionar = (h) => aoSelecionarRef.current(h)

        const m = { ctrl, render, entrada, tileset }
        if (import.meta.env.DEV) (window as unknown as { __mapa?: Motor }).__mapa = m
        setMotor(m)
        render.pedirQuadro()

        desmontar = () => {
          window.clearTimeout(salvar)
          salvarCamera(mapaChave, render.camera)
          cancelarDesatualizado?.()
          observador.disconnect()
          entrada.destruir()
          render.destruir()
          ctrl.destruir()
          void (doServidor ?? (repo as RepositorioLocal)).fechar()
        }
      })
      .catch((e) => !cancelado && setErroCarga(e instanceof Error ? e.message : String(e)))

    return () => {
      cancelado = true
      desmontar?.()
      setMotor(null)
    }
  }, [pronto, campanhaId, papelNaCampanha, usuarioId, geracao])

  // ----- stores externos: histórico, contagem, regiões, hexágonos -----
  useSyncExternalStore(
    useCallback((cb: () => void) => (motor ? motor.ctrl.ouvirHistorico(cb) : () => {}), [motor]),
    () => motor?.ctrl.versaoHistorico ?? 0,
  )
  // Redesenha quando qualquer hexágono muda: o texto de status e a dica de mapa vazio dependem disso.
  const versaoMapa = useSyncExternalStore(
    useCallback((cb: () => void) => (motor ? motor.ctrl.armazem.ouvir(() => cb()) : () => {}), [motor]),
    () => motor?.ctrl.armazem.versao ?? 0,
  )
  const token = useSyncExternalStore(
    useCallback((cb: () => void) => (motor ? motor.ctrl.ouvirToken(cb) : () => {}), [motor]),
    () => motor?.ctrl.token ?? null,
  )
  const total = motor?.ctrl.armazem.total ?? 0

  // ----- viagem: a rota vale para o mapa e o token como estão agora -----
  const tokenQ = token?.q
  const tokenR = token?.r
  const pontosDaRota = useMemo(
    () => (comecarNoToken && tokenQ !== undefined && tokenR !== undefined ? [{ q: tokenQ, r: tokenR }, ...pontosRota] : pontosRota),
    [comecarNoToken, tokenQ, tokenR, pontosRota],
  )
  const calculoRota = useMemo(() => {
    if (!motor || pontosDaRota.length < 2) return null
    // versaoMapa entra na conta de propósito: mudou o terreno, mudou a rota.
    void versaoMapa
    return rotaPorPontos(motor.ctrl.armazem, pontosDaRota)
  }, [motor, pontosDaRota, versaoMapa])
  const resultadoRota: ResultadoDaRota | null = useMemo(() => {
    if (!motor || !calculoRota) return null
    if (!calculoRota.ok) return calculoRota
    const nomes = new Map(motor.tileset.def.terrenos.map((t) => [t.id, t.nome]))
    return {
      ok: true,
      resumo: resumirViagem(calculoRota.rota, configViagem),
      terrenos: terrenosDaRota(motor.ctrl.armazem, calculoRota.rota).map((t) => ({ ...t, nome: nomes.get(t.terreno) ?? t.terreno })),
      pontos: pontosDaRota.length,
    }
  }, [motor, calculoRota, configViagem, pontosDaRota.length])
  useEffect(() => {
    if (!motor) return
    motor.render.definirRota(
      pontosDaRota.length ? { pontos: pontosDaRota, caminho: calculoRota?.ok ? calculoRota.rota.caminho : [] } : null,
    )
  }, [motor, pontosDaRota, calculoRota])
  useEffect(() => salvarViagem(configViagem), [configViagem])
  useEffect(() => salvarPainelAberto(painelAberto), [painelAberto])
  const versaoRegioes = useSyncExternalStore(
    useCallback((cb: () => void) => (motor ? motor.ctrl.armazem.ouvirRegioes(cb) : () => {}), [motor]),
    () => motor?.ctrl.armazem.versaoRegioes ?? 0,
  )

  // Região escolhida que foi excluída (por mim ou por outro jogador) volta a "não escolhida".
  const regiaoAtivaValida =
    regiaoAtiva && motor && versaoRegioes >= 0 && !motor.ctrl.armazem.lerRegiao(regiaoAtiva) ? undefined : regiaoAtiva

  // ----- sincronizar opções com o motor -----
  const ferramentaEfetiva: Ferramenta = ferramenta === 'regiao' && regiaoAtivaValida === undefined ? 'navegar' : ferramenta
  useEffect(() => {
    if (!motor) return
    motor.entrada.definirOpcoes({ ferramenta: ferramentaEfetiva, terreno, regiaoId: regiaoAtivaValida ?? null, raio, tirarTraco })
  }, [motor, ferramentaEfetiva, terreno, regiaoAtivaValida, raio, tirarTraco, versaoRegioes])

  useEffect(() => {
    motor?.render.definirGrade(grade)
  }, [motor, grade])

  useEffect(() => {
    motor?.render.definirMostrarRegioes(mostrarRegioes)
  }, [motor, mostrarRegioes])

  useEffect(() => {
    if (motor && raizRef.current) motor.render.definirCores(lerCores(raizRef.current))
  }, [motor, escuro])

  const desfazer = useCallback(() => {
    if (!motor) return
    const conflitos = motor.ctrl.desfazer()
    if (conflitos) setAviso(`${conflitos} item(ns) ficaram como estão: outra pessoa mexeu neles depois de você.`)
  }, [motor])

  const refazer = useCallback(() => {
    if (!motor) return
    const conflitos = motor.ctrl.refazer()
    if (conflitos) setAviso(`${conflitos} item(ns) ficaram como estão: outra pessoa mexeu neles depois de você.`)
  }, [motor])

  const zoomPor = useCallback(
    (fator: number) => {
      if (!motor) return
      const { largura, altura } = motor.render.tamanhoTela
      motor.render.definirCamera(zoomEm(motor.render.camera, largura, altura, largura / 2, altura / 2, fator))
    },
    [motor],
  )

  // ----- exportar e importar o mapa -----
  const exportarMapa = useCallback(async () => {
    if (!motor || ocupado) return
    setOcupado(true)
    try {
      const meta = { ...metaPadrao(campanhaId ? `campanha-${campanhaId}` : MAPA_ID), tileset: motor.tileset.def.id }
      const arquivo = await motor.ctrl.exportar(meta)
      const blob = new Blob([JSON.stringify(arquivo)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nomeDoArquivo(meta.nome)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setAviso(`Mapa exportado: ${arquivo.hexagonos.length} hexágonos e ${arquivo.regioes.length} regiões.`)
    } catch (e) {
      setAviso(`Não consegui exportar o mapa: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setOcupado(false)
    }
  }, [motor, ocupado, campanhaId])

  const escolherArquivo = useCallback(
    async (arquivo: File | undefined) => {
      if (!arquivo || !motor) return
      if (arquivo.size > 60 * 1024 * 1024) {
        setAviso('Esse arquivo é grande demais para ser um mapa (mais de 60 MB). Escolha um arquivo exportado pelo mapa.')
        return
      }
      const lido = lerArquivo(await arquivo.text())
      if (!lido.ok) {
        setAviso(lido.erro)
        return
      }
      const conhecidos = new Set(motor.tileset.def.terrenos.map((t) => t.id))
      setImportando({
        nome: arquivo.name,
        arquivo: lido.arquivo,
        resumo: lido.resumo,
        desconhecidos: [...terrenosDesconhecidos(lido.arquivo, conhecidos)],
      })
    },
    [motor],
  )

  const confirmarImportacao = useCallback(
    async (modo: ModoImportacao) => {
      if (!motor || !importando || ocupado) return
      setOcupado(true)
      try {
        const { aplicados, removidos } = await motor.ctrl.importar(importando.arquivo, modo)
        setImportando(null)
        setAviso(
          aplicados + removidos === 0
            ? 'O mapa já estava igual ao arquivo, nada mudou.'
            : `Importado: ${aplicados} hexágonos${removidos ? ` e ${removidos} removidos` : ''}. Ctrl+Z desfaz.`,
        )
      } catch (e) {
        setAviso(`Não consegui importar: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setOcupado(false)
      }
    },
    [motor, importando, ocupado],
  )

  const irParaInicio = useCallback(() => motor?.render.definirCamera({ ...CAMERA_INICIAL }), [motor])

  const novaRegiao = useCallback(() => {
    if (!motor) return
    const n = motor.ctrl.armazem.listarRegioes().length
    const id = motor.ctrl.criarRegiao({ nome: `Região ${n + 1}`, cor: CORES_REGIAO[n % CORES_REGIAO.length] })
    if (!id) return
    setRegiaoAtiva(id)
    setRegiaoEditando(id)
    limparSelecao()
  }, [motor, limparSelecao])

  const limparRegua = useCallback(() => {
    if (!motor) return
    motor.render.definirRegua(null)
    setVersaoRegua((v) => v + 1)
  }, [motor])

  const irParaToken = useCallback(() => {
    if (motor?.ctrl.token) motor.render.centrarEm(motor.ctrl.token)
  }, [motor])

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
      } else if (k === 'v') escolherFerramenta('navegar')
      else if (k === 'b') escolherFerramenta('pintar')
      else if (k === 'e') escolherFerramenta('apagar')
      else if (k === 'r') escolherFerramenta('regiao')
      else if (k === 'm') escolherFerramenta('marcador')
      else if (k === 'i') escolherFerramenta('rio')
      else if (k === 'd') escolherFerramenta('estrada')
      else if (k === 't') escolherFerramenta('token')
      else if (k === 'l') escolherFerramenta('regua')
      else if (k === 'p') escolherFerramenta('rota')
      else if (k === 'g') setGrade((g) => !g)
      else if (k === '[') setRaio((r) => Math.max(0, r - 1))
      else if (k === ']') setRaio((r) => Math.min(2, r + 1))
      else if (k === '0' || k === 'home') irParaInicio()
      else if (k === '+' || k === '=') zoomPor(1.25)
      else if (k === '-') zoomPor(0.8)
      else if (k === 'escape') {
        limparSelecao()
        setRegiaoEditando(null)
        limparRegua()
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

  // Distância da régua: com só o primeiro ponto marcado, mede até o cursor (versaoRegua faz recalcular).
  const regua = versaoRegua >= 0 ? motor?.render.regua : null
  const fimRegua = regua ? (regua.b ?? motor?.render.reguaPonta ?? null) : null
  const distanciaRegua = regua && fimRegua ? medirRegua(regua.a, fimRegua).passos : null

  const marcadores = motor?.tileset.def.marcadores ?? []
  const noCursor = hover ?? selecionado
  const hexNoCursor = noCursor ? motor?.ctrl.armazem.ler(noCursor.q, noCursor.r) : null
  const nomeTerreno = hexNoCursor ? (motor?.tileset.terreno(hexNoCursor.terreno)?.nome ?? hexNoCursor.terreno) : null
  const regiaoNoCursor = hexNoCursor?.regiaoId ? motor?.ctrl.armazem.lerRegiao(hexNoCursor.regiaoId) : null

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
              onClick={() => escolherFerramenta(f.id)}
            >
              <Icone nome={f.icone} />
              <span className="mapa__rotulo">{f.rotulo}</span>
            </button>
          ))}
        </div>

        {usaPincel(ferramenta) && (
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
          <button type="button" className="botao-icone" title="Mostrar regiões" aria-label="Mostrar regiões" aria-pressed={mostrarRegioes} onClick={() => setMostrarRegioes((v) => !v)}>
            <Icone nome="olho" />
          </button>
        </div>
        <div className="grupo-botoes">
          <button type="button" className="botao-icone" title="Aba de viagem e provisões" aria-label="Aba de viagem e provisões" aria-pressed={painelAberto} onClick={() => setPainelAberto((v) => !v)}>
            <Icone nome="lateral" />
          </button>
          <button type="button" className="botao-icone" title="Exportar o mapa para um arquivo" aria-label="Exportar mapa" disabled={!motor || ocupado} onClick={exportarMapa}>
            <Icone nome="baixar" />
          </button>
          <button type="button" className="botao-icone" title="Importar um mapa de um arquivo" aria-label="Importar mapa" disabled={!motor || ocupado} onClick={() => entradaArquivoRef.current?.click()}>
            <Icone nome="subir" />
          </button>
          <input
            ref={entradaArquivoRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void escolherArquivo(e.target.files?.[0])
              // Limpa para poder escolher o mesmo arquivo de novo.
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="mapa__corpo">
        <aside className="mapa__paleta" aria-label={NOME_PALETA[ferramenta] ?? 'Terrenos'}>
          {ferramenta === 'regiao' && motor ? (
            <ListaDeRegioes ctrl={motor.ctrl} ativa={regiaoAtivaValida} aoEscolher={setRegiaoAtiva} aoEditar={(id) => { setRegiaoEditando(id); limparSelecao() }} aoCriar={novaRegiao} />
          ) : ferramenta === 'rio' || ferramenta === 'estrada' ? (
            <div className="mapa-ferramenta">
              <div className="modo" role="radiogroup" aria-label={ferramenta === 'rio' ? 'Modo do rio' : 'Modo da estrada'}>
                <button type="button" role="radio" aria-checked={!tirarTraco} onClick={() => setTirarTraco(false)}>
                  Desenhar
                </button>
                <button type="button" role="radio" aria-checked={tirarTraco} onClick={() => setTirarTraco(true)}>
                  Tirar
                </button>
              </div>
              <p className="mapa-painel__dica">
                {ferramenta === 'rio'
                  ? 'Arraste pelas bordas dos hexágonos. O rio só passa entre dois hexágonos que já têm terreno.'
                  : 'Arraste de hexágono em hexágono. A estrada liga o centro de um ao do vizinho e só passa entre hexágonos que já têm terreno.'}
              </p>
            </div>
          ) : ferramenta === 'token' ? (
            <div className="mapa-ferramenta">
              <p className="mapa-painel__dica">Toque num hexágono para levar o token do grupo até lá. Todos veem a mudança. O Ctrl+Z não desfaz o movimento.</p>
              <button type="button" className="botao-topo" disabled={!token} onClick={irParaToken}>
                Ir até o token
              </button>
              <button type="button" className="botao-topo" disabled={!token} onClick={() => motor?.ctrl.tirarToken()}>
                Tirar o token
              </button>
            </div>
          ) : ferramenta === 'rota' ? (
            <div className="mapa-ferramenta">
              <p className="mapa-painel__dica">
                Toque nos hexágonos na ordem da viagem. O caminho mais barato entre os pontos aparece tracejado, e a duração e as provisões ficam na aba lateral.
              </p>
              <button type="button" className="botao-topo" disabled={pontosRota.length === 0} onClick={() => setPontosRota((ps) => ps.slice(0, -1))}>
                Tirar o último ponto
              </button>
              <button type="button" className="botao-topo" disabled={pontosRota.length === 0} onClick={() => setPontosRota([])}>
                Limpar a rota
              </button>
            </div>
          ) : ferramenta === 'regua' ? (
            <div className="mapa-ferramenta">
              <p className="mapa-painel__dica">
                Toque no começo e no fim da medida. Um terceiro toque recomeça. A régua é só sua, os outros jogadores não a veem.
              </p>
              <p className="mapa-ferramenta__medida" aria-live="polite">
                {distanciaRegua !== null ? textoDaMedida(distanciaRegua) : 'Sem medida'}
              </p>
              <button type="button" className="botao-topo" disabled={!regua} onClick={limparRegua}>
                Limpar a régua
              </button>
            </div>
          ) : ferramenta === 'marcador' ? (
            marcadores.map((t) => (
              <button key={t.id} type="button" className="mapa-terreno" aria-pressed={marcadorAtivo === t.id} title={t.nome} onClick={() => setMarcadorAtivo(t.id)}>
                <img src={motor?.tileset.urlMarcador(t.id) ?? undefined} alt="" draggable={false} />
                <span>{t.nome}</span>
              </button>
            ))
          ) : motor ? (
            <PaletaTerrenos
              def={motor.tileset.def}
              urlDe={(id) => motor.tileset.urlArquivo(id)}
              ativo={terreno}
              aoEscolher={(id) => {
                setTerreno(id)
                if (ferramenta !== 'pintar') escolherFerramenta('pintar')
              }}
            />
          ) : null}
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
                {hexNoCursor?.nome && <span>· {hexNoCursor.nome}</span>}
                {regiaoNoCursor && <span>· {regiaoNoCursor.nome}</span>}
              </>
            ) : (
              <span>Passe o cursor sobre o mapa</span>
            )}
            <span className="mapa__origem">{campanhaId ? `· Mapa da campanha${nomeDaCampanha ? ` ${nomeDaCampanha}` : ''}` : '· Mapa só neste navegador'}</span>
          </div>

          {importando && (
            <div className="mapa__importar" role="dialog" aria-label="Importar mapa">
              <h2>Importar mapa</h2>
              <p>
                <b>{importando.nome}</b>: {importando.resumo.hexagonos} hexágonos e {importando.resumo.regioes} regiões
                {importando.arquivo.meta.nome ? ` do mapa "${importando.arquivo.meta.nome}"` : ''}.
              </p>
              {importando.resumo.descartados > 0 && (
                <p className="mapa__importar-alerta">
                  {importando.resumo.descartados} item(ns) do arquivo estavam quebrados e vão ficar de fora.
                </p>
              )}
              {importando.desconhecidos.length > 0 && (
                <p className="mapa__importar-alerta">
                  Terrenos que a arte atual não tem (aparecem em cinza):{' '}
                  {importando.desconhecidos.map(([id, n]) => `${id} (${n})`).join(', ')}.
                </p>
              )}
              <p className="mapa__importar-dica">
                Mesclar põe o arquivo por cima do mapa e mantém o resto. Substituir deixa o mapa igual ao arquivo e apaga o que não estiver nele. Os dois podem ser desfeitos com Ctrl+Z.
              </p>
              <div className="mapa__importar-botoes">
                <button type="button" className="botao-topo principal" disabled={ocupado} onClick={() => void confirmarImportacao('mesclar')}>
                  Mesclar com o mapa
                </button>
                <button type="button" className="botao-topo" disabled={ocupado} onClick={() => void confirmarImportacao('substituir')}>
                  Substituir o mapa
                </button>
                <button type="button" className="botao-topo" disabled={ocupado} onClick={() => setImportando(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {pedirRecarga && (
            <div className="mapa__aviso mapa__aviso--acao" role="alert">
              <span>O mapa da campanha mudou muito enquanto você estava fora. O que você fez e não foi enviado se perde se recarregar.</span>
              <button type="button" className="botao-topo" onClick={() => setGeracao((g) => g + 1)}>
                Recarregar
              </button>
            </div>
          )}
          {aviso && !pedirRecarga && (
            <div className="mapa__aviso" role="status">
              {aviso}
            </div>
          )}
        </div>

        {motor && selecionado && !regiaoEditando && (
          <InspetorHexagono key={`${selecionado.q},${selecionado.r}`} ctrl={motor.ctrl} tileset={motor.tileset} hex={selecionado} aoFechar={limparSelecao} />
        )}
        {motor && regiaoEditando && <EditorDeRegiao key={regiaoEditando} ctrl={motor.ctrl} id={regiaoEditando} aoFechar={() => setRegiaoEditando(null)} />}

        <PainelViagem
          aberto={painelAberto}
          aoAlternar={() => setPainelAberto((v) => !v)}
          config={configViagem}
          aoMudarConfig={setConfigViagem}
          rota={resultadoRota}
          pontosMarcados={pontosRota.length}
          rotaAtiva={ferramenta === 'rota'}
          aoMarcarRota={() => escolherFerramenta('rota')}
          aoDesfazerPonto={() => setPontosRota((ps) => ps.slice(0, -1))}
          aoLimparRota={() => setPontosRota([])}
          comecarNoToken={comecarNoToken}
          aoMudarComecarNoToken={setComecarNoToken}
          temToken={!!token}
        />
      </div>
    </div>
  )
}
