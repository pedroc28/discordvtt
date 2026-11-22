import { describe, expect, it } from 'vitest'
import { ArmazemMapa } from './armazem'
import { chaveChunk } from './hex'
import { hexagonoNovo } from './operacoes'
import type { Hexagono } from './tipos'
import {
  CONFIG_PADRAO,
  acharRota,
  calcularProvisoes,
  custoDoPasso,
  custoDoTerreno,
  normalizarConfig,
  resumirViagem,
  rotaPorPontos,
  terrenosDaRota,
  textoDeDuracao,
} from './viagem'

const ck = chaveChunk({ q: 0, r: 0 })

/** Mapa com uma fileira reta de hexágonos (r = 0, q de 0 a n), todos do terreno dado. */
function fileira(n: number, terreno = 'planicie', extra: Record<number, Partial<Hexagono>> = {}) {
  const a = new ArmazemMapa()
  const hexes: Hexagono[] = []
  for (let q = 0; q <= n; q++) hexes.push({ ...hexagonoNovo(q, 0, terreno), ...(extra[q] ?? {}) })
  a.definirChunk(ck, hexes)
  return a
}

describe('custo do terreno', () => {
  it('planície custa 1, montanha mais, mar aberto não se atravessa e desconhecido tem custo médio', () => {
    expect(custoDoTerreno('planicie')).toBe(1)
    expect(custoDoTerreno('montanha')).toBeGreaterThan(custoDoTerreno('colina')!)
    expect(custoDoTerreno('oceano')).toBeNull()
    expect(custoDoTerreno('terreno-que-nao-existe')).toBe(1.5)
  })
})

describe('custo do passo', () => {
  it('entra no hexágono pelo custo do terreno dele', () => {
    const a = fileira(2, 'planicie', { 1: { terreno: 'montanha' } })
    expect(custoDoPasso(a, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(3)
    expect(custoDoPasso(a, { q: 1, r: 0 }, { q: 2, r: 0 })).toBe(1)
  })

  it('não anda para hexágono vazio, para quem não é vizinho nem para água aberta', () => {
    const a = fileira(1, 'planicie', { 1: { terreno: 'oceano' } })
    expect(custoDoPasso(a, { q: 0, r: 0 }, { q: 1, r: 0 })).toBeNull()
    expect(custoDoPasso(a, { q: 0, r: 0 }, { q: 5, r: 5 })).toBeNull()
    expect(custoDoPasso(a, { q: 0, r: 0 }, { q: -1, r: 0 })).toBeNull()
  })

  it('estrada pela aresta custa meio, e vale nos dois sentidos, mesmo em terreno difícil', () => {
    // Aresta leste (0) do hexágono 0 tem estrada: liga 0 e 1.
    const a = fileira(1, 'planicie', { 0: { estradas: [0] }, 1: { terreno: 'montanha' } })
    expect(custoDoPasso(a, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(0.5)
    expect(custoDoPasso(a, { q: 1, r: 0 }, { q: 0, r: 0 })).toBe(0.5)
  })

  it('rio soma o vau, e estrada por cima do rio é ponte', () => {
    const rio = fileira(1, 'planicie', { 0: { rios: [0] } })
    expect(custoDoPasso(rio, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(2)
    const ponte = fileira(1, 'planicie', { 0: { rios: [0], estradas: [0] } })
    expect(custoDoPasso(ponte, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(0.5)
  })
})

describe('rota', () => {
  it('anda em linha reta pela planície, somando o custo', () => {
    const rota = acharRota(fileira(4), { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(rota.caminho.map((h) => h.q)).toEqual([0, 1, 2, 3, 4])
    expect(rota.custo).toBe(4)
  })

  it('contorna terreno difícil quando compensa', () => {
    // Fileira r=0 com montanha em q=2, e uma volta pela fileira r=1 de planície.
    const a = new ArmazemMapa()
    const hexes: Hexagono[] = []
    for (let q = 0; q <= 4; q++) hexes.push(hexagonoNovo(q, 0, q === 2 ? 'montanha' : 'planicie'))
    for (let q = -1; q <= 3; q++) hexes.push(hexagonoNovo(q, 1, 'planicie'))
    a.definirChunk(ck, hexes)
    const rota = acharRota(a, { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(rota.caminho.some((h) => h.q === 2 && h.r === 0)).toBe(false)
    expect(rota.custo).toBeLessThan(3 + 3)
  })

  it('prefere a estrada, mesmo mais longa', () => {
    const a = fileira(2, 'floresta', { 0: { estradas: [0] }, 1: { estradas: [0] } })
    const rota = acharRota(a, { q: 0, r: 0 }, { q: 2, r: 0 })!
    expect(rota.custo).toBe(1)
  })

  it('devolve null sem caminho: água no meio, ou ponta que não existe', () => {
    const a = fileira(2, 'planicie', { 1: { terreno: 'oceano' } })
    expect(acharRota(a, { q: 0, r: 0 }, { q: 2, r: 0 })).toBeNull()
    expect(acharRota(fileira(2), { q: 0, r: 0 }, { q: 9, r: 9 })).toBeNull()
  })

  it('mesmo ponto é rota de custo zero', () => {
    const rota = acharRota(fileira(2), { q: 1, r: 0 }, { q: 1, r: 0 })!
    expect(rota.custo).toBe(0)
    expect(rota.caminho).toHaveLength(1)
  })

  it('rota por vários pontos junta os trechos sem repetir a emenda', () => {
    const r = rotaPorPontos(fileira(4), [{ q: 0, r: 0 }, { q: 2, r: 0 }, { q: 4, r: 0 }])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rota.caminho.map((h) => h.q)).toEqual([0, 1, 2, 3, 4])
    expect(r.rota.custo).toBe(4)
  })

  it('diz qual trecho não tem caminho', () => {
    const a = fileira(4, 'planicie', { 3: { terreno: 'oceano' } })
    const r = rotaPorPontos(a, [{ q: 0, r: 0 }, { q: 2, r: 0 }, { q: 4, r: 0 }])
    expect(r).toEqual({ ok: false, trecho: 2 })
  })

  it('conta os terrenos da rota sem contar o ponto de partida', () => {
    const a = fileira(3, 'planicie', { 1: { terreno: 'floresta' }, 2: { terreno: 'floresta' } })
    const rota = acharRota(a, { q: 0, r: 0 }, { q: 3, r: 0 })!
    expect(terrenosDaRota(a, rota)).toEqual([
      { terreno: 'floresta', n: 2 },
      { terreno: 'planicie', n: 1 },
    ])
  })
})

describe('resumo e provisões', () => {
  const cfg = { ...CONFIG_PADRAO, kmPorHex: 10, kmPorDia: 24, ritmo: 'normal' as const }

  it('converte custo em dias pelo ritmo', () => {
    const rota = { caminho: Array.from({ length: 5 }, (_, q) => ({ q, r: 0 })), custo: 4.8 }
    const normal = resumirViagem(rota, cfg)
    expect(normal.passos).toBe(4)
    expect(normal.km).toBe(40)
    expect(normal.kmEquivalentes).toBeCloseTo(48)
    expect(normal.dias).toBeCloseTo(2)
    expect(normal.diasDeProvisao).toBe(2)
    expect(resumirViagem(rota, { ...cfg, ritmo: 'lento' }).dias).toBeGreaterThan(normal.dias)
    expect(resumirViagem(rota, { ...cfg, ritmo: 'rapido' }).dias).toBeLessThan(normal.dias)
  })

  it('dia fracionário pede provisão do dia inteiro', () => {
    const rota = { caminho: [{ q: 0, r: 0 }, { q: 1, r: 0 }], custo: 3 }
    const r = resumirViagem(rota, cfg)
    expect(r.dias).toBeCloseTo(1.25)
    expect(r.diasDeProvisao).toBe(2)
  })

  it('calcula ração, água, peso e carga', () => {
    const c = { ...cfg, viajantes: 4, montarias: 1 }
    const p = calcularProvisoes(c, 3)
    expect(p.racoesPorDia).toBe(4 * 1 + 1 * 2)
    expect(p.racoes).toBe(18)
    expect(p.aguaPorDia).toBe(4 * 4 + 20)
    expect(p.agua).toBe(108)
    expect(p.peso).toBe(18 + 108)
    expect(p.capacidade).toBe(4 * 20 + 80)
    expect(p.sobrecarregado).toBe(false)
    expect(calcularProvisoes(c, 30).sobrecarregado).toBe(true)
  })

  it('o estoque abate o que falta e diz quantos dias dura', () => {
    const c = { ...cfg, viajantes: 2, montarias: 0, estoqueRacoes: 10, estoqueAgua: 8 }
    const p = calcularProvisoes(c, 4)
    expect(p.faltamRacoes).toBe(0)
    expect(p.faltamAgua).toBe(8 * 4 - 8)
    // 10 rações cobrem 5 dias, 8 litros cobrem 1 dia: vale o menor.
    expect(p.diasDoEstoque).toBe(1)
  })

  it('zero dias pede zero e arredonda dia quebrado para cima', () => {
    expect(calcularProvisoes(cfg, 0).racoes).toBe(0)
    expect(calcularProvisoes(cfg, 1.2).dias).toBe(2)
  })

  it('texto de duração usa dia de 8 horas', () => {
    expect(textoDeDuracao(0)).toBe('0 dia')
    expect(textoDeDuracao(1)).toBe('1 dia')
    expect(textoDeDuracao(2.5)).toBe('2 dias e 4 h')
    expect(textoDeDuracao(0.25)).toBe('2 h')
    expect(textoDeDuracao(0.01)).toBe('menos de 1 h')
  })
})

describe('configuração vinda de fora', () => {
  it('lixo vira o padrão e número fora da faixa é puxado para ela', () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_PADRAO)
    expect(normalizarConfig('x')).toEqual(CONFIG_PADRAO)
    const c = normalizarConfig({ viajantes: -5, montarias: 2.6, kmPorHex: 'dez', ritmo: 'voando', kmPorDia: 99999, aguaPorPessoa: 3.5 })
    expect(c.viajantes).toBe(1)
    expect(c.montarias).toBe(3)
    expect(c.kmPorHex).toBe(CONFIG_PADRAO.kmPorHex)
    expect(c.ritmo).toBe('normal')
    expect(c.kmPorDia).toBe(500)
    expect(c.aguaPorPessoa).toBe(3.5)
  })

  it('aceita ritmo válido', () => {
    expect(normalizarConfig({ ritmo: 'rapido' }).ritmo).toBe('rapido')
  })
})
