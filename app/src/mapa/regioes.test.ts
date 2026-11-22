import { describe, expect, it } from 'vitest'
import { normalizarRegiao } from './armazenamento'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { arvoreDeRegioes, mudancaEditarRegiao, podeSerPai, raizDaRegiao, regiaoNova } from './operacoes'
import { RepositorioMemoria } from './repositorio'
import { ArmazemMapa } from './armazem'

const origem = { q: 0, r: 0 }
const ck = chaveChunk(origem)
const esperar = () => new Promise((r) => setTimeout(r, 0))

async function cliente(repo: RepositorioMemoria, autor: string) {
  const c = new ControladorMapa(repo, autor)
  await c.garantirChunk(ck)
  await c.carregarRegioes()
  return c
}

function pintar(c: ControladorMapa, hexes: { q: number; r: number }[], terreno = 'planicie') {
  const t = c.iniciarTraco()
  t.pintar(hexes, terreno)
  t.confirmar()
}

describe('editar hexágono', () => {
  it('altera nome, nota e marcadores e sobe a revisão', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    pintar(c, [origem])
    c.editarHexagono(0, 0, { nome: 'Vila do Rio', nota: 'Tem uma taverna.', marcadores: [{ id: 'm1', tipo: 'vila', nome: 'Rio' }] })
    expect(c.armazem.ler(0, 0)).toMatchObject({
      nome: 'Vila do Rio',
      nota: 'Tem uma taverna.',
      marcadores: [{ id: 'm1', tipo: 'vila', nome: 'Rio' }],
      rev: 2,
    })
  })

  it('não faz nada em hexágono vazio ou quando nada mudou', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    expect(c.editarHexagono(0, 0, { nome: 'X' })).toBeNull()
    pintar(c, [origem])
    expect(c.editarHexagono(0, 0, { nome: '' })).toBeNull()
  })

  it('digitar em sequência (mesmo grupo) vira um passo só no desfazer', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    pintar(c, [origem])
    c.editarHexagono(0, 0, { nota: 'A' }, 'nota:0,0')
    c.editarHexagono(0, 0, { nota: 'Ab' }, 'nota:0,0')
    c.editarHexagono(0, 0, { nota: 'Abc' }, 'nota:0,0')
    expect(c.armazem.ler(0, 0)?.nota).toBe('Abc')
    c.desfazer()
    expect(c.armazem.ler(0, 0)?.nota).toBe('')
    expect(c.armazem.ler(0, 0)).not.toBeNull() // o hexágono continua lá: só a nota voltou
  })

  it('grupos diferentes ficam em passos diferentes', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    pintar(c, [origem])
    c.editarHexagono(0, 0, { nome: 'Vila' }, 'nome:0,0')
    c.editarHexagono(0, 0, { nota: 'Nota' }, 'nota:0,0')
    c.desfazer()
    expect(c.armazem.ler(0, 0)).toMatchObject({ nome: 'Vila', nota: '' })
  })

  it('desfazer uma edição não apaga o que outra pessoa escreveu depois', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    pintar(ana, [origem])
    await esperar()
    ana.editarHexagono(0, 0, { nome: 'Ana' })
    await esperar()
    beto.editarHexagono(0, 0, { nome: 'Beto' })
    await esperar()
    expect(ana.armazem.ler(0, 0)?.nome).toBe('Beto')
    expect(ana.desfazer()).toBe(1)
    expect(ana.armazem.ler(0, 0)?.nome).toBe('Beto')
  })
})

describe('regiões', () => {
  it('cria, edita e exclui, e o desfazer devolve cada passo', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    const id = c.criarRegiao({ nome: 'Reino do Norte', cor: '#3f7fd9' })!
    expect(c.armazem.lerRegiao(id)).toMatchObject({ nome: 'Reino do Norte', cor: '#3f7fd9', paiId: null, rev: 1 })

    c.editarRegiao(id, { nome: 'Reino do Sul' })
    expect(c.armazem.lerRegiao(id)?.nome).toBe('Reino do Sul')

    c.excluirRegiao(id)
    expect(c.armazem.lerRegiao(id)).toBeNull()

    c.desfazer()
    expect(c.armazem.lerRegiao(id)?.nome).toBe('Reino do Sul')
    c.desfazer()
    expect(c.armazem.lerRegiao(id)?.nome).toBe('Reino do Norte')
    c.desfazer()
    expect(c.armazem.lerRegiao(id)).toBeNull()
  })

  it('só cria região depois que as regiões carregaram', () => {
    const c = new ControladorMapa(new RepositorioMemoria(), 'ana')
    expect(c.criarRegiao({ nome: 'X', cor: '#000000' })).toBeNull()
  })

  it('pintar região só atinge hexágonos que existem', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    pintar(c, [origem, { q: 1, r: 0 }])
    const id = c.criarRegiao({ nome: 'R', cor: '#e0524d' })!
    const t = c.iniciarTraco()
    t.regiao([origem, { q: 1, r: 0 }, { q: 5, r: 5 }], id)
    t.confirmar()
    expect(c.armazem.ler(0, 0)?.regiaoId).toBe(id)
    expect(c.armazem.ler(1, 0)?.regiaoId).toBe(id)
    expect(c.armazem.ler(5, 5)).toBeNull()
    c.desfazer()
    expect(c.armazem.ler(0, 0)?.regiaoId).toBeNull()
  })

  it('apagar a região deixa os hexágonos apontando para um id vazio, e desfazer traz tudo de volta', async () => {
    const c = await cliente(new RepositorioMemoria(), 'ana')
    pintar(c, [origem])
    const id = c.criarRegiao({ nome: 'R', cor: '#e0524d' })!
    const t = c.iniciarTraco()
    t.regiao([origem], id)
    t.confirmar()
    c.excluirRegiao(id)
    expect(c.armazem.lerRegiao(id)).toBeNull()
    expect(c.armazem.ler(0, 0)?.regiaoId).toBe(id) // não reescrito: conta como "sem região"
    c.desfazer()
    expect(c.armazem.lerRegiao(id)?.nome).toBe('R')
  })

  it('a região criada por um jogador aparece no outro, e quem entra depois a carrega', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    const id = ana.criarRegiao({ nome: 'Compartilhada', cor: '#4aa564' })!
    await esperar()
    expect(beto.armazem.lerRegiao(id)?.nome).toBe('Compartilhada')
    const carla = await cliente(repo, 'carla')
    expect(carla.armazem.lerRegiao(id)?.nome).toBe('Compartilhada')
  })

  it('desfazer não desfaz região que outra pessoa renomeou depois', async () => {
    const repo = new RepositorioMemoria()
    const ana = await cliente(repo, 'ana')
    const beto = await cliente(repo, 'beto')
    const id = ana.criarRegiao({ nome: 'A', cor: '#4aa564' })!
    await esperar()
    beto.editarRegiao(id, { nome: 'B' })
    await esperar()
    expect(ana.desfazer()).toBe(1)
    expect(ana.armazem.lerRegiao(id)?.nome).toBe('B')
  })

  it('lote de região que chega enquanto as regiões carregam não se perde', async () => {
    const repo = new RepositorioMemoria(10)
    const ana = await cliente(repo, 'ana')
    const beto = new ControladorMapa(repo, 'beto')
    const carregando = beto.carregarRegioes()
    const id = ana.criarRegiao({ nome: 'Atrasada', cor: '#d9a53f' })!
    beto.receber({ id: 'y', autor: 'ana', ts: 0, mudancas: [], regioes: [{ id, antes: null, depois: regiaoNova(id, { nome: 'Atrasada', cor: '#d9a53f' }) }] })
    await carregando
    expect(beto.armazem.lerRegiao(id)?.nome).toBe('Atrasada')
  })
})

describe('hierarquia', () => {
  function arvore() {
    const a = new ArmazemMapa()
    a.definirRegioes([
      regiaoNova('reino', { nome: 'Reino', cor: '#000000' }),
      regiaoNova('provincia', { nome: 'Província', cor: '#000000', paiId: 'reino' }),
      regiaoNova('distrito', { nome: 'Distrito', cor: '#000000', paiId: 'provincia' }),
    ])
    return a
  }

  it('acha a região de topo', () => {
    const a = arvore()
    expect(raizDaRegiao(a, 'distrito')).toBe('reino')
    expect(raizDaRegiao(a, 'reino')).toBe('reino')
    expect(raizDaRegiao(a, 'nao-existe')).toBeNull()
    expect(raizDaRegiao(a, null)).toBeNull()
  })

  it('não aceita ciclo', () => {
    const a = arvore()
    expect(podeSerPai(a, 'reino', 'distrito')).toBe(false)
    expect(podeSerPai(a, 'reino', 'reino')).toBe(false)
    expect(podeSerPai(a, 'distrito', 'reino')).toBe(true)
    expect(mudancaEditarRegiao(a, 'reino', { paiId: 'distrito' })).toBeNull()
  })

  it('pai que foi excluído conta como topo', () => {
    const a = arvore()
    a.aplicarRegioes([{ id: 'reino', antes: a.lerRegiao('reino'), depois: null }])
    expect(raizDaRegiao(a, 'distrito')).toBe('provincia')
  })
})

describe('árvore de regiões', () => {
  const nova = (id: string, nome: string, paiId: string | null = null) => regiaoNova(id, { nome, cor: '#000000', paiId })

  it('põe cada região depois do pai, com recuo, e irmãs em ordem alfabética', () => {
    const lista = [nova('c', 'Costa'), nova('a', 'Alto Vale', 'r'), nova('r', 'Reino'), nova('b', 'Baixo Vale', 'r'), nova('d', 'Aldeia', 'a')]
    expect(arvoreDeRegioes(lista).map((x) => [x.regiao.nome, x.nivel])).toEqual([
      ['Costa', 0],
      ['Reino', 0],
      ['Alto Vale', 1],
      ['Aldeia', 2],
      ['Baixo Vale', 1],
    ])
  })

  it('pai inexistente vira região de topo, e ciclo não trava nem some com ninguém', () => {
    const lista = [nova('x', 'X', 'sumiu'), nova('p', 'P', 'q'), nova('q', 'Q', 'p')]
    const r = arvoreDeRegioes(lista)
    expect(r).toHaveLength(3)
    expect(r.find((i) => i.regiao.id === 'x')?.nivel).toBe(0)
  })
})

describe('normalizar região', () => {
  it('completa o que falta e recusa cor inválida', () => {
    expect(normalizarRegiao({ id: 'r', cor: 'vermelho' })).toEqual({
      id: 'r',
      nome: 'Região',
      cor: '#888888',
      descricao: '',
      paiId: null,
      rev: 1,
    })
    expect(normalizarRegiao({ nome: 'sem id' })).toBeNull()
    expect(normalizarRegiao({ id: 'r', paiId: 'r' })?.paiId).toBeNull()
  })
})
