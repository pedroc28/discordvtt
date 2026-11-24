// A camada do mestre: operações puras, e o controlador de um mestre contra um repositório que entrega a
// camada, como o RepositorioPocketBase. Jogador não recebe nada disso.

import { describe, expect, it } from 'vitest'
import { ArmazemMapa } from './armazem'
import { ArmazemNotas } from './camada-mestre'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { hexagonoNovo, mudancaNota, mudancasOcultar, mudancasRevelar, reverterLote } from './operacoes'
import { RepositorioMemoria, temCamadaMestre } from './repositorio'
import type { Hexagono, Lote, NotaPrivada } from './tipos'

const ck = chaveChunk({ q: 0, r: 0 })
const pos = { q: 0, r: 0 }

/** Repositório de mestre: guarda a camada dele e a entrega por chunk, como o do servidor. */
class RepositorioDoMestre extends RepositorioMemoria {
  readonly ehMestre = true
  ocultos: Hexagono[] = []
  notas: NotaPrivada[] = []
  enviados: Lote[] = []
  async carregarChunkOculto(): Promise<Hexagono[]> {
    return structuredClone(this.ocultos)
  }
  async carregarNotasPrivadas(): Promise<NotaPrivada[]> {
    return structuredClone(this.notas)
  }
  override async aplicar(lote: Lote): Promise<void> {
    this.enviados.push(lote)
  }
}

async function mestre(repo = new RepositorioDoMestre()) {
  const c = new ControladorMapa(repo, 'gm', { reaplicarPendentes: true })
  await c.garantirChunk(ck)
  return { c, repo }
}

describe('operações da camada do mestre', () => {
  it('ocultar tira o hexágono do público e o guarda igual na camada oculta', () => {
    const publico = new ArmazemMapa()
    publico.definirChunk(ck, [{ ...hexagonoNovo(0, 0, 'floresta'), nome: 'Bosque', rev: 4 }])
    const ocultos = new ArmazemMapa()
    ocultos.definirChunk(ck, [])
    const { mudancas, ocultos: novos } = mudancasOcultar(publico, ocultos, [pos])
    expect(mudancas).toEqual([{ q: 0, r: 0, antes: expect.objectContaining({ terreno: 'floresta' }), depois: null }])
    expect(novos[0].antes).toBeNull()
    expect(novos[0].depois).toMatchObject({ terreno: 'floresta', nome: 'Bosque', rev: 1 })
  })

  it('ocultar pula posição vazia e posição que já tem oculto', () => {
    const publico = new ArmazemMapa()
    publico.definirChunk(ck, [hexagonoNovo(1, 0, 'floresta')])
    const ocultos = new ArmazemMapa()
    ocultos.definirChunk(ck, [hexagonoNovo(1, 0, 'deserto')])
    expect(mudancasOcultar(publico, ocultos, [pos, { q: 1, r: 0 }])).toEqual({ mudancas: [], ocultos: [] })
  })

  it('revelar põe o oculto no público, no lugar do que havia, e o tira da camada oculta', () => {
    const publico = new ArmazemMapa()
    publico.definirChunk(ck, [{ ...hexagonoNovo(0, 0, 'planicie'), rev: 3 }])
    const ocultos = new ArmazemMapa()
    ocultos.definirChunk(ck, [hexagonoNovo(0, 0, 'ruinas')])
    const { mudancas, ocultos: saida } = mudancasRevelar(publico, ocultos, [pos])
    expect(mudancas[0].antes?.terreno).toBe('planicie')
    expect(mudancas[0].depois).toMatchObject({ terreno: 'ruinas', rev: 4 })
    expect(saida[0].depois).toBeNull()
    expect(saida[0].antes?.terreno).toBe('ruinas')
  })

  it('nota: texto novo sobe a revisão, texto igual não muda, texto vazio apaga', () => {
    const notas = new ArmazemNotas()
    notas.definirChunk(ck, [{ q: 0, r: 0, texto: 'ladrão aqui', rev: 2 }])
    expect(mudancaNota(notas, 0, 0, 'ladrão aqui')).toBeNull()
    expect(mudancaNota(notas, 0, 0, 'ladrão e cúmplice')?.depois).toMatchObject({ texto: 'ladrão e cúmplice', rev: 3 })
    expect(mudancaNota(notas, 0, 0, '')).toMatchObject({ depois: null })
    expect(mudancaNota(notas, 5, 5, '')).toBeNull()
    expect(mudancaNota(notas, 5, 5, 'nova')?.depois).toMatchObject({ rev: 1 })
  })

  it('reverter um lote com parte privada desfaz ocultos e notas, e pula o que outra pessoa mexeu', () => {
    const publico = new ArmazemMapa()
    publico.definirChunk(ck, [])
    const ocultos = new ArmazemMapa()
    ocultos.definirChunk(ck, [hexagonoNovo(0, 0, 'ruinas'), hexagonoNovo(1, 0, 'ruinas')])
    const notas = new ArmazemNotas()
    notas.definirChunk(ck, [{ q: 0, r: 0, texto: 'x', rev: 1 }])
    const original: Lote = {
      id: 'a',
      autor: 'gm',
      ts: 0,
      mudancas: [],
      regioes: [],
      privado: {
        ocultos: [
          { q: 0, r: 0, antes: null, depois: hexagonoNovo(0, 0, 'ruinas') },
          { q: 1, r: 0, antes: null, depois: hexagonoNovo(1, 0, 'floresta') }, // outro mestre trocou o terreno depois
        ],
        notas: [{ q: 0, r: 0, antes: null, depois: { q: 0, r: 0, texto: 'x', rev: 1 } }],
      },
    }
    const { lote, conflitos } = reverterLote(publico, original, { id: 'b', autor: 'gm', ts: 1 }, { ocultos, notas })
    expect(conflitos).toBe(1)
    expect(lote?.privado?.ocultos).toHaveLength(1)
    expect(lote?.privado?.ocultos[0]).toMatchObject({ q: 0, r: 0, depois: null })
    expect(lote?.privado?.notas[0]).toMatchObject({ q: 0, r: 0, depois: null })
  })
})

describe('controlador do mestre', () => {
  it('só o repositório de mestre ganha a camada: jogador não tem nada para ver nem para editar', async () => {
    expect(temCamadaMestre(new RepositorioMemoria())).toBe(false)
    expect(temCamadaMestre(new RepositorioDoMestre())).toBe(true)
    const jogador = new ControladorMapa(new RepositorioMemoria(), 'ana')
    await jogador.garantirChunk(ck)
    expect(jogador.mestre).toBeNull()
    expect(jogador.editarNota(0, 0, 'espiar')).toBeNull()
    expect(jogador.ocultar([pos])).toBe(0)
    // Mesmo pedindo a camada oculta, a pincelada do jogador é pública.
    const t = jogador.iniciarTraco('oculta')
    t.pintar([pos], 'floresta')
    t.confirmar()
    expect(jogador.armazem.ler(0, 0)?.terreno).toBe('floresta')
  })

  it('carrega a camada junto com o chunk', async () => {
    const repo = new RepositorioDoMestre()
    repo.ocultos = [hexagonoNovo(3, 3, 'ruinas')]
    repo.notas = [{ q: 3, r: 3, texto: 'cofre', rev: 1 }]
    const { c } = await mestre(repo)
    expect(c.mestre?.ocultos.ler(3, 3)?.terreno).toBe('ruinas')
    expect(c.mestre?.notas.ler(3, 3)?.texto).toBe('cofre')
  })

  it('se a camada falha, o chunk inteiro espera e não aceita edição', async () => {
    const repo = new RepositorioDoMestre()
    repo.carregarNotasPrivadas = async () => {
      throw new Error('sem rede')
    }
    const c = new ControladorMapa(repo, 'gm')
    c.aoErro = () => {}
    await c.garantirChunk(ck)
    c.destruir()
    expect(c.armazem.temChunk(ck)).toBe(false)
    expect(c.editarNota(0, 0, 'x')).toBeNull()
  })

  it('pintar na camada oculta manda só a parte privada e não aparece no público', async () => {
    const { c, repo } = await mestre()
    const t = c.iniciarTraco('oculta')
    t.pintar([pos], 'ruinas')
    const lote = t.confirmar()!
    expect(c.armazem.ler(0, 0)).toBeNull()
    expect(c.mestre!.ocultos.ler(0, 0)?.terreno).toBe('ruinas')
    expect(lote.mudancas).toEqual([])
    expect(lote.privado?.ocultos).toHaveLength(1)
    expect(repo.enviados).toHaveLength(1)
  })

  it('região, rio e estrada não agem na camada oculta', async () => {
    const { c } = await mestre()
    const t = c.iniciarTraco('oculta')
    t.regiao([pos], 'x')
    t.rio([{ q: 0, r: 0, d: 0 }], true)
    t.estrada([{ q: 0, r: 0, d: 0 }], true)
    expect(t.vazio).toBe(true)
  })

  it('ocultar e revelar são lotes únicos, e desfazer volta ao estado anterior', async () => {
    const { c, repo } = await mestre()
    const t = c.iniciarTraco()
    t.pintar([pos], 'floresta')
    t.confirmar()

    expect(c.ocultar([pos])).toBe(1)
    expect(c.armazem.ler(0, 0)).toBeNull()
    expect(c.mestre!.ocultos.ler(0, 0)?.terreno).toBe('floresta')
    const lote = repo.enviados[repo.enviados.length - 1]
    expect(lote.mudancas).toHaveLength(1)
    expect(lote.privado?.ocultos).toHaveLength(1)

    c.desfazer()
    expect(c.armazem.ler(0, 0)?.terreno).toBe('floresta')
    expect(c.mestre!.ocultos.ler(0, 0)).toBeNull()

    c.refazer()
    expect(c.armazem.ler(0, 0)).toBeNull()
    expect(c.mestre!.ocultos.ler(0, 0)).not.toBeNull()

    expect(c.revelar([pos])).toBe(1)
    expect(c.armazem.ler(0, 0)?.terreno).toBe('floresta')
    expect(c.mestre!.ocultos.ler(0, 0)).toBeNull()
  })

  it('nota: digitar em sequência vira um passo só no desfazer, e some com texto vazio', async () => {
    const { c, repo } = await mestre()
    c.editarNota(0, 0, 'a', 'g')
    c.editarNota(0, 0, 'ab', 'g')
    c.editarNota(0, 0, 'abc', 'g')
    expect(c.mestre!.notas.ler(0, 0)?.texto).toBe('abc')
    expect(repo.enviados).toHaveLength(3)
    c.desfazer()
    expect(c.mestre!.notas.ler(0, 0)).toBeNull()
    expect(c.podeDesfazer).toBe(false)
    c.editarNota(0, 0, 'x')
    c.editarNota(0, 0, '')
    expect(c.mestre!.notas.ler(0, 0)).toBeNull()
  })

  it('o lote do mestre que volta em dois pedaços é todo eco, e o lote de outro mestre aplica a parte privada', async () => {
    const { c } = await mestre()
    c.editarNota(0, 0, 'minha')
    // O pedaço privado do eco do meu próprio lote volta com o mesmo id.
    const proprio = (c as unknown as { naoVoltaram: Lote[] }).naoVoltaram[0]
    c.receber({ ...proprio, mudancas: [], regioes: [] })
    expect(c.mestre!.notas.ler(0, 0)?.texto).toBe('minha')

    // Outro mestre escreve uma nota em outra posição.
    c.receber({
      id: 'outro',
      autor: 'gm2',
      ts: 0,
      mudancas: [],
      regioes: [],
      privado: { ocultos: [], notas: [{ q: 2, r: 2, antes: null, depois: { q: 2, r: 2, texto: 'do outro', rev: 1 } }] },
    })
    expect(c.mestre!.notas.ler(2, 2)?.texto).toBe('do outro')
  })

  it('lote privado que chega com o chunk carregando entra quando ele chega', async () => {
    const repo = new RepositorioDoMestre()
    const c = new ControladorMapa(repo, 'gm')
    const carregando = c.garantirChunk(ck)
    c.receber({
      id: 'x',
      autor: 'gm2',
      ts: 0,
      mudancas: [],
      regioes: [],
      privado: { ocultos: [{ q: 1, r: 1, antes: null, depois: hexagonoNovo(1, 1, 'ruinas') }], notas: [] },
    })
    await carregando
    expect(c.mestre!.ocultos.ler(1, 1)?.terreno).toBe('ruinas')
  })

  it('edição recusada pelo servidor desfaz também a parte privada', async () => {
    const repo = new RepositorioDoMestre()
    repo.aplicar = () => Promise.reject(new Error('o servidor recusou: sem permissão.'))
    const { c } = await mestre(repo)
    c.aoErro = () => {}
    c.editarNota(0, 0, 'segredo')
    expect(c.mestre!.notas.ler(0, 0)?.texto).toBe('segredo')
    await new Promise((r) => setTimeout(r, 0))
    expect(c.mestre!.notas.ler(0, 0)).toBeNull()
  })
})
