// Aba Quadro: o quadro de cortiça da campanha. Arrastar a cortiça move a vista, a roda do mouse e a
// pinça dão zoom, e arrastar um item muda ele de lugar. A lógica fica em estado.ts e operacoes.ts:
// aqui só ficam os gestos e o desenho.

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { abrirRepositorioQuadro, useServidor } from '../servidor/conexao'
import type { EstadoServidor } from '../servidor/tipos'
import { Biblioteca } from './Biblioteca'
import { QuadroEstado, type EstadoQuadro } from './estado'
import { IconeFechar, IconeImagens, IconeMais, IconeMenos, IconeNota, IconeVerTudo, Tachinha } from './icones'
import { Janela } from './Janela'
import {
  alturaDoItem,
  centroDaVista,
  estaNoTopo,
  limitarLargura,
  limitarPosicao,
  podeEditarNota,
  podeTirar,
  proximoZ,
  vistaDoQuadroTodo,
  vistaDosItens,
  zoomEm,
  type Vista,
} from './operacoes'
import { prepararImagem } from './preparar-imagem'
import { CORES_NOTA, LIMITES_QUADRO, type CorNota, type ItemQuadro } from './tipos'

const NOME_COR: Record<CorNota, string> = { amarelo: 'Amarelo', rosa: 'Rosa', azul: 'Azul', verde: 'Verde', branco: 'Branco' }

export function TelaQuadro() {
  const servidor = useServidor()
  const campanha = servidor.fase === 'conectado' ? servidor.campanhas.find((c) => c.id === servidor.campanhaAtualId) : undefined
  if (!campanha) return <SemCampanha servidor={servidor} />
  // Cada sessão (servidor, conta, campanha e papel) tem o próprio quadro: trocar qualquer um deles monta
  // um quadro novo, e o antigo fecha e para de ouvir o servidor.
  const chave = `${servidor.endereco}|${servidor.usuario?.id ?? ''}|${campanha.id}|${campanha.papel}`
  return <Quadro key={chave} servidor={servidor} nomeCampanha={campanha.nome} />
}

function SemCampanha({ servidor }: { servidor: EstadoServidor }) {
  let texto = 'O quadro é de cada campanha. Entre no servidor e escolha uma campanha na aba Campanha.'
  if (servidor.fase === 'iniciando' || servidor.fase === 'entrando') texto = 'Entrando no servidor.'
  else if (servidor.fase === 'conectado') texto = 'Escolha uma campanha na aba Campanha para ver o quadro dela.'
  return (
    <div className="quadro quadro--vazio">
      <div className="quadro__folha">
        <h1 className="quadro__titulo">Quadro</h1>
        <p className="quadro__dica">{texto}</p>
      </div>
    </div>
  )
}

type Ponto = { x: number; y: number }

type Gesto =
  | { tipo: 'nada' }
  | { tipo: 'vista'; inicio: Ponto; vista: Vista; moveu: boolean }
  | { tipo: 'pinca'; distancia: number; meio: Ponto; vista: Vista }
  | { tipo: 'item'; itemId: string; inicio: Ponto; original: Ponto; moveu: boolean }
  | { tipo: 'tamanho'; itemId: string; inicio: Ponto; largura: number }

/** Posição de um item enquanto é arrastado, antes de ir para o servidor. */
type Arrasto = { id: string; x: number; y: number; largura: number }

type Aberto = { tipo: 'imagem'; imagemId: string } | { tipo: 'nota'; itemId: string }
type Edicao = { id: string | null; texto: string; cor: CorNota }

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)
const meio = (a: Ponto, b: Ponto) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
// Menos que isso é um toque, não um arraste.
const TOLERANCIA = 4

function Quadro({ servidor, nomeCampanha }: { servidor: EstadoServidor; nomeCampanha: string }) {
  const [quadro] = useState(
    () =>
      new QuadroEstado(
        () => {
          const repositorio = abrirRepositorioQuadro()
          if (!repositorio) throw new Error('nenhuma campanha aberta. Escolha uma na aba Campanha.')
          return repositorio
        },
        { preparar: prepararImagem },
      ),
  )
  useEffect(() => {
    void quadro.abrir()
    return () => {
      void quadro.fechar()
    }
  }, [quadro])
  const estado = useSyncExternalStore(quadro.assinar, () => quadro.estado)
  const eu = servidor.usuario?.id ?? null
  const nomeDe = (autorId: string) => (autorId && autorId === eu ? 'você' : (servidor.usuarios.find((u) => u.id === autorId)?.nome ?? 'alguém'))

  const areaRef = useRef<HTMLDivElement>(null)
  const [vista, setVista] = useState<Vista | null>(null)
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 })
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [painel, setPainel] = useState(false)
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [tirando, setTirando] = useState<string | null>(null)
  const gesto = useRef<Gesto>({ tipo: 'nada' })
  const ponteiros = useRef(new Map<number, Ponto>())
  const relogioTeclado = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A vista começa nos itens, uma vez só, quando a área ganha tamanho e o quadro termina de carregar.
  // Depois, só a pessoa mexe nela: um item novo de outra pessoa não faz a vista pular.
  if (vista === null && tamanho.largura > 0 && tamanho.altura > 0 && !estado.carregando) {
    setVista(vistaDosItens(estado.itens, estado.imagens, tamanho.largura, tamanho.altura))
  }

  // O tamanho da área, para a vista inicial, o zoom pelos botões e o meio da tela.
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const observador = new ResizeObserver(([entrada]) => {
      if (!entrada) return
      const { width, height } = entrada.contentRect
      setTamanho({ largura: width, altura: height })
    })
    observador.observe(area)
    return () => observador.disconnect()
  }, [])

  // Roda do mouse dá zoom no ponto do cursor. Precisa ser um ouvinte não passivo para o navegador
  // não dar zoom na página inteira com a pinça do touchpad.
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const rodar = (e: WheelEvent) => {
      e.preventDefault()
      const caixa = area.getBoundingClientRect()
      const ponto = { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
      setVista((v) => (v ? zoomEm(v, v.zoom * Math.exp(-e.deltaY * 0.0015), ponto) : v))
    }
    area.addEventListener('wheel', rodar, { passive: false })
    return () => area.removeEventListener('wheel', rodar)
  }, [])

  useEffect(
    () => () => {
      if (relogioTeclado.current) clearTimeout(relogioTeclado.current)
    },
    [],
  )

  const centro = () => (vista ? centroDaVista(vista, tamanho.largura, tamanho.altura) : { x: 1600, y: 1000 })
  const zoomBotao = (fator: number) => {
    if (vista) setVista(zoomEm(vista, vista.zoom * fator, { x: tamanho.largura / 2, y: tamanho.altura / 2 }))
  }
  const itemPorId = (id: string | null) => (id ? estado.itens.find((i) => i.id === id) : undefined)

  // ---------- gestos ----------

  const local = (e: PointerEvent<HTMLDivElement>): Ponto => {
    const caixa = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
  }

  const comecarPinca = () => {
    const [a, b] = [...ponteiros.current.values()]
    if (!a || !b || !vista) return
    setArrasto(null)
    gesto.current = { tipo: 'pinca', distancia: Math.max(1, distancia(a, b)), meio: meio(a, b), vista }
  }

  const pressionar = (e: PointerEvent<HTMLDivElement>) => {
    if (!vista || (e.pointerType === 'mouse' && e.button !== 0)) return
    const ponto = local(e)
    ponteiros.current.set(e.pointerId, ponto)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (ponteiros.current.size === 2) return comecarPinca()
    if (ponteiros.current.size > 2) return
    const alvo = e.target instanceof Element ? e.target : null
    const elementoItem = alvo?.closest<HTMLElement>('[data-item]')
    const item = itemPorId(elementoItem?.dataset.item ?? null)
    if (item) {
      setSelecionado(item.id)
      setTirando(null)
      gesto.current = alvo?.closest('[data-alca]')
        ? { tipo: 'tamanho', itemId: item.id, inicio: ponto, largura: item.largura }
        : { tipo: 'item', itemId: item.id, inicio: ponto, original: { x: item.x, y: item.y }, moveu: false }
      return
    }
    gesto.current = { tipo: 'vista', inicio: ponto, vista, moveu: false }
  }

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (!ponteiros.current.has(e.pointerId)) return
    const ponto = local(e)
    ponteiros.current.set(e.pointerId, ponto)
    const g = gesto.current
    if (g.tipo === 'pinca') {
      const [a, b] = [...ponteiros.current.values()]
      if (!a || !b) return
      const agora = meio(a, b)
      const comZoom = zoomEm(g.vista, (g.vista.zoom * distancia(a, b)) / g.distancia, g.meio)
      setVista({ ...comZoom, x: comZoom.x + agora.x - g.meio.x, y: comZoom.y + agora.y - g.meio.y })
    } else if (g.tipo === 'vista') {
      if (distancia(ponto, g.inicio) > TOLERANCIA) g.moveu = true
      setVista({ ...g.vista, x: g.vista.x + ponto.x - g.inicio.x, y: g.vista.y + ponto.y - g.inicio.y })
    } else if (g.tipo === 'item' && vista) {
      if (!g.moveu && distancia(ponto, g.inicio) <= TOLERANCIA) return
      g.moveu = true
      const item = itemPorId(g.itemId)
      if (!item) return
      const novo = limitarPosicao({ x: g.original.x + (ponto.x - g.inicio.x) / vista.zoom, y: g.original.y + (ponto.y - g.inicio.y) / vista.zoom })
      setArrasto({ id: item.id, ...novo, largura: item.largura })
    } else if (g.tipo === 'tamanho' && vista) {
      const item = itemPorId(g.itemId)
      if (!item) return
      // O centro fica parado: puxar o canto para fora cresce dos dois lados.
      setArrasto({ id: item.id, x: item.x, y: item.y, largura: limitarLargura(g.largura + (2 * (ponto.x - g.inicio.x)) / vista.zoom) })
    }
  }

  const soltar = (e: PointerEvent<HTMLDivElement>, cancelou: boolean) => {
    if (!ponteiros.current.delete(e.pointerId)) return
    const g = gesto.current
    if (g.tipo === 'pinca') {
      // Sobrou um dedo: ele continua arrastando a vista dali.
      const [resto] = [...ponteiros.current.values()]
      gesto.current = resto && vista ? { tipo: 'vista', inicio: resto, vista, moveu: true } : { tipo: 'nada' }
      return
    }
    gesto.current = { tipo: 'nada' }
    const item = g.tipo === 'item' || g.tipo === 'tamanho' ? itemPorId(g.itemId) : undefined
    if (g.tipo === 'vista' && !g.moveu && !cancelou) setSelecionado(null)
    const valeMover = g.tipo === 'tamanho' || (g.tipo === 'item' && g.moveu)
    if (item && arrasto?.id === item.id && !cancelou && valeMover) {
      const z = estaNoTopo(item, estado.itens) ? {} : { z: proximoZ(estado.itens) }
      const mudanca = g.tipo === 'tamanho' ? { largura: arrasto.largura } : { x: arrasto.x, y: arrasto.y, ...z }
      void quadro.mover(item.id, mudanca)
    }
    setArrasto(null)
  }

  // ---------- teclado ----------

  const pedirTirar = (item: ItemQuadro) => {
    if (!podeTirar(item, eu, estado.ehMestre)) return
    // A imagem continua na biblioteca. A nota, não: o texto se perderia.
    if (item.tipo === 'nota') setTirando(item.id)
    else {
      setSelecionado(null)
      void quadro.tirar(item.id)
    }
  }

  const abrirItem = (item: ItemQuadro) => setAberto(item.tipo === 'imagem' ? { tipo: 'imagem', imagemId: item.imagemId } : { tipo: 'nota', itemId: item.id })

  const teclar = (e: KeyboardEvent<HTMLDivElement>, item: ItemQuadro) => {
    const passo = e.shiftKey ? 100 : 20
    const direcoes: Record<string, Ponto> = { ArrowLeft: { x: -passo, y: 0 }, ArrowRight: { x: passo, y: 0 }, ArrowUp: { x: 0, y: -passo }, ArrowDown: { x: 0, y: passo } }
    const direcao = direcoes[e.key]
    if (direcao) {
      e.preventDefault()
      setSelecionado(item.id)
      const base = arrasto?.id === item.id ? arrasto : item
      const novo = limitarPosicao({ x: base.x + direcao.x, y: base.y + direcao.y })
      setArrasto({ id: item.id, ...novo, largura: item.largura })
      // Manda ao servidor quando a pessoa para de apertar, e não a cada tecla.
      if (relogioTeclado.current) clearTimeout(relogioTeclado.current)
      relogioTeclado.current = setTimeout(() => {
        void quadro.mover(item.id, novo)
        setArrasto(null)
      }, 400)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSelecionado(item.id)
      abrirItem(item)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      setSelecionado(item.id)
      pedirTirar(item)
    } else if (e.key === 'Escape') {
      setSelecionado(null)
    }
  }

  const escolhido = itemPorId(selecionado)
  const vazio = !estado.carregando && estado.itens.length === 0

  return (
    <div className="quadro">
      <header className="quadro__barra">
        <div className="quadro__nome">
          <h1 className="quadro__titulo">Quadro</h1>
          <span className="quadro__campanha">{nomeCampanha}</span>
        </div>
        <div className="grupo-botoes quadro__grupo">
          <button type="button" className="botao-topo" onClick={() => setEdicao({ id: null, texto: '', cor: 'amarelo' })}>
            <IconeNota />
            Nova nota
          </button>
          <button type="button" className="botao-topo" aria-pressed={painel} onClick={() => setPainel(!painel)}>
            <IconeImagens />
            Imagens
          </button>
        </div>
        <span className="espaco" />
        <div className="grupo-botoes quadro__grupo">
          <button type="button" className="botao-icone" aria-label="Afastar" title="Afastar" onClick={() => zoomBotao(1 / 1.3)}>
            <IconeMenos />
          </button>
          <button type="button" className="botao-icone" aria-label="Aproximar" title="Aproximar" onClick={() => zoomBotao(1.3)}>
            <IconeMais />
          </button>
          <button
            type="button"
            className="botao-topo"
            aria-label="Ver o quadro todo"
            title="Ver o quadro todo"
            onClick={() => setVista(vistaDoQuadroTodo(tamanho.largura, tamanho.altura))}
          >
            <IconeVerTudo />
            <span className="quadro__rotulo">Ver o quadro todo</span>
          </button>
        </div>
      </header>

      <div className={`quadro__corpo${painel ? ' quadro__corpo--com-painel' : ''}`}>
        <div className="quadro__palco">
          <div
            ref={areaRef}
            className="quadro__area"
            onPointerDown={pressionar}
            onPointerMove={mover}
            onPointerUp={(e) => soltar(e, false)}
            onPointerCancel={(e) => soltar(e, true)}
          >
            {vista && (
              <div
                className="quadro__cortica"
                // --zoom deixa contornos e alças com o mesmo tamanho na tela, com qualquer zoom.
                style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`, '--zoom': vista.zoom } as CSSProperties}
              >
                {estado.itens.map((original) => {
                  const item = arrasto?.id === original.id ? { ...original, x: arrasto.x, y: arrasto.y, largura: arrasto.largura } : original
                  return (
                    <Item
                      key={item.id}
                      item={item}
                      estado={estado}
                      zoom={vista.zoom}
                      selecionado={item.id === selecionado}
                      arrastando={arrasto?.id === item.id}
                      autor={nomeDe(item.autorId)}
                      aoPedirInteira={quadro.pedirInteira}
                      aoTeclar={(e) => teclar(e, original)}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {estado.carregando && <p className="quadro__recado">Abrindo o quadro.</p>}
          {vazio && <p className="quadro__recado">O quadro está vazio. Envie uma imagem em "Imagens" ou prenda uma nota.</p>}

          <div className="quadro__avisos">
            {servidor.semResposta && <p className="quadro__aviso">A conexão com o servidor caiu. As mudanças dos outros aparecem quando ela voltar.</p>}
            {estado.erro && (
              <p className="quadro__aviso quadro__aviso--erro" role="alert">
                <span>{estado.erro}</span>
                <button type="button" className="botao-icone" aria-label="Fechar o aviso" onClick={() => quadro.limparErro()}>
                  <IconeFechar />
                </button>
              </p>
            )}
          </div>

          {escolhido && (
            <div className="quadro__acoes" role="toolbar" aria-label="Item escolhido">
              {tirando === escolhido.id ? (
                <>
                  <span className="quadro__acoes-texto">Tirar esta nota do quadro? O texto se perde.</span>
                  <button
                    type="button"
                    className="botao-topo quadro__botao-perigo"
                    onClick={() => {
                      setTirando(null)
                      setSelecionado(null)
                      void quadro.tirar(escolhido.id)
                    }}
                  >
                    Tirar nota
                  </button>
                  <button type="button" className="botao-topo" onClick={() => setTirando(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="quadro__acoes-texto">{descrever(escolhido, estado, nomeDe(escolhido.autorId))}</span>
                  <button type="button" className="botao-topo" onClick={() => abrirItem(escolhido)}>
                    Abrir
                  </button>
                  {podeEditarNota(escolhido, eu) && escolhido.tipo === 'nota' && (
                    <button type="button" className="botao-topo" onClick={() => setEdicao({ id: escolhido.id, texto: escolhido.texto, cor: escolhido.cor })}>
                      Editar nota
                    </button>
                  )}
                  {podeTirar(escolhido, eu, estado.ehMestre) && (
                    <button type="button" className="botao-topo" onClick={() => pedirTirar(escolhido)}>
                      Tirar do quadro
                    </button>
                  )}
                  <button type="button" className="botao-icone" aria-label="Deixar de escolher o item" onClick={() => setSelecionado(null)}>
                    <IconeFechar />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {painel && (
          <Biblioteca
            quadro={quadro}
            estado={estado}
            eu={eu}
            centro={centro}
            aoAbrir={(imagemId) => setAberto({ tipo: 'imagem', imagemId })}
            aoFechar={() => setPainel(false)}
          />
        )}
      </div>

      {aberto && <Visor aberto={aberto} estado={estado} nomeDe={nomeDe} aoPedirInteira={quadro.pedirInteira} aoFechar={() => setAberto(null)} />}
      {edicao && (
        <EditorNota
          edicao={edicao}
          aoFechar={() => setEdicao(null)}
          aoSalvar={(texto, cor) => {
            if (edicao.id) void quadro.editarNota(edicao.id, { texto, cor })
            else void quadro.criarNota(texto, cor, centro())
            setEdicao(null)
          }}
        />
      )}
    </div>
  )
}

const tituloDaNota = (autor: string) => (autor === 'você' ? 'Sua nota' : `Nota de ${autor}`)

function descrever(item: ItemQuadro, estado: EstadoQuadro, autor: string): string {
  if (item.tipo === 'nota') return tituloDaNota(autor)
  const imagem = estado.imagens.find((i) => i.id === item.imagemId)
  return `${imagem?.nome || 'Imagem sem nome'}, presa por ${autor}`
}

interface PropsItem {
  item: ItemQuadro
  estado: EstadoQuadro
  zoom: number
  selecionado: boolean
  arrastando: boolean
  autor: string
  aoPedirInteira: (imagemId: string) => void
  aoTeclar: (e: KeyboardEvent<HTMLDivElement>) => void
}

function Item({ item, estado, zoom, selecionado, arrastando, autor, aoPedirInteira, aoTeclar }: PropsItem) {
  const altura = alturaDoItem(item, estado.imagens)
  const imagem = item.tipo === 'imagem' ? estado.imagens.find((i) => i.id === item.imagemId) : undefined
  // Com muito zoom num item grande, a miniatura de 320 px fica borrada: troca pela imagem inteira.
  const precisaInteira = Boolean(imagem) && item.largura * zoom * (window.devicePixelRatio || 1) > 360
  useEffect(() => {
    if (precisaInteira && imagem) aoPedirInteira(imagem.id)
  }, [precisaInteira, imagem, aoPedirInteira])
  const url = imagem ? ((precisaInteira ? estado.inteiras[imagem.id] : undefined) ?? estado.miniaturas[imagem.id]) : undefined

  const rotulo = item.tipo === 'nota' ? `${tituloDaNota(autor)}: ${item.texto.slice(0, 80) || 'vazia'}` : `Imagem ${imagem?.nome || 'sem nome'}, presa por ${autor}`
  const classes = ['quadro__item', `quadro__item--${item.tipo}`, item.tipo === 'nota' ? `quadro__item--${item.cor}` : '', selecionado ? 'quadro__item--escolhido' : '', arrastando ? 'quadro__item--arrastando' : '']

  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      data-item={item.id}
      role="button"
      tabIndex={0}
      aria-label={rotulo}
      aria-pressed={selecionado}
      onKeyDown={aoTeclar}
      style={{ left: item.x - item.largura / 2, top: item.y - altura / 2, width: item.largura, height: altura, transform: `rotate(${item.rotacao}deg)` }}
    >
      {item.tipo === 'imagem' ? (
        url ? (
          <img src={url} alt="" draggable={false} />
        ) : (
          <span className="quadro__sem-imagem">{imagem?.nome || 'Imagem'}</span>
        )
      ) : (
        <p className="quadro__texto">{item.texto}</p>
      )}
      <Tachinha />
      {selecionado && item.tipo === 'imagem' && <span className="quadro__alca" data-alca aria-hidden="true" />}
    </div>
  )
}

function Visor({
  aberto,
  estado,
  nomeDe,
  aoPedirInteira,
  aoFechar,
}: {
  aberto: Aberto
  estado: EstadoQuadro
  nomeDe: (autorId: string) => string
  aoPedirInteira: (imagemId: string) => void
  aoFechar: () => void
}) {
  const imagemId = aberto.tipo === 'imagem' ? aberto.imagemId : null
  useEffect(() => {
    if (imagemId) aoPedirInteira(imagemId)
  }, [imagemId, aoPedirInteira])

  if (aberto.tipo === 'nota') {
    const nota = estado.itens.find((i) => i.id === aberto.itemId)
    if (!nota || nota.tipo !== 'nota') return null
    return (
      <Janela titulo={tituloDaNota(nomeDe(nota.autorId))} aoFechar={aoFechar}>
        <p className={`quadro__nota-grande quadro__item--${nota.cor}`}>{nota.texto || 'Nota vazia.'}</p>
      </Janela>
    )
  }

  const imagem = estado.imagens.find((i) => i.id === aberto.imagemId)
  if (!imagem) return null
  const url = estado.inteiras[imagem.id] ?? estado.miniaturas[imagem.id]
  return (
    <Janela titulo={imagem.nome || 'Imagem sem nome'} aoFechar={aoFechar} larga>
      <div className="quadro__visor">
        {url ? <img src={url} alt={imagem.nome || 'Imagem sem nome'} /> : <p className="quadro__dica">Baixando a imagem.</p>}
      </div>
      <p className="quadro__dica">Enviada por {nomeDe(imagem.autorId)}.</p>
    </Janela>
  )
}

function EditorNota({ edicao, aoSalvar, aoFechar }: { edicao: Edicao; aoSalvar: (texto: string, cor: CorNota) => void; aoFechar: () => void }) {
  const [texto, setTexto] = useState(edicao.texto)
  const [cor, setCor] = useState<CorNota>(edicao.cor)
  const nova = edicao.id === null

  return (
    <Janela titulo={nova ? 'Nova nota' : 'Editar nota'} aoFechar={aoFechar}>
      <form
        className="quadro__editor"
        onSubmit={(e) => {
          e.preventDefault()
          aoSalvar(texto, cor)
        }}
      >
        <label className="quadro__campo">
          <span>Texto da nota</span>
          <textarea className={`quadro__item--${cor}`} value={texto} maxLength={LIMITES_QUADRO.textoNota} rows={6} autoFocus onChange={(e) => setTexto(e.target.value)} />
        </label>
        <p className="quadro__dica">
          {texto.length} de {LIMITES_QUADRO.textoNota} caracteres
        </p>
        <fieldset className="quadro__cores">
          <legend>Cor do papel</legend>
          {CORES_NOTA.map((c) => (
            <label key={c} className={`quadro__cor quadro__item--${c}`} title={NOME_COR[c]}>
              <input type="radio" name="cor" value={c} checked={cor === c} onChange={() => setCor(c)} />
              <span className="quadro__oculto">{NOME_COR[c]}</span>
            </label>
          ))}
        </fieldset>
        <div className="quadro__linha">
          <button type="submit" className="botao-topo botao-topo--principal" disabled={!texto.trim()}>
            {nova ? 'Prender nota' : 'Salvar nota'}
          </button>
          <button type="button" className="botao-topo" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Janela>
  )
}
