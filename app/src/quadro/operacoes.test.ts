import { describe, expect, it } from 'vitest'
import {
  alturaDoItem,
  aplicarEvento,
  centroDaVista,
  dimensoesReduzidas,
  espacoUsado,
  estaNoTopo,
  formatarMB,
  itemDeImagem,
  itemDeNota,
  limitarLargura,
  limitarPosicao,
  nomeDoArquivo,
  paraQuadro,
  podeEditarNota,
  podeGerirImagem,
  podeTirar,
  proximoZ,
  rotacaoAleatoria,
  vistaDoQuadroTodo,
  vistaDosItens,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  zoomEm,
  type DadosQuadro,
} from './operacoes'
import type { ImagemQuadro, ItemImagem, ItemNota } from './tipos'

const imagem = (id: string, extra: Partial<ImagemQuadro> = {}): ImagemQuadro => ({
  id,
  autorId: 'ana',
  nome: id,
  arquivo: `${id}.webp`,
  largura: 800,
  altura: 600,
  bytes: 1000,
  enviada: 100,
  ...extra,
})
const pino = (id: string, imagemId: string, z = 1, extra: Partial<ItemImagem> = {}): ItemImagem => ({
  id,
  autorId: 'ana',
  tipo: 'imagem',
  imagemId,
  x: 100,
  y: 100,
  largura: 200,
  rotacao: 0,
  z,
  ...extra,
})
const nota = (id: string, z = 1, extra: Partial<ItemNota> = {}): ItemNota => ({
  id,
  autorId: 'bia',
  tipo: 'nota',
  texto: 'Pista',
  cor: 'amarelo',
  x: 300,
  y: 300,
  largura: 200,
  rotacao: 0,
  z,
  ...extra,
})

describe('aplicar o que chega do servidor', () => {
  const dados: DadosQuadro = { imagens: [imagem('a')], itens: [pino('p1', 'a', 2), nota('n1', 1)] }

  it('imagem nova entra, a mais nova primeiro, e a repetida troca', () => {
    const comNova = aplicarEvento(dados, { tipo: 'imagem', imagem: imagem('b', { enviada: 200 }) })
    expect(comNova.imagens.map((i) => i.id)).toEqual(['b', 'a'])
    const renomeada = aplicarEvento(comNova, { tipo: 'imagem', imagem: imagem('a', { nome: 'Carta' }) })
    expect(renomeada.imagens.find((i) => i.id === 'a')?.nome).toBe('Carta')
    expect(renomeada.imagens).toHaveLength(2)
    expect(dados.imagens).toHaveLength(1)
  })

  it('imagem apagada sai do quadro junto', () => {
    const sem = aplicarEvento(dados, { tipo: 'imagemApagada', id: 'a' })
    expect(sem.imagens).toEqual([])
    expect(sem.itens.map((i) => i.id)).toEqual(['n1'])
  })

  it('itens ficam na ordem das camadas, e o repetido troca', () => {
    expect(dados.itens.map((i) => i.id)).toEqual(['p1', 'n1'])
    const movido = aplicarEvento(dados, { tipo: 'item', item: nota('n1', 5, { x: 900 }) })
    expect(movido.itens.map((i) => i.id)).toEqual(['p1', 'n1'])
    expect(movido.itens[1]?.x).toBe(900)
    const ordenado = aplicarEvento({ imagens: [], itens: [] }, { tipo: 'tudo', imagens: [], itens: [nota('n2', 9), pino('p2', 'a', 3)] })
    expect(ordenado.itens.map((i) => i.id)).toEqual(['p2', 'n2'])
  })

  it('item apagado sai', () => {
    expect(aplicarEvento(dados, { tipo: 'itemApagado', id: 'p1' }).itens.map((i) => i.id)).toEqual(['n1'])
  })
})

describe('quem pode o quê', () => {
  it('a nota só quem escreveu edita, nem o mestre', () => {
    expect(podeEditarNota(nota('n', 1, { autorId: 'bia' }), 'bia')).toBe(true)
    expect(podeEditarNota(nota('n', 1, { autorId: 'bia' }), 'ana')).toBe(false)
    expect(podeEditarNota(pino('p', 'a', 1, { autorId: 'bia' }), 'bia')).toBe(false)
    expect(podeEditarNota(nota('n', 1, { autorId: '' }), null)).toBe(false)
  })

  it('tirar do quadro: quem prendeu ou o mestre', () => {
    expect(podeTirar(nota('n'), 'bia', false)).toBe(true)
    expect(podeTirar(nota('n'), 'ana', false)).toBe(false)
    expect(podeTirar(nota('n'), 'ana', true)).toBe(true)
    expect(podeTirar(nota('n', 1, { autorId: '' }), '', false)).toBe(false)
  })

  it('renomear e apagar imagem: quem enviou ou o mestre', () => {
    expect(podeGerirImagem(imagem('a'), 'ana', false)).toBe(true)
    expect(podeGerirImagem(imagem('a'), 'bia', false)).toBe(false)
    expect(podeGerirImagem(imagem('a'), 'bia', true)).toBe(true)
  })
})

describe('itens novos', () => {
  const metade = () => 0.5

  it('entram por cima de todos, levemente tortos', () => {
    const itens = [pino('p1', 'a', 3), nota('n1', 7)]
    expect(proximoZ(itens)).toBe(8)
    expect(proximoZ([])).toBe(1)
    expect(estaNoTopo(nota('n1', 7), itens)).toBe(true)
    expect(estaNoTopo(pino('p1', 'a', 3), itens)).toBe(false)
    expect(rotacaoAleatoria(() => 0)).toBe(-4)
    expect(rotacaoAleatoria(() => 1)).toBe(4)
    expect(rotacaoAleatoria(metade)).toBe(0)
  })

  it('imagem deitada entra maior que a em pé', () => {
    const deitada = itemDeImagem(imagem('a'), { x: 500, y: 400 }, [], metade)
    const emPe = itemDeImagem(imagem('b', { largura: 600, altura: 900 }), { x: 500, y: 400 }, [], metade)
    expect(deitada).toEqual({ tipo: 'imagem', imagemId: 'a', x: 500, y: 400, largura: 280, rotacao: 0, z: 1 })
    expect(emPe.largura).toBe(200)
  })

  it('nota nova com o texto limpo, dentro do quadro', () => {
    const nova = itemDeNota('  Pista  ', 'rosa', { x: -50, y: 9999 }, [], metade)
    expect(nova).toEqual({ tipo: 'nota', texto: 'Pista', cor: 'rosa', x: 0, y: 2000, largura: 200, rotacao: 0, z: 1 })
    expect(itemDeNota('a'.repeat(600), 'azul', { x: 1, y: 1 }, [], metade)).toMatchObject({ texto: 'a'.repeat(500) })
  })

  it('posição e largura ficam nos limites do contrato', () => {
    expect(limitarPosicao({ x: 3300.4, y: -2 })).toEqual({ x: 3200, y: 0 })
    expect(limitarLargura(10)).toBe(60)
    expect(limitarLargura(5000)).toBe(1600)
  })

  it('a altura da imagem segue a proporção, e a nota é quadrada', () => {
    const imagens = [imagem('a')]
    expect(alturaDoItem(pino('p', 'a', 1, { largura: 400 }), imagens)).toBe(300)
    expect(alturaDoItem(nota('n', 1, { largura: 180 }), imagens)).toBe(180)
    expect(alturaDoItem(pino('p', 'sumiu'), imagens)).toBe(200)
  })
})

describe('biblioteca', () => {
  it('espaço usado em MB, com vírgula', () => {
    expect(espacoUsado([imagem('a', { bytes: 1024 * 1024 }), imagem('b', { bytes: 512 * 1024 })])).toBe(1.5 * 1024 * 1024)
    expect(formatarMB(1.5 * 1024 * 1024)).toBe('1,5 MB')
    expect(formatarMB(10)).toBe('0,1 MB')
    expect(formatarMB(0)).toBe('0 MB')
  })

  it('nome da imagem a partir do arquivo', () => {
    expect(nomeDoArquivo('Carta do duque.png')).toBe('Carta do duque')
    expect(nomeDoArquivo('IMG_2034.jpeg')).toBe('IMG 2034')
    expect(nomeDoArquivo('sem-extensao')).toBe('sem-extensao')
  })

  it('reduz para caber no lado máximo, sem aumentar a pequena', () => {
    expect(dimensoesReduzidas(4000, 3000, 1600)).toEqual({ largura: 1600, altura: 1200 })
    expect(dimensoesReduzidas(1000, 4000, 1600)).toEqual({ largura: 400, altura: 1600 })
    expect(dimensoesReduzidas(300, 200, 1600)).toEqual({ largura: 300, altura: 200 })
  })
})

describe('vista', () => {
  it('o quadro todo cabe na tela, centralizado', () => {
    const vista = vistaDoQuadroTodo(1600, 1000)
    expect(vista.zoom).toBeCloseTo(0.47)
    expect(vista.x).toBeCloseTo((1600 - 3200 * vista.zoom) / 2)
    expect(vistaDoQuadroTodo(100, 100).zoom).toBe(ZOOM_MINIMO)
  })

  it('o zoom mantém parado o ponto em que a pessoa mira', () => {
    const vista = { x: 100, y: 50, zoom: 0.5 }
    const mira = { x: 400, y: 300 }
    const antes = paraQuadro(mira, vista)
    const depois = zoomEm(vista, 1, mira)
    expect(depois.zoom).toBe(1)
    expect(paraQuadro(mira, depois).x).toBeCloseTo(antes.x)
    expect(paraQuadro(mira, depois).y).toBeCloseTo(antes.y)
    expect(zoomEm(vista, 99, mira).zoom).toBe(ZOOM_MAXIMO)
  })

  it('abre mostrando os itens, sem passar do tamanho real', () => {
    const itens = [nota('n1', 1, { x: 1000, y: 800, largura: 200 }), nota('n2', 2, { x: 1400, y: 1000, largura: 200 })]
    const vista = vistaDosItens(itens, [], 360, 600)
    // Caixa dos itens com folga: de 820 a 1580 na largura (760) e de 620 a 1180 na altura (560).
    expect(vista.zoom).toBeCloseTo(360 / 760)
    const centro = paraQuadro({ x: 180, y: 300 }, vista)
    expect(centro.x).toBeCloseTo(1200)
    expect(centro.y).toBeCloseTo(900)
    expect(vistaDosItens([nota('n1', 1, { x: 1600, y: 1000 })], [], 1600, 1000).zoom).toBe(1)
    expect(vistaDosItens([], [], 1600, 1000)).toEqual(vistaDoQuadroTodo(1600, 1000))
  })

  it('o centro da tela vira um ponto dentro do quadro', () => {
    expect(centroDaVista({ x: 0, y: 0, zoom: 1 }, 800, 600)).toEqual({ x: 400, y: 300 })
    expect(centroDaVista({ x: 5000, y: 0, zoom: 1 }, 800, 600)).toEqual({ x: 0, y: 300 })
  })
})
