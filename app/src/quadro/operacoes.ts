// Funções puras do quadro: aplicar o que chega do servidor, permissões, itens novos, a vista
// (arrastar e zoom) e textos.

import {
  ALTURA_QUADRO,
  LARGURA_QUADRO,
  LIMITES_QUADRO,
  type CorNota,
  type EventoQuadro,
  type ImagemQuadro,
  type ItemQuadro,
  type NovoItem,
} from './tipos'

export interface DadosQuadro {
  /** Da mais nova para a mais velha. */
  imagens: ImagemQuadro[]
  /** Da mais baixa para a mais alta: a ordem de desenhar. */
  itens: ItemQuadro[]
}

const porEnvio = (a: ImagemQuadro, b: ImagemQuadro) => b.enviada - a.enviada || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
const porCamada = (a: ItemQuadro, b: ItemQuadro) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Põe a biblioteca e os itens na ordem de mostrar. */
export function ordenar(dados: DadosQuadro): DadosQuadro {
  return { imagens: [...dados.imagens].sort(porEnvio), itens: [...dados.itens].sort(porCamada) }
}

const trocarOuIncluir = <T extends { id: string }>(lista: readonly T[], novo: T) =>
  lista.some((x) => x.id === novo.id) ? lista.map((x) => (x.id === novo.id ? novo : x)) : [...lista, novo]

/** O que mudou no servidor, aplicado ao quadro. Sem alterar o que recebeu. */
export function aplicarEvento(dados: DadosQuadro, evento: EventoQuadro): DadosQuadro {
  switch (evento.tipo) {
    case 'imagem':
      return ordenar({ ...dados, imagens: trocarOuIncluir(dados.imagens, evento.imagem) })
    case 'imagemApagada':
      // O servidor tira do quadro os itens da imagem apagada. Aqui também, sem esperar os avisos.
      return {
        imagens: dados.imagens.filter((i) => i.id !== evento.id),
        itens: dados.itens.filter((i) => !(i.tipo === 'imagem' && i.imagemId === evento.id)),
      }
    case 'item':
      return ordenar({ ...dados, itens: trocarOuIncluir(dados.itens, evento.item) })
    case 'itemApagado':
      return { ...dados, itens: dados.itens.filter((i) => i.id !== evento.id) }
    case 'tudo':
      return ordenar({ imagens: evento.imagens, itens: evento.itens })
  }
}

// ---------- permissões (o servidor confere de novo) ----------

export const podeEditarNota = (item: ItemQuadro, eu: string | null) => item.tipo === 'nota' && Boolean(eu) && item.autorId === eu
export const podeTirar = (item: ItemQuadro, eu: string | null, mestre: boolean) => mestre || (Boolean(eu) && item.autorId === eu)
export const podeGerirImagem = (imagem: ImagemQuadro, eu: string | null, mestre: boolean) => mestre || (Boolean(eu) && imagem.autorId === eu)

// ---------- itens ----------

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor))

/** Camada acima de todas: quem é arrastado vai para cima. */
export function proximoZ(itens: readonly ItemQuadro[]): number {
  return itens.reduce((maior, i) => Math.max(maior, i.z), 0) + 1
}

/** O item já está por cima de todos os outros. */
export function estaNoTopo(item: ItemQuadro, itens: readonly ItemQuadro[]): boolean {
  return itens.every((i) => i.id === item.id || i.z < item.z)
}

export function limitarPosicao(ponto: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(limitar(ponto.x, 0, LARGURA_QUADRO)), y: Math.round(limitar(ponto.y, 0, ALTURA_QUADRO)) }
}

export function limitarLargura(largura: number): number {
  return Math.round(limitar(largura, LIMITES_QUADRO.larguraMinima, LIMITES_QUADRO.larguraMaxima))
}

/** Altura do item no quadro: a imagem mantém a proporção, e a nota é quadrada. */
export function alturaDoItem(item: ItemQuadro, imagens: readonly ImagemQuadro[]): number {
  if (item.tipo === 'nota') return item.largura
  const imagem = imagens.find((i) => i.id === item.imagemId)
  return imagem ? (item.largura * imagem.altura) / imagem.largura : item.largura
}

/** Um pouco torto, até 4 graus para cada lado, como quem prende com pressa. */
export function rotacaoAleatoria(aleatorio: () => number): number {
  return Math.round((aleatorio() * 2 - 1) * 40) / 10
}

/** Imagem da biblioteca presa no ponto pedido, por cima de tudo. */
export function itemDeImagem(imagem: ImagemQuadro, ponto: { x: number; y: number }, itens: readonly ItemQuadro[], aleatorio: () => number): NovoItem {
  // Imagem deitada um pouco maior que a em pé, para as duas ocuparem mais ou menos a mesma área.
  const largura = imagem.largura >= imagem.altura ? 280 : 200
  return { tipo: 'imagem', imagemId: imagem.id, ...limitarPosicao(ponto), largura, rotacao: rotacaoAleatoria(aleatorio), z: proximoZ(itens) }
}

export function itemDeNota(texto: string, cor: CorNota, ponto: { x: number; y: number }, itens: readonly ItemQuadro[], aleatorio: () => number): NovoItem {
  return { tipo: 'nota', texto: limparTextoNota(texto), cor, ...limitarPosicao(ponto), largura: 200, rotacao: rotacaoAleatoria(aleatorio), z: proximoZ(itens) }
}

export function limparTextoNota(texto: string): string {
  return texto.trim().slice(0, LIMITES_QUADRO.textoNota)
}

// ---------- biblioteca ----------

export function espacoUsado(imagens: readonly ImagemQuadro[]): number {
  return imagens.reduce((soma, i) => soma + i.bytes, 0)
}

/** "12,3 MB". Abaixo de 0,1 MB, mostra "0,1 MB" para não parecer vazio. */
export function formatarMB(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = Math.max(0.1, Math.round((bytes / (1024 * 1024)) * 10) / 10)
  return `${String(mb).replace('.', ',')} MB`
}

/** Nome de uma imagem a partir do arquivo: "IMG_2034.jpg" vira "IMG_2034". */
export function nomeDoArquivo(nomeArquivo: string): string {
  const semExtensao = nomeArquivo.replace(/\.[^./\\]{1,5}$/, '')
  return semExtensao.replace(/[_]+/g, ' ').trim().slice(0, LIMITES_QUADRO.nomeImagem)
}

/** Dimensões para caber em `ladoMaximo`, sem aumentar imagem pequena. */
export function dimensoesReduzidas(largura: number, altura: number, ladoMaximo: number): { largura: number; altura: number } {
  const escala = Math.min(1, ladoMaximo / Math.max(largura, altura))
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) }
}

// ---------- vista ----------

/** Onde o canto do quadro aparece na tela e o zoom. */
export interface Vista {
  x: number
  y: number
  zoom: number
}

export const ZOOM_MINIMO = 0.12
export const ZOOM_MAXIMO = 2.5

/** O quadro inteiro na tela, com uma folga, centralizado. */
export function vistaDoQuadroTodo(larguraTela: number, alturaTela: number): Vista {
  const zoom = limitar(Math.min(larguraTela / LARGURA_QUADRO, alturaTela / ALTURA_QUADRO) * 0.94, ZOOM_MINIMO, ZOOM_MAXIMO)
  return { zoom, x: (larguraTela - LARGURA_QUADRO * zoom) / 2, y: (alturaTela - ALTURA_QUADRO * zoom) / 2 }
}

/**
 * Os itens na tela, com folga, sem passar do tamanho real (zoom 1). É como o quadro abre: no celular,
 * o quadro todo fica pequeno demais para ver alguma coisa. Sem itens, mostra o quadro todo.
 */
export function vistaDosItens(itens: readonly ItemQuadro[], imagens: readonly ImagemQuadro[], larguraTela: number, alturaTela: number): Vista {
  if (!itens.length) return vistaDoQuadroTodo(larguraTela, alturaTela)
  const margem = 80
  let esquerda = Infinity
  let topo = Infinity
  let direita = -Infinity
  let baixo = -Infinity
  for (const item of itens) {
    const meiaAltura = alturaDoItem(item, imagens) / 2
    esquerda = Math.min(esquerda, item.x - item.largura / 2)
    direita = Math.max(direita, item.x + item.largura / 2)
    topo = Math.min(topo, item.y - meiaAltura)
    baixo = Math.max(baixo, item.y + meiaAltura)
  }
  esquerda = Math.max(0, esquerda - margem)
  topo = Math.max(0, topo - margem)
  direita = Math.min(LARGURA_QUADRO, direita + margem)
  baixo = Math.min(ALTURA_QUADRO, baixo + margem)
  const zoom = limitar(Math.min(larguraTela / (direita - esquerda), alturaTela / (baixo - topo)), ZOOM_MINIMO, 1)
  return { zoom, x: larguraTela / 2 - ((esquerda + direita) / 2) * zoom, y: alturaTela / 2 - ((topo + baixo) / 2) * zoom }
}

/** Zoom mantendo parado o ponto da tela em que a pessoa mira (cursor ou centro da pinça). */
export function zoomEm(vista: Vista, novoZoom: number, ponto: { x: number; y: number }): Vista {
  const zoom = limitar(novoZoom, ZOOM_MINIMO, ZOOM_MAXIMO)
  const fator = zoom / vista.zoom
  return { zoom, x: ponto.x - (ponto.x - vista.x) * fator, y: ponto.y - (ponto.y - vista.y) * fator }
}

/** Ponto da tela (relativo à área do quadro) em coordenadas do quadro. */
export function paraQuadro(ponto: { x: number; y: number }, vista: Vista): { x: number; y: number } {
  return { x: (ponto.x - vista.x) / vista.zoom, y: (ponto.y - vista.y) / vista.zoom }
}

/** O ponto do quadro no meio da tela, dentro do quadro: onde entra o que é criado. */
export function centroDaVista(vista: Vista, larguraTela: number, alturaTela: number): { x: number; y: number } {
  return limitarPosicao(paraQuadro({ x: larguraTela / 2, y: alturaTela / 2 }, vista))
}
