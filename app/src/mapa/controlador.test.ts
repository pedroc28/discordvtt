import { describe, expect, it } from 'vitest'
import { normalizarHexagono } from './armazenamento'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { fundirMudancas, hexagonoNovo, mudancasApagar, mudancasPintar } from './operacoes'
import { RepositorioMemoria } from './repositorio'
import type { Lote } from './tipos'
import { ArmazemMapa } from './armazem'

const origem = { q: 0, r: 0 }
const ck = chaveChunk(origem)

async function cliente(repo: RepositorioMemoria, autor: string) {
  const c = new ControladorMapa(repo, autor)
  await c.garantirChunk(ck)
  return c
}

const terrenoEm = (c: ControladorMapa, q: number, r: number) => c.armazem.ler(q, r)?.terreno ?? null

describe('operações puras', () => {
  it('pintar cria hexágono novo e troca só o terreno do existente', () => {
    const a = new ArmazemMapa()
    a.definirChunk(ck, [{ ...hexagonoNovo(1, 1, 'planicie'), nome: 'Vila', rev: 4 }])
    const m = mudancasPintar(a, [{ q: 0, r: 0 }, { q: 1, r: 1 }], 'floresta')
    expect(m).toHaveLength(2)
    expect(m[0].antes).toBeNull()
    expect(m[0].depois?.terreno).toBe('floresta')
    expect(m[1].depois).toMatchObject({ terreno: 'floresta', nome: 'Vila', rev: 5 })
  })

  it('pintar o mesmo terreno não gera mudança', () => {
    const a = new ArmazemMapa()
    a.definirChunk(ck, [hexagonoNovo(0, 0, 'planicie')])
    expect(mudancasPintar(a, [origem], 'planicie')).toEqual([])
  })

  it('apagar só gera mudança onde existe hexágono', () => {
    const a = new ArmazemMapa()
    a.definirChunk(ck, [hexagonoNovo(0, 0, 'planicie')])
    const m = mudancasApagar(a, [origem, { q: 1, r: 0 }])
    expect(m).toHaveLength(1)
    expect(m[0].depois).toBeNull()
  })

  it('fundir mantém o primeiro antes e o último depois', () => {
    const h1 = hexagonoNovo(0, 0, 'planicie')
    const h2 = { ...h1, terreno: 'floresta', rev: 2 }
    const h3 = { ...h1, terreno: 'deserto', rev: 3 }
    const f = fundirMudancas([
      { q: 0, r: 0, antes: null, depois: h1 },
      { q: 0, r: 0, antes: h1, depois: h2 },
      { q: 0, r: 0, antes: h2, depois: h3 },
    ])
    expect(f).toEqual([{ q: 0, r: 0, antes: null, depois: h3 }])
  })

  it('fundir descarta o que foi criado e apagado na mesma pincelada', () => {
    const h = hexagonoNovo(0, 0, 'planicie')
    expect(
      fundirMudancas([
        { q: 0, r: 0, antes: null, depois: h },
        { q: 0, r: 0, antes: h, depois: null },
      ]),
    ).toEqual([])
  })
})

describe('traço, desfazer e refazer', () => {
  it('a pincelada aparece na hora e vira um passo só no histórico', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    const t = c.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }], 'planicie')
    t.pintar([{ q: 1, r: 0 }], 'planicie')
    t.pintar([{ q: 0, r: 0 }], 'floresta')
    expect(terrenoEm(c, 0, 0)).toBe('floresta')
    t.confirmar()
    expect(c.podeDesfazer).toBe(true)
    c.desfazer()
    expect(terrenoEm(c, 0, 0)).toBeNull()
    expect(terrenoEm(c, 1, 0)).toBeNull()
    expect(c.podeDesfazer).toBe(false)
  })

  it('cancelar volta o mapa ao que era e não entra no histórico', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    const base = c.iniciarTraco()
    base.pintar([origem], 'planicie')
    base.confirmar()
    const t = c.iniciarTraco()
    t.pintar([origem, { q: 1, r: 0 }], 'deserto')
    t.cancelar()
    expect(terrenoEm(c, 0, 0)).toBe('planicie')
    expect(terrenoEm(c, 1, 0)).toBeNull()
    c.desfazer()
    expect(terrenoEm(c, 0, 0)).toBeNull()
  })

  it('refazer reaplica, e dá para desfazer de novo depois', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    const t = c.iniciarTraco()
    t.pintar([origem], 'planicie')
    t.confirmar()
    c.desfazer()
    expect(c.podeRefazer).toBe(true)
    c.refazer()
    expect(terrenoEm(c, 0, 0)).toBe('planicie')
    c.desfazer()
    expect(terrenoEm(c, 0, 0)).toBeNull()
    c.refazer()
    expect(terrenoEm(c, 0, 0)).toBe('planicie')
  })

  it('desfazer apagar devolve o hexágono com nome e nota', async () => {
    const repo = new RepositorioMemoria()
    const c = await cliente(repo, 'ana')
    const t0 = c.iniciarTraco()
    t0.pintar([origem], 'planicie')
    t0.confirmar()
    const h = c.armazem.ler(0, 0)!
    c.armazem.aplicarMudancas([{ q: 0, r: 0, antes: h, depois: { ...h, nome: 'Vila', nota: 'Taverna', rev: h.rev + 1 } }])
    const t = c.iniciarTraco()
    t.apagar([origem])
    t.confirmar()
    expect(c.armazem.ler(0, 0)).toBeNull()
    c.desfazer()
    expect(c.armazem.ler(0, 0)).toMatchObject({ nome: 'Vila', nota: 'Taverna' })
  })

  it('só edita chunks já carregados', async () => {
    const c = new ControladorMapa(new RepositorioMemoria(), 'ana')
    const t = c.iniciarTraco()
    t.pintar([origem], 'planicie')
    expect(t.vazio).toBe(true)
    expect(t.confirmar()).toBeNull()
  })
})

describe('dois clientes no mesmo repositório', () => {
  it('a edição de um aparece no outro', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    const t = ana.iniciarTraco()
    t.pintar([origem, { q: 1, r: 0 }], 'floresta')
    t.confirmar()
    await Promise.resolve()
    await Promise.resolve()
    expect(terrenoEm(beto, 0, 0)).toBe('floresta')
    expect(terrenoEm(beto, 1, 0)).toBe('floresta')
  })

  it('quem entra depois carrega o que já foi construído', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const t = ana.iniciarTraco()
    t.pintar([origem], 'montanha')
    t.confirmar()
    await Promise.resolve()
    const beto = await cliente(repo, 'beto')
    expect(terrenoEm(beto, 0, 0)).toBe('montanha')
  })

  it('o eco do próprio lote não é aplicado duas vezes', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    let avisos = 0
    ana.armazem.ouvir(() => avisos++)
    const t = ana.iniciarTraco()
    t.pintar([origem], 'planicie')
    const aposPintar = avisos
    t.confirmar()
    await Promise.resolve()
    await Promise.resolve()
    expect(avisos).toBe(aposPintar)
  })

  it('desfazer não apaga o que outra pessoa mudou depois', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')

    const ta = ana.iniciarTraco()
    ta.pintar([origem, { q: 1, r: 0 }], 'planicie')
    ta.confirmar()
    await new Promise((r) => setTimeout(r, 0))

    // O Beto repinta só o hexágono (0,0).
    const tb = beto.iniciarTraco()
    tb.pintar([origem], 'deserto')
    tb.confirmar()
    await new Promise((r) => setTimeout(r, 0))
    expect(terrenoEm(ana, 0, 0)).toBe('deserto')

    const conflitos = ana.desfazer()
    expect(conflitos).toBe(1)
    expect(terrenoEm(ana, 0, 0)).toBe('deserto') // preservado
    expect(terrenoEm(ana, 1, 0)).toBeNull() // desfeito
    await new Promise((r) => setTimeout(r, 0))
    expect(terrenoEm(beto, 0, 0)).toBe('deserto')
    expect(terrenoEm(beto, 1, 0)).toBeNull()
  })

  it('lote que chega enquanto o chunk carrega não se perde', async () => {
    const repo = new RepositorioMemoria(10)
    const ana = await cliente(repo, 'ana')
    const beto = new ControladorMapa(repo, 'beto')
    const carregando = beto.garantirChunk(ck)
    const lote: Lote = {
      id: 'x',
      autor: 'ana',
      ts: 0,
      mudancas: [{ q: 2, r: 2, antes: null, depois: hexagonoNovo(2, 2, 'pantano') }],
    }
    beto.receber(lote)
    await carregando
    expect(terrenoEm(beto, 2, 2)).toBe('pantano')
    expect(ana).toBeTruthy()
  })

  it('erro ao gravar avisa a interface', async () => {
    const repo = new RepositorioMemoria()
    repo.aplicar = () => Promise.reject(new Error('disco cheio'))
    const c = await cliente(repo, 'ana')
    let msg = ''
    c.aoErro = (m) => (msg = m)
    const t = c.iniciarTraco()
    t.pintar([origem], 'planicie')
    t.confirmar()
    await Promise.resolve()
    await Promise.resolve()
    expect(msg).toContain('disco cheio')
  })
})

describe('normalizar', () => {
  it('aceita hexágono válido e completa o que falta', () => {
    expect(normalizarHexagono({ q: 1, r: -2, terreno: 'floresta' })).toEqual({
      q: 1,
      r: -2,
      terreno: 'floresta',
      regiaoId: null,
      nome: '',
      nota: '',
      rev: 1,
    })
  })

  it('recusa coordenada quebrada ou terreno vazio', () => {
    expect(normalizarHexagono({ q: 1.5, r: 0, terreno: 'x' })).toBeNull()
    expect(normalizarHexagono({ q: 1, r: 0, terreno: '' })).toBeNull()
    expect(normalizarHexagono(null)).toBeNull()
    expect(normalizarHexagono('lixo')).toBeNull()
  })
})
