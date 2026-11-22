import { describe, expect, it } from 'vitest'
import { ArmazemMapa } from './armazem'
import { lerArquivo, montarArquivo, nomeDoArquivo, planejarImportacao, terrenosDesconhecidos } from './arquivo'
import { metaPadrao } from './armazenamento'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { hexagonoNovo, regiaoNova } from './operacoes'
import { RepositorioMemoria } from './repositorio'
import type { Hexagono } from './tipos'

const origem = { q: 0, r: 0 }
const ck = chaveChunk(origem)

const h = (q: number, r: number, terreno = 'planicie', extra: Partial<Hexagono> = {}): Hexagono => ({
  ...hexagonoNovo(q, r, terreno),
  ...extra,
})

function armazemCom(hexes: Hexagono[]) {
  const a = new ArmazemMapa()
  a.definirChunk(ck, hexes)
  a.definirRegioes([])
  return a
}

describe('arquivo de exportação', () => {
  it('monta em ordem fixa e lê de volta igual', () => {
    const hexes = [h(2, 1), h(0, 0, 'floresta', { nome: 'Vila', rios: [0, 2], estradas: [1] }), h(1, 0)]
    const regioes = [regiaoNova('b', { nome: 'Reino', cor: '#336699' }), regiaoNova('a', { nome: 'Província', cor: '#993366', paiId: 'b' })]
    const arq = montarArquivo(metaPadrao(), hexes, regioes, { q: 1, r: 0 }, new Date('2026-11-22T10:00:00Z'))
    expect(arq.hexagonos.map((x) => `${x.q},${x.r}`)).toEqual(['0,0', '1,0', '2,1'])
    expect(arq.regioes.map((r) => r.id)).toEqual(['a', 'b'])
    expect(arq.exportadoEm).toBe('2026-11-22T10:00:00.000Z')

    const lido = lerArquivo(JSON.stringify(arq))
    expect(lido.ok).toBe(true)
    if (!lido.ok) return
    expect(lido.arquivo).toEqual(arq)
    expect(lido.resumo).toEqual({ hexagonos: 3, regioes: 2, descartados: 0 })
    expect(lido.arquivo.hexagonos[0]).toMatchObject({ nome: 'Vila', rios: [0, 2], estradas: [1] })
  })

  it('recusa o que não é mapa, com mensagem que diz o que fazer', () => {
    const quebrado = lerArquivo('{ não é json')
    expect(quebrado.ok).toBe(false)
    if (!quebrado.ok) expect(quebrado.erro).toContain('JSON')
    expect(lerArquivo('[1,2]').ok).toBe(false)
    expect(lerArquivo('{"formato":"outro","versao":1}').ok).toBe(false)
    expect(lerArquivo('{"formato":"mapa-hex"}').ok).toBe(false)
    expect(lerArquivo('{"formato":"mapa-hex","versao":1}').ok).toBe(false)
    const nova = lerArquivo('{"formato":"mapa-hex","versao":99,"hexagonos":[]}')
    expect(nova.ok).toBe(false)
    if (!nova.ok) expect(nova.erro).toContain('mais nova')
  })

  it('descarta itens quebrados, conta e mantém os bons', () => {
    const lido = lerArquivo(
      JSON.stringify({
        formato: 'mapa-hex',
        versao: 1,
        hexagonos: [{ q: 0, r: 0, terreno: 'planicie' }, { q: 1.5, r: 0, terreno: 'x' }, 'lixo', { q: 1, r: 1, terreno: '' }],
        regioes: [{ id: 'a', nome: 'Reino', cor: '#112233' }, { sem: 'id' }],
        token: { q: 2, r: 'x' },
      }),
    )
    expect(lido.ok).toBe(true)
    if (!lido.ok) return
    expect(lido.resumo).toEqual({ hexagonos: 1, regioes: 1, descartados: 4 })
    expect(lido.arquivo.token).toBeNull()
    expect(lido.arquivo.meta.nome).toBe('Mapa importado')
  })

  it('hexágono repetido vale o último', () => {
    const lido = lerArquivo(
      JSON.stringify({
        formato: 'mapa-hex',
        versao: 1,
        hexagonos: [{ q: 0, r: 0, terreno: 'planicie' }, { q: 0, r: 0, terreno: 'floresta' }],
      }),
    )
    expect(lido.ok && lido.arquivo.hexagonos).toMatchObject([{ terreno: 'floresta' }])
  })

  it('aponta terrenos que o tileset não tem', () => {
    const arq = montarArquivo(metaPadrao(), [h(0, 0, 'planicie'), h(1, 0, 'lava-azul'), h(2, 0, 'lava-azul')], [], null)
    expect([...terrenosDesconhecidos(arq, new Set(['planicie']))]).toEqual([['lava-azul', 2]])
  })

  it('nome do arquivo sem acento nem caractere estranho', () => {
    expect(nomeDoArquivo('Mapa do Mundão / 1', new Date('2026-11-22T10:00:00Z'))).toBe('mapa-mapa-do-mundao-1-2026-11-22.json')
    expect(nomeDoArquivo('???', new Date('2026-11-22T10:00:00Z'))).toBe('mapa-sem-nome-2026-11-22.json')
  })
})

describe('plano de importação', () => {
  const arquivo = montarArquivo(metaPadrao(), [h(0, 0, 'floresta', { rev: 3 }), h(1, 0, 'deserto')], [regiaoNova('r', { nome: 'R', cor: '#aa0000' })], null)

  it('mesclar cria o que falta, troca o que difere e deixa o resto', () => {
    const atual = armazemCom([h(0, 0, 'planicie', { rev: 5 }), h(5, 5, 'oceano')])
    const plano = planejarImportacao(atual, arquivo, 'mesclar')
    expect(plano.aplicados).toBe(2)
    expect(plano.removidos).toBe(0)
    const m = plano.mudancas.find((x) => x.q === 0 && x.r === 0)!
    expect(m.antes?.terreno).toBe('planicie')
    expect(m.depois?.terreno).toBe('floresta')
    // A revisão sobe acima das duas, para ordenar certo.
    expect(m.depois!.rev).toBe(6)
    expect(plano.mudancas.find((x) => x.q === 5)).toBeUndefined()
    expect(plano.regioes).toHaveLength(1)
  })

  it('o que já está igual não gera mudança', () => {
    const atual = armazemCom([h(0, 0, 'floresta', { rev: 9 }), h(1, 0, 'deserto', { rev: 4 })])
    atual.definirRegioes([regiaoNova('r', { nome: 'R', cor: '#aa0000' })])
    const plano = planejarImportacao(atual, arquivo, 'mesclar')
    expect(plano.mudancas).toEqual([])
    expect(plano.regioes).toEqual([])
  })

  it('substituir apaga o que não está no arquivo, inclusive regiões', () => {
    const existentes = [h(0, 0, 'planicie'), h(5, 5, 'oceano')]
    const atual = armazemCom(existentes)
    atual.definirRegioes([regiaoNova('velha', { nome: 'Velha', cor: '#00aa00' })])
    const plano = planejarImportacao(atual, arquivo, 'substituir', { hexagonos: existentes, regioes: [regiaoNova('velha', { nome: 'Velha', cor: '#00aa00' })] })
    expect(plano.removidos).toBe(1)
    const apagado = plano.mudancas.find((x) => x.q === 5 && x.r === 5)!
    expect(apagado.depois).toBeNull()
    expect(apagado.antes?.terreno).toBe('oceano')
    expect(plano.regioes.find((x) => x.id === 'velha')?.depois).toBeNull()
  })
})

describe('exportar e importar pelo controlador', () => {
  async function cliente(repo: RepositorioMemoria) {
    const c = new ControladorMapa(repo, 'ana')
    await c.garantirChunk(ck)
    await c.carregarRegioes()
    return c
  }

  it('exporta tudo, inclusive chunk que ninguém abriu, e reimporta em outro mapa igual', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo)
    const t = ana.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }, { q: 1, r: 0 }], 'floresta')
    t.confirmar()
    // Um hexágono em outro chunk, gravado direto no repositório (o controlador nunca o carregou).
    await repo.aplicar({
      id: 'x',
      autor: 'beto',
      ts: 0,
      mudancas: [{ q: 40, r: 40, antes: null, depois: hexagonoNovo(40, 40, 'deserto') }],
      regioes: [],
    })
    ana.criarRegiao({ nome: 'Reino', cor: '#336699' })
    ana.moverToken({ q: 1, r: 0 })

    const arq = await ana.exportar(metaPadrao())
    expect(arq.hexagonos.map((x) => `${x.q},${x.r}`).sort()).toEqual(['0,0', '1,0', '40,40'])
    expect(arq.regioes).toHaveLength(1)
    expect(arq.token).toEqual({ q: 1, r: 0 })

    const outro = new RepositorioMemoria()
    const bia = new ControladorMapa(outro, 'bia')
    const res = await bia.importar(arq, 'mesclar')
    expect(res).toEqual({ aplicados: 3, removidos: 0 })
    expect(bia.armazem.ler(1, 0)?.terreno).toBe('floresta')
    expect(bia.armazem.ler(40, 40)?.terreno).toBe('deserto')
    expect(bia.armazem.listarRegioes()).toHaveLength(1)
    // Mesclar não mexe no token.
    expect(bia.token).toBeNull()
    // E o outro repositório recebeu tudo.
    const guardado = await outro.exportarTudo()
    expect(guardado.hexagonos).toHaveLength(3)
  })

  it('importar é um passo só no desfazer', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo)
    const arq = montarArquivo(metaPadrao(), [h(0, 0, 'floresta'), h(1, 0, 'deserto')], [], null)
    await ana.importar(arq, 'mesclar')
    expect(ana.armazem.total).toBe(2)
    ana.desfazer()
    expect(ana.armazem.total).toBe(0)
    ana.refazer()
    expect(ana.armazem.total).toBe(2)
  })

  it('substituir deixa o mapa igual ao arquivo, move o token e dá para desfazer', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo)
    const t = ana.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }, { q: 3, r: 3 }], 'oceano')
    t.confirmar()
    const arq = montarArquivo(metaPadrao(), [h(0, 0, 'floresta'), h(1, 0, 'deserto')], [], { q: 1, r: 0 })
    const res = await ana.importar(arq, 'substituir')
    expect(res.removidos).toBe(1)
    expect(ana.armazem.ler(3, 3)).toBeNull()
    expect(ana.armazem.ler(0, 0)?.terreno).toBe('floresta')
    expect(ana.token).toMatchObject({ q: 1, r: 0 })
    ana.desfazer()
    expect(ana.armazem.ler(3, 3)?.terreno).toBe('oceano')
    expect(ana.armazem.ler(0, 0)?.terreno).toBe('oceano')
    expect(ana.armazem.ler(1, 0)).toBeNull()
  })

  it('importar o arquivo que acabou de exportar não muda nada', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo)
    const t = ana.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }], 'floresta')
    t.confirmar()
    const arq = await ana.exportar(metaPadrao())
    const res = await ana.importar(arq, 'substituir')
    expect(res).toEqual({ aplicados: 0, removidos: 0 })
  })

  it('substituir sem um repositório que lista tudo é recusado com explicação', async () => {
    const repo = new RepositorioMemoria()
    const semListar = {
      carregarChunk: repo.carregarChunk.bind(repo),
      carregarRegioes: repo.carregarRegioes.bind(repo),
      aplicar: repo.aplicar.bind(repo),
      assinar: repo.assinar.bind(repo),
    }
    const c = new ControladorMapa(semListar, 'ana')
    const arq = montarArquivo(metaPadrao(), [h(0, 0)], [], null)
    await expect(c.importar(arq, 'substituir')).rejects.toThrow('mesclar')
    // Mesclar e exportar continuam funcionando, com o que está carregado.
    await c.importar(arq, 'mesclar')
    expect((await c.exportar(metaPadrao())).hexagonos).toHaveLength(1)
  })
})
