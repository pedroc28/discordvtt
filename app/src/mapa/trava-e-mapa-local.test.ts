// A trava do mapa (o mestre decide se só ele edita) e levar o mapa do navegador para a campanha.

import { describe, expect, it } from 'vitest'
import { metaPadrao } from './armazenamento'
import { montarArquivo } from './arquivo'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { prepararOferta } from './levar-mapa'
import { hexagonoNovo } from './operacoes'
import { RepositorioMemoria } from './repositorio'
import type { Hexagono, Lote, NotaPrivada, PermissaoMapa } from './tipos'

const ck = chaveChunk({ q: 0, r: 0 })
const pos = { q: 0, r: 0 }
const meta = { ...metaPadrao('principal'), tileset: 'pixel' }

/** Repositório com a trava, como o do servidor. Com `mestre`, também a camada do mestre. */
class RepositorioComTrava extends RepositorioMemoria {
  ehMestre: boolean
  permissao: PermissaoMapa = 'todos'
  enviados: Lote[] = []
  gravacoes: PermissaoMapa[] = []
  falharGravacao = false
  private ouvintesP = new Set<(p: PermissaoMapa) => void>()

  constructor(mestre: boolean) {
    super()
    this.ehMestre = mestre
  }
  async carregarPermissao() {
    return this.permissao
  }
  async gravarPermissao(p: PermissaoMapa) {
    if (this.falharGravacao) throw new Error('o servidor recusou: só o mestre trava o mapa.')
    this.gravacoes.push(p)
    this.mudar(p)
  }
  assinarPermissao(o: (p: PermissaoMapa) => void) {
    this.ouvintesP.add(o)
    return () => this.ouvintesP.delete(o)
  }
  /** O mestre travou de outro aparelho. */
  mudar(p: PermissaoMapa) {
    this.permissao = p
    for (const o of this.ouvintesP) o(p)
  }
  async carregarChunkOculto(): Promise<Hexagono[]> {
    return []
  }
  async carregarNotasPrivadas(): Promise<NotaPrivada[]> {
    return []
  }
  override async aplicar(lote: Lote): Promise<void> {
    this.enviados.push(lote)
  }
}

async function cliente(mestre: boolean, repo = new RepositorioComTrava(mestre)) {
  const c = new ControladorMapa(repo, mestre ? 'gm' : 'ana')
  await c.garantirChunk(ck)
  return { c, repo }
}

function pintar(c: ControladorMapa, terreno = 'floresta') {
  const t = c.iniciarTraco()
  t.pintar([pos], terreno)
  return t.confirmar()
}

describe('trava do mapa', () => {
  it('jogador não edita com o mapa travado, e recebe o aviso uma vez só', async () => {
    const { c, repo } = await cliente(false)
    const avisos: string[] = []
    c.aoErro = (m) => avisos.push(m)
    repo.mudar('mestre')
    expect(c.travado).toBe(true)

    expect(pintar(c)).toBeNull()
    expect(pintar(c)).toBeNull()
    expect(c.armazem.ler(0, 0)).toBeNull()
    expect(c.editarHexagono(0, 0, { nome: 'x' })).toBeNull()
    expect(repo.enviados).toHaveLength(0)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('travou o mapa')
  })

  it('o token continua livre com o mapa travado', async () => {
    const { c, repo } = await cliente(false)
    repo.mudar('mestre')
    c.moverToken({ q: 3, r: 3 })
    expect(c.token).toMatchObject({ q: 3, r: 3 })
  })

  it('desfazer e importar também ficam travados para o jogador', async () => {
    const { c, repo } = await cliente(false)
    pintar(c)
    repo.mudar('mestre')
    expect(c.desfazer()).toBe(0)
    expect(c.armazem.ler(0, 0)?.terreno).toBe('floresta')
    await expect(c.importar(montarArquivo(meta, [], [], null), 'mesclar')).rejects.toThrow('travou o mapa')
  })

  it('destravar libera de novo', async () => {
    const { c, repo } = await cliente(false)
    repo.mudar('mestre')
    repo.mudar('todos')
    expect(c.travado).toBe(false)
    expect(pintar(c)).not.toBeNull()
  })

  it('o mestre nunca é travado e consegue travar e destravar', async () => {
    const { c, repo } = await cliente(true)
    expect(c.podeTravar).toBe(true)
    c.travar(true)
    expect(c.permissao).toBe('mestre')
    expect(c.travado).toBe(false)
    expect(pintar(c)).not.toBeNull()
    await Promise.resolve()
    expect(repo.gravacoes).toEqual(['mestre'])
    c.travar(false)
    expect(c.permissao).toBe('todos')
  })

  it('jogador não tem como travar', async () => {
    const { c, repo } = await cliente(false)
    expect(c.podeTravar).toBe(false)
    c.travar(true)
    expect(c.permissao).toBe('todos')
    expect(repo.gravacoes).toEqual([])
  })

  it('se o servidor recusa travar, volta ao que era e mostra a mensagem', async () => {
    const repo = new RepositorioComTrava(true)
    repo.falharGravacao = true
    const { c } = await cliente(true, repo)
    let msg = ''
    c.aoErro = (m) => (msg = m)
    c.travar(true)
    expect(c.permissao).toBe('mestre')
    await new Promise((r) => setTimeout(r, 0))
    expect(c.permissao).toBe('todos')
    expect(msg).toContain('só o mestre trava')
  })

  it('a leitura inicial não passa por cima de um aviso que chegou enquanto carregava', async () => {
    const repo = new RepositorioComTrava(false)
    repo.carregarPermissao = async () => {
      repo.mudar('mestre')
      return 'todos'
    }
    const c = new ControladorMapa(repo, 'ana')
    await c.carregarPermissao()
    expect(c.permissao).toBe('mestre')
    c.destruir()
  })

  it('mapa do navegador (sem trava no repositório) nunca fica travado', async () => {
    const c = new ControladorMapa(new RepositorioMemoria(), 'eu')
    await c.garantirChunk(ck)
    expect(c.travado).toBe(false)
    expect(c.podeTravar).toBe(false)
    expect(pintar(c)).not.toBeNull()
  })
})

describe('importação como lote do servidor', () => {
  const arquivo = (n: number) => montarArquivo(meta, Array.from({ length: n }, (_, q) => hexagonoNovo(q, 0, 'planicie')), [], null)

  it('o lote sai marcado como importação', async () => {
    const { c, repo } = await cliente(true)
    await c.importar(arquivo(3), 'mesclar')
    expect(repo.enviados).toHaveLength(1)
    expect(repo.enviados[0].tipo).toBe('importacao')
    expect(repo.enviados[0].mudancas).toHaveLength(3)
  })

  it('edição comum continua sem tipo', async () => {
    const { c, repo } = await cliente(true)
    pintar(c)
    expect(repo.enviados[0].tipo).toBeUndefined()
  })

  it('acima do limite do servidor, pede para dividir e não muda nada', async () => {
    const repo = new RepositorioComTrava(true)
    const c = new ControladorMapa(repo, 'gm', { limiteImportacao: 5 })
    await c.garantirChunk(ck)
    await expect(c.importar(arquivo(6), 'mesclar')).rejects.toThrow('Divida o mapa')
    expect(c.armazem.total).toBe(0)
    expect(repo.enviados).toHaveLength(0)
    await c.importar(arquivo(5), 'mesclar')
    expect(c.armazem.total).toBe(5)
  })
})

describe('levar o mapa do navegador para a campanha', () => {
  async function comHexagonos(n: number, regioes = false) {
    const repo = new RepositorioMemoria()
    await repo.aplicar({
      id: 'a',
      autor: 'x',
      ts: 0,
      mudancas: Array.from({ length: n }, (_, q) => ({ q, r: 0, antes: null, depois: hexagonoNovo(q, 0, 'planicie') })),
      regioes: regioes ? [{ id: 'r1', antes: null, depois: { id: 'r1', nome: 'Reino', cor: '#e0524d', descricao: '', paiId: null, rev: 1 } }] : [],
    })
    return repo
  }

  it('oferece quando a campanha está vazia e o navegador tem mapa', async () => {
    const oferta = await prepararOferta(new RepositorioMemoria(), await comHexagonos(4, true), meta)
    expect(oferta).toMatchObject({ hexagonos: 4, regioes: 1 })
    expect(oferta?.arquivo.hexagonos).toHaveLength(4)
    expect(oferta?.arquivo.formato).toBe('mapa-hex')
  })

  it('leva o token junto', async () => {
    const local = await comHexagonos(2)
    await local.gravarToken({ q: 1, r: 0, ts: 5, autor: 'x' })
    const oferta = await prepararOferta(new RepositorioMemoria(), local, meta)
    expect(oferta?.arquivo.token).toMatchObject({ q: 1, r: 0 })
  })

  it('não oferece se a campanha já tem hexágonos ou regiões', async () => {
    expect(await prepararOferta(await comHexagonos(1), await comHexagonos(4), meta)).toBeNull()
    const soRegiao = new RepositorioMemoria()
    await soRegiao.aplicar({
      id: 'b',
      autor: 'x',
      ts: 0,
      mudancas: [],
      regioes: [{ id: 'r', antes: null, depois: { id: 'r', nome: 'R', cor: '#fff', descricao: '', paiId: null, rev: 1 } }],
    })
    expect(await prepararOferta(soRegiao, await comHexagonos(4), meta)).toBeNull()
  })

  it('não oferece se o navegador não tem mapa', async () => {
    expect(await prepararOferta(new RepositorioMemoria(), new RepositorioMemoria(), meta)).toBeNull()
  })

  it('importar a oferta deixa o mapa da campanha igual ao do navegador, num passo do desfazer', async () => {
    const local = await comHexagonos(3, true)
    const oferta = (await prepararOferta(new RepositorioMemoria(), local, meta))!
    const { c, repo } = await cliente(true)
    const r = await c.importar(oferta.arquivo, 'mesclar')
    expect(r.aplicados).toBe(3)
    expect(c.armazem.total).toBe(3)
    expect(c.armazem.lerRegiao('r1')?.nome).toBe('Reino')
    expect(repo.enviados).toHaveLength(1)
    c.desfazer()
    expect(c.armazem.total).toBe(0)
  })
})
