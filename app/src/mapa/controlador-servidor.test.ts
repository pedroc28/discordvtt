// Comportamentos do controlador que só aparecem com um servidor de verdade: lote de outra pessoa que
// chega antes do meu eco, chunk que falha, token sem relógio, edição pendente e recusa.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { hexagonoNovo } from './operacoes'
import { RepositorioMemoria } from './repositorio'
import type { Hexagono, Lote, TokenGrupo } from './tipos'

const ck = chaveChunk({ q: 0, r: 0 })
const outro = (terreno: string, id = 'de-fora'): Lote => ({
  id,
  autor: 'beto',
  ts: 0,
  mudancas: [{ q: 0, r: 0, antes: null, depois: hexagonoNovo(0, 0, terreno) }],
  regioes: [],
})

/** Repositório que não devolve nada sozinho: o teste decide quando o eco chega. */
class RepositorioManual extends RepositorioMemoria {
  enviados: Lote[] = []
  override async aplicar(lote: Lote): Promise<void> {
    this.enviados.push(lote)
  }
}

const terrenoEm = (c: ControladorMapa) => c.armazem.ler(0, 0)?.terreno ?? null

async function cliente(repo: RepositorioMemoria, opcoes = { reaplicarPendentes: true }) {
  const c = new ControladorMapa(repo, 'ana', opcoes)
  await c.garantirChunk(ck)
  return c
}

function pintar(c: ControladorMapa, terreno: string) {
  const t = c.iniciarTraco()
  t.pintar([{ q: 0, r: 0 }], terreno)
  return t.confirmar()!
}

describe('eco e lote de outra pessoa', () => {
  it('lote que o servidor ordenou antes do meu não passa por cima da minha edição', async () => {
    const c = await cliente(new RepositorioManual())
    const meu = pintar(c, 'floresta')
    c.receber(outro('deserto'))
    expect(terrenoEm(c)).toBe('floresta')
    c.receber(meu) // o eco chega depois
    expect(terrenoEm(c)).toBe('floresta')
  })

  it('depois do eco, o lote seguinte de outra pessoa vale', async () => {
    const c = await cliente(new RepositorioManual())
    const meu = pintar(c, 'floresta')
    c.receber(meu)
    c.receber(outro('deserto'))
    expect(terrenoEm(c)).toBe('deserto')
  })

  it('sem reaplicar (mapa local), vale o que chegou', async () => {
    const c = await cliente(new RepositorioManual(), { reaplicarPendentes: false })
    pintar(c, 'floresta')
    c.receber(outro('deserto'))
    expect(terrenoEm(c)).toBe('deserto')
  })

  it('o lote do mestre que volta em dois pedaços com o mesmo id é todo eco', async () => {
    const c = await cliente(new RepositorioManual())
    const meu = pintar(c, 'floresta')
    c.receber(meu)
    c.receber({ ...meu, mudancas: [], regioes: [] }) // o pedaço privado
    c.receber(outro('deserto'))
    expect(terrenoEm(c)).toBe('deserto')
  })
})

describe('edição pendente', () => {
  it('conta pincelada aberta e lote em envio', async () => {
    let soltar: () => void = () => {}
    const repo = new RepositorioMemoria()
    repo.aplicar = () => new Promise<void>((r) => (soltar = r))
    const c = await cliente(repo)
    expect(c.pendente).toBe(false)
    const t = c.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }], 'floresta')
    expect(c.pendente).toBe(true)
    t.confirmar()
    expect(c.pendente).toBe(true)
    soltar()
    await Promise.resolve()
    await Promise.resolve()
    expect(c.pendente).toBe(false)
  })

  it('pincelada cancelada deixa de contar', async () => {
    const c = await cliente(new RepositorioManual())
    const t = c.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }], 'floresta')
    t.cancelar()
    expect(c.pendente).toBe(false)
  })

  it('o servidor recusou: a edição some daqui e do desfazer', async () => {
    const repo = new RepositorioMemoria()
    repo.aplicar = () => Promise.reject(new Error('o servidor recusou: só o mestre edita.'))
    const c = await cliente(repo)
    let msg = ''
    c.aoErro = (m) => (msg = m)
    pintar(c, 'floresta')
    expect(terrenoEm(c)).toBe('floresta')
    await vi.waitFor(() => expect(msg).toContain('só o mestre edita'))
    expect(terrenoEm(c)).toBeNull()
    expect(c.podeDesfazer).toBe(false)
  })
})

describe('chunk que falha', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('não vira vazio, não deixa editar e tenta de novo até chegar', async () => {
    const repo = new RepositorioMemoria()
    const real: Hexagono[] = [hexagonoNovo(0, 0, 'montanha')]
    let falhas = 2
    repo.carregarChunk = async () => {
      if (falhas-- > 0) throw new Error('sem rede')
      return real
    }
    const c = new ControladorMapa(repo, 'ana')
    const erros: string[] = []
    let recuperou = 0
    c.aoErro = (m) => erros.push(m)
    c.aoRecuperar = () => recuperou++

    await c.garantirChunk(ck)
    expect(c.armazem.temChunk(ck)).toBe(false)
    expect(erros).toHaveLength(1)

    // Enquanto espera, pedir de novo não bate no servidor.
    await c.garantirChunk(ck)
    expect(falhas).toBe(1)

    // Não dá para pintar num chunk que não chegou.
    const t = c.iniciarTraco()
    t.pintar([{ q: 0, r: 0 }], 'floresta')
    expect(t.vazio).toBe(true)

    await vi.advanceTimersByTimeAsync(1000) // 1ª nova tentativa falha de novo
    expect(c.armazem.temChunk(ck)).toBe(false)
    await vi.advanceTimersByTimeAsync(2000) // 2ª funciona
    expect(c.armazem.temChunk(ck)).toBe(true)
    expect(terrenoEm(c)).toBe('montanha')
    expect(recuperou).toBe(1)
    c.destruir()
  })

  it('regiões que falham também esperam e voltam', async () => {
    const repo = new RepositorioMemoria()
    let falhas = 1
    repo.carregarRegioes = async () => {
      if (falhas-- > 0) throw new Error('sem rede')
      return []
    }
    const c = new ControladorMapa(repo, 'ana')
    c.aoErro = () => {}
    await c.carregarRegioes()
    expect(c.armazem.regioesProntas).toBe(false)
    expect(c.criarRegiao({ nome: 'x', cor: '#fff' })).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(c.armazem.regioesProntas).toBe(true)
    c.destruir()
  })

  it('destruir para as tentativas', async () => {
    const repo = new RepositorioMemoria()
    const pedido = vi.fn(async (): Promise<Hexagono[]> => {
      throw new Error('sem rede')
    })
    repo.carregarChunk = pedido
    const c = new ControladorMapa(repo, 'ana')
    c.aoErro = () => {}
    await c.garantirChunk(ck)
    c.destruir()
    await vi.advanceTimersByTimeAsync(60000)
    expect(pedido).toHaveBeenCalledTimes(1)
  })
})

describe('token sem relógio', () => {
  const token = (q: number, ts: number, autor = 'beto'): TokenGrupo => ({ q, r: 0, ts, autor })

  it('vale a ordem de chegada, mesmo com o relógio do outro aparelho atrasado', async () => {
    const repo = new RepositorioMemoria()
    const c = new ControladorMapa(repo, 'ana')
    await repo.gravarToken(token(1, 5000))
    expect(c.token?.q).toBe(1)
    await repo.gravarToken(token(2, 1000)) // o relógio do Beto está atrás, mas o aviso chegou depois
    expect(c.token?.q).toBe(2)
  })

  it('o eco de uma posição minha já superada por outra minha não faz o token voltar', () => {
    const repo = new RepositorioManual()
    const c = new ControladorMapa(repo, 'ana')
    c.moverToken({ q: 1, r: 0 })
    const primeiro = c.token!
    c.moverToken({ q: 2, r: 0 })
    // O eco atrasado da primeira posição chega pelo repositório.
    void repo.gravarToken(primeiro)
    expect(c.token?.q).toBe(2)
  })

  it('a leitura inicial não passa por cima de um aviso que chegou enquanto carregava', async () => {
    const repo = new RepositorioMemoria()
    repo.carregarToken = async () => {
      await repo.gravarToken(token(3, 1))
      return token(9, 1)
    }
    const c = new ControladorMapa(repo, 'ana')
    await c.carregarToken()
    expect(c.token?.q).toBe(3)
  })
})
