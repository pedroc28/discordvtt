import { describe, expect, it } from 'vitest'
import { QuadroEstado } from './estado'
import type { ImagemPreparada } from './preparar-imagem'
import type { InfoImagem, RepositorioQuadro } from './repositorio'
import type { CorNota, EventoQuadro, ImagemQuadro, ItemQuadro, NovoItem, Posicao } from './tipos'

const esperar = (ms = 0) => new Promise((resolver) => setTimeout(resolver, ms))

/** Repositório de mentira: guarda o que recebe, responde na hora e avisa como o do servidor. */
class RepositorioFalso implements RepositorioQuadro {
  ehMestre = false
  imagens: ImagemQuadro[] = []
  itens: ItemQuadro[] = []
  ouvintes = new Set<(e: EventoQuadro) => void>()
  pedidos: string[] = []
  falhar: Error | null = null
  fechado = false
  private contador = 0

  async carregar() {
    if (this.falhar) throw this.falhar
    return { imagens: [...this.imagens], itens: [...this.itens] }
  }

  assinar(ouvinte: (e: EventoQuadro) => void) {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  avisar(evento: EventoQuadro) {
    for (const ouvinte of [...this.ouvintes]) ouvinte(evento)
  }

  async enviarImagem(arquivo: Blob, info: InfoImagem): Promise<ImagemQuadro> {
    if (this.falhar) throw this.falhar
    const imagem: ImagemQuadro = { id: `img${++this.contador}`, autorId: 'eu', nome: info.nome, arquivo: info.nomeArquivo, largura: info.largura, altura: info.altura, bytes: arquivo.size, enviada: this.contador }
    this.pedidos.push(`enviar ${info.nome}`)
    this.avisar({ tipo: 'imagem', imagem })
    return imagem
  }

  async renomearImagem(id: string, nome: string): Promise<ImagemQuadro> {
    this.pedidos.push(`renomear ${id} ${nome}`)
    throw this.falhar ?? new Error('não usado')
  }

  async apagarImagem(id: string) {
    this.pedidos.push(`apagar ${id}`)
    this.avisar({ tipo: 'imagemApagada', id })
  }

  async urlDaImagem(imagem: ImagemQuadro, tamanho: 'miniatura' | 'inteira') {
    this.pedidos.push(`baixar ${imagem.id} ${tamanho}`)
    return `blob:${imagem.id}/${tamanho}`
  }

  async criarItem(novo: NovoItem): Promise<ItemQuadro> {
    if (this.falhar) throw this.falhar
    const item = { ...novo, id: `item${++this.contador}`, autorId: 'eu' } as ItemQuadro
    this.pedidos.push(`prender ${item.tipo}`)
    this.avisar({ tipo: 'item', item })
    return item
  }

  async moverItem(id: string, posicao: Partial<Posicao>): Promise<ItemQuadro> {
    this.pedidos.push(`mover ${id}`)
    if (this.falhar) throw this.falhar
    const item = this.itens.find((i) => i.id === id)
    if (!item) throw new Error('sumiu')
    return { ...item, ...posicao } as ItemQuadro
  }

  async editarNota(id: string, mudanca: { texto?: string; cor?: CorNota }): Promise<ItemQuadro> {
    this.pedidos.push(`editar ${id} ${JSON.stringify(mudanca)}`)
    if (this.falhar) throw this.falhar
    throw new Error('não usado')
  }

  async tirarItem(id: string) {
    this.pedidos.push(`tirar ${id}`)
    if (this.falhar) throw this.falhar
    this.avisar({ tipo: 'itemApagado', id })
  }

  async fechar() {
    this.fechado = true
  }
}

const preparadaFalsa = async (arquivo: File): Promise<ImagemPreparada> => ({
  arquivo: new Blob(['x'.repeat(10)]),
  largura: 800,
  altura: 600,
  nome: arquivo.name.replace(/\..*$/, ''),
  nomeArquivo: 'img.webp',
})

const imagem = (id: string): ImagemQuadro => ({ id, autorId: 'ana', nome: id, arquivo: `${id}.webp`, largura: 800, altura: 600, bytes: 100, enviada: 1 })
const nota = (id: string, z: number): ItemQuadro => ({ id, autorId: 'ana', tipo: 'nota', texto: 'Pista', cor: 'amarelo', x: 100, y: 100, largura: 200, rotacao: 0, z })

function abrir(repositorio = new RepositorioFalso()) {
  const quadro = new QuadroEstado(() => repositorio, { preparar: preparadaFalsa, aleatorio: () => 0.5 })
  return { quadro, repositorio }
}

describe('QuadroEstado', () => {
  it('abre com a biblioteca e os itens, e baixa as miniaturas', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.ehMestre = true
    repositorio.imagens = [imagem('a'), imagem('b')]
    repositorio.itens = [nota('n2', 5), nota('n1', 1)]
    const { quadro } = abrir(repositorio)
    expect(quadro.estado.carregando).toBe(true)
    await quadro.abrir()
    await esperar()
    expect(quadro.estado).toMatchObject({ carregando: false, ehMestre: true })
    expect(quadro.estado.itens.map((i) => i.id)).toEqual(['n1', 'n2'])
    expect(quadro.estado.miniaturas).toEqual({ a: 'blob:a/miniatura', b: 'blob:b/miniatura' })
  })

  it('a miniatura de cada imagem é pedida uma vez só', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.imagens = [imagem('a')]
    const { quadro } = abrir(repositorio)
    await quadro.abrir()
    quadro.pedirMiniatura(imagem('a'))
    repositorio.avisar({ tipo: 'imagem', imagem: { ...imagem('a'), nome: 'Carta' } })
    quadro.pedirInteira('a')
    quadro.pedirInteira('a')
    await esperar()
    expect(repositorio.pedidos.filter((p) => p.startsWith('baixar'))).toEqual(['baixar a miniatura', 'baixar a inteira'])
    expect(quadro.estado.inteiras).toEqual({ a: 'blob:a/inteira' })
  })

  it('enviar prepara, envia e prende cada imagem, em escada', async () => {
    const { quadro, repositorio } = abrir()
    await quadro.abrir()
    const enviando = quadro.enviar([new File(['a'], 'Carta.png'), new File(['b'], 'Mapa.jpg')], { x: 500, y: 400 })
    expect(quadro.estado.enviando).toBe(2)
    await enviando
    expect(quadro.estado.enviando).toBe(0)
    expect(repositorio.pedidos.filter((p) => !p.startsWith('baixar'))).toEqual(['enviar Carta', 'prender imagem', 'enviar Mapa', 'prender imagem'])
    const presas = quadro.estado.itens
    expect(presas.map((i) => [i.x, i.y])).toEqual([
      [500, 400],
      [540, 440],
    ])
    expect(presas[1]?.z).toBeGreaterThan(presas[0]?.z ?? 0)
  })

  it('envio que falha diz qual arquivo e por quê', async () => {
    const { quadro, repositorio } = abrir()
    await quadro.abrir()
    repositorio.falhar = new Error('a imagem passou de 2 MB. Tente uma menor.')
    await quadro.enviar([new File(['a'], 'Enorme.png')], { x: 1, y: 1 })
    expect(quadro.estado.erro).toBe('Não consegui enviar "Enorme.png": a imagem passou de 2 MB. Tente uma menor.')
    expect(quadro.estado.enviando).toBe(0)
    quadro.limparErro()
    expect(quadro.estado.erro).toBeNull()
  })

  it('mover muda na hora, sem esperar o servidor', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.itens = [nota('n1', 1)]
    const { quadro } = abrir(repositorio)
    await quadro.abrir()
    const movendo = quadro.mover('n1', { x: 900, y: 700, z: 2 })
    expect(quadro.estado.itens[0]).toMatchObject({ x: 900, y: 700, z: 2 })
    await movendo
    expect(quadro.estado.erro).toBeNull()
  })

  it('se o servidor recusa, o item volta para onde estava e o motivo aparece', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.itens = [nota('n1', 1)]
    const { quadro } = abrir(repositorio)
    await quadro.abrir()
    repositorio.falhar = new Error('o item não está mais no quadro, ou você não participa mais da campanha.')
    await quadro.mover('n1', { x: 900 })
    expect(quadro.estado.itens[0]?.x).toBe(100)
    expect(quadro.estado.erro).toContain('Não consegui mover o item: o item não está mais no quadro')
  })

  it('nota nova entra com o texto limpo, e editar limpa também', async () => {
    const { quadro, repositorio } = abrir()
    await quadro.abrir()
    await quadro.criarNota('  O duque mente.  ', 'rosa', { x: 800, y: 500 })
    expect(quadro.estado.itens[0]).toMatchObject({ tipo: 'nota', texto: 'O duque mente.', cor: 'rosa', x: 800, y: 500 })
    repositorio.falhar = new Error('só quem escreveu a nota edita.')
    await quadro.editarNota('n1', { texto: '  novo  ' })
    expect(repositorio.pedidos.at(-1)).toBe('editar n1 {"texto":"novo"}')
    expect(quadro.estado.erro).toBe('Não consegui salvar a nota: só quem escreveu a nota edita.')
  })

  it('apagar uma imagem tira ela do quadro', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.imagens = [imagem('a')]
    repositorio.itens = [{ id: 'p1', autorId: 'ana', tipo: 'imagem', imagemId: 'a', x: 1, y: 1, largura: 200, rotacao: 0, z: 1 }]
    const { quadro } = abrir(repositorio)
    await quadro.abrir()
    await quadro.apagarImagem('a')
    expect(quadro.estado.imagens).toEqual([])
    expect(quadro.estado.itens).toEqual([])
  })

  it('o que chega pelo tempo real enquanto carrega não se perde', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.itens = [nota('n1', 1)]
    const carregar = repositorio.carregar.bind(repositorio)
    repositorio.carregar = async () => {
      const dados = await carregar()
      repositorio.avisar({ tipo: 'item', item: nota('n2', 2) })
      return dados
    }
    const { quadro } = abrir(repositorio)
    await quadro.abrir()
    expect(quadro.estado.itens.map((i) => i.id)).toEqual(['n1', 'n2'])
  })

  it('abre de novo depois de fechar, com um repositório novo', async () => {
    const criados: RepositorioFalso[] = []
    const quadro = new QuadroEstado(
      () => {
        const novo = new RepositorioFalso()
        criados.push(novo)
        return novo
      },
      { preparar: preparadaFalsa },
    )
    await quadro.abrir()
    await quadro.fechar()
    await quadro.abrir()
    expect(criados.map((r) => r.fechado)).toEqual([true, false])
    criados[0]?.avisar({ tipo: 'item', item: nota('velha', 1) })
    expect(quadro.estado.itens).toEqual([])
  })

  it('falha ao abrir diz o motivo', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.falhar = new Error('o servidor em https://x não respondeu. Confira se ele está ligado e tente de novo.')
    const { quadro } = abrir(repositorio)
    await quadro.abrir()
    expect(quadro.estado.carregando).toBe(false)
    expect(quadro.estado.erro).toContain('Não consegui abrir o quadro: o servidor em https://x não respondeu')
  })
})
