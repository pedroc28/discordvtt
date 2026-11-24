import { describe, expect, it } from 'vitest'
import { ArmazemMapa } from './armazem'
import { normalizarHexagono, normalizarToken } from './armazenamento'
import { ControladorMapa } from './controlador'
import {
  arestaCanonica,
  arestaMaisProxima,
  arestasDoCaminho,
  arestasEntrePontos,
  chaveAresta,
  chaveChunk,
  hexParaPixel,
  type Aresta,
} from './hex'
import { hexagonoNovo, mudancasArestas } from './operacoes'
import { medirRegua, textoDaMedida, tocarRegua } from './regua'
import { RepositorioMemoria } from './repositorio'

const origem = { q: 0, r: 0 }
const ck = chaveChunk(origem)
const R = 100

/** Armazém com hexágonos em (0,0), (1,0) e (0,1). */
function armazemTrio() {
  const a = new ArmazemMapa()
  a.definirChunk(ck, [hexagonoNovo(0, 0, 'planicie'), hexagonoNovo(1, 0, 'planicie'), hexagonoNovo(0, 1, 'planicie')])
  return a
}

async function cliente(repo: RepositorioMemoria, autor: string) {
  const c = new ControladorMapa(repo, autor)
  await c.garantirChunk(ck)
  return c
}

describe('geometria das arestas', () => {
  it('a aresta mais próxima do ponto médio de uma borda é essa borda', () => {
    // O ponto médio da aresta leste do hexágono (0,0) fica a meia largura à direita do centro.
    const metade = (R * Math.sqrt(3)) / 2
    expect(arestaMaisProxima(metade - 1, 0, R)).toEqual({ q: 0, r: 0, d: 0 })
    // Do outro lado da mesma borda, o hexágono vizinho devolve a mesma aresta canônica.
    expect(arestaMaisProxima(metade + 1, 0, R)).toEqual({ q: 0, r: 0, d: 0 })
  })

  it('escolhe a aresta do lado do cursor, com dono canônico', () => {
    const c = hexParaPixel({ q: 0, r: 0 }, R)
    // Perto do centro, deslocado para o sudoeste: aresta sudoeste (2) do próprio hexágono.
    const a = arestaMaisProxima(c.x - R * 0.4, c.y + R * 0.6, R)
    expect(a).toEqual({ q: 0, r: 0, d: 2 })
    // Deslocado para o noroeste: pertence ao vizinho de noroeste, como aresta sudeste dele.
    const b = arestaMaisProxima(c.x - R * 0.4, c.y - R * 0.6, R)
    expect(b).toEqual(arestaCanonica(origem, 4))
  })

  it('traço rápido não deixa buracos nem repete arestas', () => {
    const arestas = arestasEntrePontos({ x: 0, y: 0 }, { x: R * 6, y: 0 }, R)
    const chaves = arestas.map(chaveAresta)
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(arestas.length).toBeGreaterThan(4)
  })

  it('só um ponto devolve uma aresta', () => {
    expect(arestasEntrePontos(null, { x: 0, y: 0 }, R)).toHaveLength(1)
  })

  it('arestas de um caminho ligam os vizinhos consecutivos e ignoram saltos', () => {
    const caminho = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: 1 }, { q: 5, r: 5 }]
    expect(arestasDoCaminho(caminho)).toEqual([
      { q: 0, r: 0, d: 0 },
      { q: 1, r: 0, d: 1 },
    ])
  })

  it('o mesmo par andado nos dois sentidos dá a mesma aresta', () => {
    const ida = arestasDoCaminho([{ q: 0, r: 0 }, { q: 1, r: 0 }])
    const volta = arestasDoCaminho([{ q: 1, r: 0 }, { q: 0, r: 0 }])
    expect(volta).toEqual(ida)
  })
})

describe('rios e estradas nas operações', () => {
  const leste: Aresta = { q: 0, r: 0, d: 0 }

  it('liga o rio no hexágono dono quando os dois lados existem', () => {
    const m = mudancasArestas(armazemTrio(), [leste], 'rios', true)
    expect(m).toHaveLength(1)
    expect(m[0].depois).toMatchObject({ q: 0, r: 0, rios: [0], rev: 2 })
  })

  it('não liga se o outro lado não existe', () => {
    const a = new ArmazemMapa()
    a.definirChunk(ck, [hexagonoNovo(0, 0, 'planicie')])
    expect(mudancasArestas(a, [leste], 'rios', true)).toEqual([])
  })

  it('não liga se o dono não existe', () => {
    const a = new ArmazemMapa()
    a.definirChunk(ck, [hexagonoNovo(1, 0, 'planicie')])
    expect(mudancasArestas(a, [leste], 'estradas', true)).toEqual([])
  })

  it('ligar de novo não gera mudança, e tirar remove', () => {
    const a = armazemTrio()
    a.aplicarMudancas(mudancasArestas(a, [leste], 'estradas', true))
    expect(mudancasArestas(a, [leste], 'estradas', true)).toEqual([])
    const tirar = mudancasArestas(a, [leste], 'estradas', false)
    expect(tirar[0].depois?.estradas).toEqual([])
  })

  it('várias arestas do mesmo hexágono viram uma mudança só', () => {
    const m = mudancasArestas(armazemTrio(), [{ q: 0, r: 0, d: 0 }, { q: 0, r: 0, d: 1 }], 'rios', true)
    expect(m).toHaveLength(1)
    expect(m[0].depois?.rios).toEqual([0, 1])
  })

  it('tirar funciona mesmo depois que o vizinho foi apagado', () => {
    const a = armazemTrio()
    a.aplicarMudancas(mudancasArestas(a, [leste], 'rios', true))
    a.aplicarMudancas([{ q: 1, r: 0, antes: a.ler(1, 0), depois: null }])
    const tirar = mudancasArestas(a, [leste], 'rios', false)
    expect(tirar[0].depois?.rios).toEqual([])
  })

  it('aresta dada pelo lado do vizinho cai no dono', () => {
    // A aresta oeste de (1,0) é a leste de (0,0).
    const m = mudancasArestas(armazemTrio(), [arestaCanonica({ q: 1, r: 0 }, 3)], 'rios', true)
    expect(m[0]).toMatchObject({ q: 0, r: 0 })
  })
})

describe('rios e estradas no controlador', () => {
  it('uma pincelada de rio é um passo só no desfazer, e rios sobrevivem a pintar o terreno', async () => {
    const repo = new RepositorioMemoria()
    const c = await cliente(repo, 'ana')
    const t0 = c.iniciarTraco()
    t0.pintar([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], 'planicie')
    t0.confirmar()

    const t = c.iniciarTraco()
    t.rio([{ q: 0, r: 0, d: 0 }], true)
    t.rio([{ q: 0, r: 0, d: 1 }], true)
    t.estrada([{ q: 0, r: 0, d: 0 }], true)
    t.confirmar()
    expect(c.armazem.ler(0, 0)).toMatchObject({ rios: [0, 1], estradas: [0] })

    const p = c.iniciarTraco()
    p.pintar([origem], 'floresta')
    p.confirmar()
    expect(c.armazem.ler(0, 0)).toMatchObject({ terreno: 'floresta', rios: [0, 1], estradas: [0] })

    c.desfazer() // desfaz a pintura
    c.desfazer() // desfaz o rio e a estrada juntos
    expect(c.armazem.ler(0, 0)).toMatchObject({ rios: [], estradas: [] })
    c.refazer()
    expect(c.armazem.ler(0, 0)).toMatchObject({ rios: [0, 1], estradas: [0] })
  })

  it('outro jogador recebe o rio', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    const t = ana.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }, { q: 1, r: 0 }], 'planicie')
    t.confirmar()
    const r = ana.iniciarTraco()
    r.rio([{ q: 0, r: 0, d: 0 }], true)
    r.confirmar()
    await new Promise((res) => setTimeout(res, 0))
    expect(beto.armazem.ler(0, 0)?.rios).toEqual([0])
  })

  it('apagar o hexágono leva o rio dele, e desfazer devolve', async () => {
    const repo = new RepositorioMemoria()
    const c = await cliente(repo, 'ana')
    const t = c.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }, { q: 1, r: 0 }], 'planicie')
    t.confirmar()
    const r = c.iniciarTraco()
    r.rio([{ q: 0, r: 0, d: 0 }], true)
    r.confirmar()
    const a = c.iniciarTraco()
    a.apagar([origem])
    a.confirmar()
    expect(c.armazem.ler(0, 0)).toBeNull()
    c.desfazer()
    expect(c.armazem.ler(0, 0)?.rios).toEqual([0])
  })
})

describe('token do grupo', () => {
  it('mover o token chega aos outros e não entra no desfazer', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    ana.moverToken({ q: 3, r: -1 })
    await new Promise((res) => setTimeout(res, 0))
    expect(beto.token).toMatchObject({ q: 3, r: -1, autor: 'ana' })
    expect(ana.podeDesfazer).toBe(false)
    expect(ana.token).toMatchObject({ q: 3, r: -1 })
  })

  it('tirar o token também chega aos outros', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    ana.moverToken({ q: 1, r: 1 })
    await new Promise((res) => setTimeout(res, 0))
    ana.tirarToken()
    await new Promise((res) => setTimeout(res, 0))
    expect(beto.token).toBeNull()
  })

  it('quem abre depois carrega a posição gravada', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    ana.moverToken({ q: 2, r: 2 })
    await new Promise((res) => setTimeout(res, 0))
    const beto = await cliente(repo, 'beto')
    await beto.carregarToken()
    expect(beto.token).toMatchObject({ q: 2, r: 2 })
  })

  it('o aviso de outra pessoa vale na ordem de chegada, sem olhar o relógio dela', async () => {
    const repo = new RepositorioMemoria()
    const c = await cliente(repo, 'ana')
    c.moverToken({ q: 5, r: 5 })
    const atual = c.token!
    // O relógio do Beto está atrasado, mas o servidor entregou o aviso dele depois: é a posição atual.
    await repo.gravarToken({ q: 0, r: 0, ts: atual.ts - 1000, autor: 'beto' })
    expect(c.token).toMatchObject({ q: 0, r: 0 })
  })

  it('repositório sem suporte deixa o token só na memória', async () => {
    const repo = new RepositorioMemoria()
    const semToken = {
      carregarChunk: repo.carregarChunk.bind(repo),
      carregarRegioes: repo.carregarRegioes.bind(repo),
      aplicar: repo.aplicar.bind(repo),
      assinar: repo.assinar.bind(repo),
    }
    const c = new ControladorMapa(semToken, 'ana')
    c.moverToken({ q: 1, r: 0 })
    expect(c.token).toMatchObject({ q: 1, r: 0 })
    await c.carregarToken()
    expect(c.token).toMatchObject({ q: 1, r: 0 })
  })
})

describe('régua', () => {
  it('o terceiro toque recomeça a medida', () => {
    const a = tocarRegua(null, { q: 0, r: 0 })
    expect(a).toEqual({ a: { q: 0, r: 0 }, b: null })
    const b = tocarRegua(a, { q: 3, r: 0 })
    expect(b.b).toEqual({ q: 3, r: 0 })
    expect(tocarRegua(b, { q: 9, r: 9 })).toEqual({ a: { q: 9, r: 9 }, b: null })
  })

  it('mede em passos de hexágono', () => {
    expect(medirRegua({ q: 0, r: 0 }, { q: 0, r: 0 }).passos).toBe(0)
    expect(medirRegua({ q: 0, r: 0 }, { q: 3, r: -3 }).passos).toBe(3)
    expect(medirRegua({ q: 0, r: 0 }, { q: 3, r: -3 }).caminho).toHaveLength(4)
  })

  it('escreve no singular e no plural', () => {
    expect(textoDaMedida(1)).toBe('1 hexágono')
    expect(textoDaMedida(0)).toBe('0 hexágonos')
    expect(textoDaMedida(7)).toBe('7 hexágonos')
  })
})

describe('dados de fora', () => {
  it('mapa antigo sem rios nem estradas continua válido', () => {
    expect(normalizarHexagono({ q: 0, r: 0, terreno: 'planicie' })).toMatchObject({ rios: [], estradas: [] })
  })

  it('direção inválida, repetida ou fora de ordem é limpa', () => {
    const h = normalizarHexagono({ q: 0, r: 0, terreno: 'planicie', rios: [2, 0, 0, 7, 'x'], estradas: 'lixo' })
    expect(h).toMatchObject({ rios: [0, 2], estradas: [] })
  })

  it('token quebrado é recusado', () => {
    expect(normalizarToken({ q: 1.5, r: 0 })).toBeNull()
    expect(normalizarToken(null)).toBeNull()
    expect(normalizarToken({ q: 1, r: 2, ts: 5, autor: 'a' })).toEqual({ q: 1, r: 2, ts: 5, autor: 'a' })
  })
})
