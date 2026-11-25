// Mapa de batalha: geometria das grades, encaixe, régua e operações sobre a cena.

import { describe, expect, it } from 'vitest'
import { cantosDaCelula, celulaEm, celulasNaJanela, centroDaCelula, distanciaEmCelulas, encaixar, tamanhoPorMedida } from './grade'
import {
  GRADE_PADRAO,
  adicionarToken,
  cenaNova,
  definirFundo,
  dimensoesReduzidas,
  editarToken,
  enquadrar,
  mudarGrade,
  mudarMedida,
  moverToken,
  normalizarCena,
  pontoDeEntrada,
  removerToken,
  tokenEm,
} from './operacoes'
import { RepositorioBatalhaMemoria } from './repositorio'
import { medir, numero } from './regua'
import type { Grade, Medida, TipoGrade } from './tipos'

const grade = (tipo: TipoGrade, extra: Partial<Grade> = {}): Grade => ({ ...GRADE_PADRAO, tipo, tamanho: 100, x: 0, y: 0, ...extra })
const medida: Medida = { valorPorCelula: 1.5, unidade: 'm', diagonal: 'simples' }

describe('grade quadrada', () => {
  const g = grade('quadrada', { x: 10, y: 20 })

  it('acha a célula de um ponto, inclusive antes da origem', () => {
    expect(celulaEm(g, { x: 10, y: 20 })).toEqual({ q: 0, r: 0 })
    expect(celulaEm(g, { x: 109, y: 119 })).toEqual({ q: 0, r: 0 })
    expect(celulaEm(g, { x: 111, y: 20 })).toEqual({ q: 1, r: 0 })
    expect(celulaEm(g, { x: 9, y: 19 })).toEqual({ q: -1, r: -1 })
  })

  it('o centro da célula volta para a mesma célula', () => {
    for (const c of [{ q: 0, r: 0 }, { q: 3, r: -2 }, { q: -4, r: 5 }]) expect(celulaEm(g, centroDaCelula(g, c))).toEqual(c)
    expect(centroDaCelula(g, { q: 0, r: 0 })).toEqual({ x: 60, y: 70 })
  })

  it('encaixa token de tamanho ímpar no centro e de tamanho par no cruzamento', () => {
    expect(encaixar(g, { x: 90, y: 40 }, 1)).toEqual({ x: 60, y: 70 })
    expect(encaixar(g, { x: 90, y: 40 }, 2)).toEqual({ x: 110, y: 20 })
    expect(encaixar(g, { x: 90, y: 40 }, 3)).toEqual({ x: 60, y: 70 })
    expect(encaixar(g, { x: 90, y: 40 }, 0.5)).toEqual({ x: 60, y: 70 })
  })

  it('contorno com quatro cantos', () => {
    expect(cantosDaCelula(g, { q: 1, r: 0 })).toEqual([
      { x: 110, y: 20 },
      { x: 210, y: 20 },
      { x: 210, y: 120 },
      { x: 110, y: 120 },
    ])
  })

  it('lista as células de uma janela, e nenhuma se forem demais', () => {
    expect(celulasNaJanela(g, 10, 20, 209, 120)).toHaveLength(4)
    expect(celulasNaJanela(g, 0, 0, 1e6, 1e6)).toEqual([])
  })
})

describe('distância na grade quadrada', () => {
  const g = grade('quadrada')
  const d = (dq: number, dr: number, regra: Medida['diagonal']) => distanciaEmCelulas(g, { q: 0, r: 0 }, { q: dq, r: dr }, regra)

  it('simples: a diagonal vale 1', () => {
    expect(d(3, 3, 'simples')).toBe(3)
    expect(d(5, 2, 'simples')).toBe(5)
  })
  it('alternada: 1, 2, 1, 2', () => {
    expect(d(1, 1, 'alternada')).toBe(1)
    expect(d(2, 2, 'alternada')).toBe(3)
    expect(d(4, 4, 'alternada')).toBe(6)
    expect(d(5, 2, 'alternada')).toBe(6)
  })
  it('euclidiana: a reta de verdade', () => {
    expect(d(3, 4, 'euclidiana')).toBe(5)
  })
})

describe.each<TipoGrade>(['hex-pontudo', 'hex-chato'])('grade %s', (tipo) => {
  const g = grade(tipo, { x: 30, y: -20 })

  it('o centro de cada célula volta para ela mesma', () => {
    for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) expect(celulaEm(g, centroDaCelula(g, { q, r }))).toEqual({ q, r })
  })

  it('os seis vizinhos ficam a uma distância de 1 e a um tamanho de distância no desenho', () => {
    const origem = centroDaCelula(g, { q: 0, r: 0 })
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
      expect(distanciaEmCelulas(g, { q: 0, r: 0 }, { q: dq, r: dr }, 'simples')).toBe(1)
      const c = centroDaCelula(g, { q: dq, r: dr })
      expect(Math.hypot(c.x - origem.x, c.y - origem.y)).toBeCloseTo(100, 6)
    }
  })

  it('distância hexagonal', () => {
    expect(distanciaEmCelulas(g, { q: 0, r: 0 }, { q: 2, r: 1 }, 'simples')).toBe(3)
    expect(distanciaEmCelulas(g, { q: 0, r: 0 }, { q: 2, r: -2 }, 'simples')).toBe(2)
    // Diagonal não existe: a regra é ignorada.
    expect(distanciaEmCelulas(g, { q: 0, r: 0 }, { q: 3, r: 0 }, 'euclidiana')).toBe(3)
  })

  it('o encaixe leva ao centro da célula, qualquer que seja o tamanho do token', () => {
    const c = centroDaCelula(g, { q: 1, r: 2 })
    expect(encaixar(g, { x: c.x + 7, y: c.y - 5 }, 1)).toEqual(c)
    expect(encaixar(g, { x: c.x + 7, y: c.y - 5 }, 2)).toEqual(c)
  })

  it('o contorno tem seis cantos a um raio do centro', () => {
    const cantos = cantosDaCelula(g, { q: 0, r: 0 })
    const centro = centroDaCelula(g, { q: 0, r: 0 })
    expect(cantos).toHaveLength(6)
    for (const k of cantos) expect(Math.hypot(k.x - centro.x, k.y - centro.y)).toBeCloseTo(100 / Math.sqrt(3), 6)
  })

  it('a janela cobre as células que aparecem nela', () => {
    const celulas = celulasNaJanela(g, -300, -300, 300, 300)
    const chaves = new Set(celulas.map((c) => `${c.q},${c.r}`))
    for (let x = -280; x <= 280; x += 40) for (let y = -280; y <= 280; y += 40) {
      const c = celulaEm(g, { x, y })!
      expect(chaves.has(`${c.q},${c.r}`)).toBe(true)
    }
  })
})

describe('sem grade', () => {
  const g = grade('nenhuma')
  it('não há células e o encaixe não mexe', () => {
    expect(celulaEm(g, { x: 5, y: 5 })).toBeNull()
    expect(encaixar(g, { x: 5.5, y: 7 }, 1)).toEqual({ x: 5.5, y: 7 })
    expect(celulasNaJanela(g, 0, 0, 100, 100)).toEqual([])
  })
})

describe('régua', () => {
  it('na quadrada, mede pelas células e desenha de centro a centro', () => {
    const m = medir(grade('quadrada'), medida, { x: 50, y: 50 }, { x: 350, y: 50 })
    expect(m.celulas).toBe(3)
    expect(m.valor).toBe(4.5)
    expect(m.texto).toBe('3 células, 4,5 m')
    expect(m.de).toEqual({ x: 50, y: 50 })
    expect(m.ate).toEqual({ x: 350, y: 50 })
  })

  it('uma célula é no singular', () => {
    expect(medir(grade('quadrada'), medida, { x: 50, y: 50 }, { x: 150, y: 50 }).texto).toBe('1 célula, 1,5 m')
  })

  it('sem unidade, só as células', () => {
    expect(medir(grade('quadrada'), { ...medida, unidade: '' }, { x: 50, y: 50 }, { x: 250, y: 50 }).texto).toBe('2 células')
  })

  it('a regra da diagonal vale na quadrada', () => {
    const a = { x: 50, y: 50 }
    const b = { x: 450, y: 450 }
    expect(medir(grade('quadrada'), { ...medida, diagonal: 'alternada' }, a, b).celulas).toBe(6)
    expect(medir(grade('quadrada'), { ...medida, diagonal: 'simples' }, a, b).celulas).toBe(4)
  })

  it('no hexágono, conta células hexagonais', () => {
    const g = grade('hex-pontudo')
    const b = centroDaCelula(g, { q: 2, r: 1 })
    expect(medir(g, medida, centroDaCelula(g, { q: 0, r: 0 }), b).celulas).toBe(3)
  })

  it('sem grade, mede em linha reta pelo tamanho de referência', () => {
    const m = medir(grade('nenhuma'), medida, { x: 0, y: 0 }, { x: 150, y: 0 })
    expect(m.celulas).toBe(1.5)
    expect(m.texto).toBe('1,5 células, 2,3 m')
  })

  it('formata número com vírgula e sem zero sobrando', () => {
    expect(numero(2)).toBe('2')
    expect(numero(2.04)).toBe('2')
    expect(numero(2.25)).toBe('2,3')
  })

  it('calibrar: a distância medida dividida pelas células dá o tamanho', () => {
    expect(tamanhoPorMedida(350, 5)).toBe(70)
    expect(tamanhoPorMedida(350, 0)).toBe(0)
  })
})

describe('cena', () => {
  it('a cena nova tem grade quadrada, encaixe ligado e nenhum token', () => {
    const c = cenaNova()
    expect(c).toMatchObject({ fundo: null, encaixar: true, tokens: [] })
    expect(c.grade.tipo).toBe('quadrada')
  })

  it('as operações não alteram a cena original', () => {
    const c = cenaNova()
    const { cena: c2, token } = adicionarToken(c, { x: 10, y: 10 }, 'a')
    expect(c.tokens).toHaveLength(0)
    expect(c2.tokens).toHaveLength(1)
    const c3 = moverToken(c2, token!.id, { x: 99, y: 5 })
    expect(c2.tokens[0].x).toBe(10)
    expect(c3.tokens[0]).toMatchObject({ x: 99, y: 5 })
  })

  it('cada token novo pega a próxima cor e um nome', () => {
    let c = cenaNova()
    c = adicionarToken(c, { x: 0, y: 0 }, 'a').cena
    c = adicionarToken(c, { x: 0, y: 0 }, 'b').cena
    expect(c.tokens[0].cor).not.toBe(c.tokens[1].cor)
    expect(c.tokens[1].nome).toBe('Token 2')
  })

  it('edição valida: tamanho de token e cor ruim são corrigidos', () => {
    let c = adicionarToken(cenaNova(), { x: 0, y: 0 }, 'a').cena
    c = editarToken(c, 'a', { tamanho: 99, cor: 'vermelho', nome: 'x'.repeat(100) })
    expect(c.tokens[0].tamanho).toBe(10)
    expect(c.tokens[0].cor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(c.tokens[0].nome).toHaveLength(40)
  })

  it('remove o token', () => {
    let c = adicionarToken(cenaNova(), { x: 0, y: 0 }, 'a').cena
    c = removerToken(c, 'a')
    expect(c.tokens).toEqual([])
  })

  it('acha o token mais de cima sob o ponto, e nenhum fora', () => {
    let c = cenaNova()
    c = adicionarToken(c, { x: 100, y: 100 }, 'baixo').cena
    c = adicionarToken(c, { x: 110, y: 100 }, 'cima').cena
    expect(tokenEm(c, { x: 105, y: 100 })?.id).toBe('cima')
    expect(tokenEm(c, { x: 70, y: 100 })?.id).toBe('baixo')
    expect(tokenEm(c, { x: 300, y: 300 })).toBeNull()
  })

  it('o ponto de entrada de um token novo é o centro da célula', () => {
    expect(pontoDeEntrada(cenaNova(), { x: 10, y: 10 })).toEqual({ x: 35, y: 35 })
    expect(pontoDeEntrada(mudarGrade(cenaNova(), { tipo: 'nenhuma' }), { x: 10, y: 10 })).toEqual({ x: 10, y: 10 })
  })

  it('a grade e a medida são corrigidas quando saem da faixa', () => {
    const c = mudarMedida(mudarGrade(cenaNova(), { tamanho: 1, opacidade: 5, x: 1e12 }), { valorPorCelula: -3, unidade: 'quilômetros por célula' })
    expect(c.grade.tamanho).toBe(8)
    expect(c.grade.opacidade).toBe(1)
    expect(c.grade.x).toBe(1_000_000)
    expect(c.medida.valorPorCelula).toBe(1.5)
    expect(c.medida.unidade).toHaveLength(12)
  })

  it('o fundo ruim vira nenhum fundo', () => {
    expect(definirFundo(cenaNova(), { largura: 0, altura: 10 }).fundo).toBeNull()
    expect(definirFundo(cenaNova(), { largura: 800, altura: 600 }).fundo).toEqual({ largura: 800, altura: 600 })
  })

  it('enquadra a imagem inteira, e sem imagem fica na origem', () => {
    const cam = enquadrar({ largura: 2000, altura: 1000 }, 1000, 1000)
    expect(cam.x).toBe(1000)
    expect(cam.y).toBe(500)
    expect(cam.zoom).toBeCloseTo(0.475, 6)
    expect(enquadrar(null, 800, 600)).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('reduz o lado maior sem aumentar', () => {
    expect(dimensoesReduzidas(8000, 4000, 4000)).toEqual({ largura: 4000, altura: 2000 })
    expect(dimensoesReduzidas(1000, 500, 4000)).toEqual({ largura: 1000, altura: 500 })
  })
})

describe('dados de fora', () => {
  it('cena que não é objeto ou não tem id é recusada', () => {
    expect(normalizarCena(null)).toBeNull()
    expect(normalizarCena({ nome: 'x' })).toBeNull()
    expect(normalizarCena('lixo')).toBeNull()
  })

  it('completa o que falta e descarta token quebrado ou repetido', () => {
    const c = normalizarCena({
      id: 'p',
      grade: { tipo: 'hex-chato', tamanho: 'grande' },
      tokens: [{ id: 'a', x: 1, y: 2 }, { id: 'a', x: 5, y: 5 }, { x: 1, y: 1 }, 'lixo', { id: 'b', x: NaN, y: 0 }],
    })
    expect(c?.grade).toMatchObject({ tipo: 'hex-chato', tamanho: GRADE_PADRAO.tamanho })
    expect(c?.tokens.map((t) => t.id)).toEqual(['a'])
    expect(c?.tokens[0].x).toBe(1)
    expect(c?.encaixar).toBe(true)
  })

  it('limita a quantidade de tokens', () => {
    const tokens = Array.from({ length: 300 }, (_, i) => ({ id: `t${i}`, x: i, y: 0 }))
    expect(normalizarCena({ id: 'p', tokens })?.tokens).toHaveLength(200)
  })
})

describe('repositório em memória', () => {
  it('guarda a cena e a imagem, e devolve cópias', async () => {
    const repo = new RepositorioBatalhaMemoria()
    expect(await repo.carregar('p')).toEqual({ cena: null, imagem: null })
    const cena = cenaNova('p')
    await repo.salvarCena(cena)
    cena.nome = 'mudou depois'
    const imagem = new Blob(['x'])
    await repo.salvarImagem('p', imagem)
    const lido = await repo.carregar('p')
    expect(lido.cena?.nome).toBe('Batalha')
    expect(lido.imagem).toBe(imagem)
    await repo.salvarImagem('p', null)
    expect((await repo.carregar('p')).imagem).toBeNull()
  })
})
