// Exportar e importar a camada do mestre (hexágonos ocultos e notas privadas).

import { describe, expect, it } from 'vitest'
import { lerArquivo, montarArquivo, nomeDoArquivo, planejarImportacaoMestre } from './arquivo'
import { metaPadrao } from './armazenamento'
import { ArmazemNotas } from './camada-mestre'
import { ArmazemMapa } from './armazem'
import { ControladorMapa } from './controlador'
import { chaveChunk } from './hex'
import { hexagonoNovo } from './operacoes'
import { RepositorioMemoria } from './repositorio'
import type { Hexagono, Lote, NotaPrivada } from './tipos'

const ck = chaveChunk({ q: 0, r: 0 })
const meta = { ...metaPadrao('principal'), tileset: 'pixel' }

/** Repositório de mestre, como o do servidor, com a exportação da camada inteira. */
class RepositorioDoMestre extends RepositorioMemoria {
  readonly ehMestre: boolean
  ocultos: Hexagono[] = []
  notas: NotaPrivada[] = []
  enviados: Lote[] = []
  constructor(mestre = true) {
    super()
    this.ehMestre = mestre
  }
  async carregarChunkOculto(): Promise<Hexagono[]> {
    return structuredClone(this.ocultos)
  }
  async carregarNotasPrivadas(): Promise<NotaPrivada[]> {
    return structuredClone(this.notas)
  }
  async exportarCamadaMestre() {
    return { ocultos: structuredClone(this.ocultos), notas: structuredClone(this.notas) }
  }
  override async aplicar(lote: Lote): Promise<void> {
    this.enviados.push(lote)
  }
}

async function cliente(repo: RepositorioDoMestre) {
  const c = new ControladorMapa(repo, 'gm')
  await c.garantirChunk(ck)
  return c
}

const oculto = (q: number, r: number, terreno = 'ruinas'): Hexagono => ({ ...hexagonoNovo(q, r, terreno), nome: 'Segredo' })
const nota = (q: number, r: number, texto: string): NotaPrivada => ({ q, r, texto, rev: 1 })

describe('arquivo com a camada do mestre', () => {
  it('sem a camada, o arquivo não tem o campo', () => {
    const a = montarArquivo(meta, [], [], null)
    expect('mestre' in a).toBe(false)
  })

  it('com a camada, vai em ordem fixa e volta igual na leitura', () => {
    const a = montarArquivo(meta, [], [], null, new Date(0), { ocultos: [oculto(2, 1), oculto(0, 0)], notas: [nota(3, 0, 'b'), nota(1, 0, 'a')] })
    expect(a.mestre?.ocultos.map((h) => [h.q, h.r])).toEqual([[0, 0], [2, 1]])
    expect(a.mestre?.notas.map((n) => n.texto)).toEqual(['a', 'b'])
    const lido = lerArquivo(JSON.stringify(a))
    expect(lido.ok && lido.arquivo.mestre).toEqual(a.mestre)
    expect(lido.ok && lido.resumo).toMatchObject({ ocultos: 2, notas: 2, descartados: 0 })
  })

  it('itens quebrados da camada do mestre são descartados e contados', () => {
    const texto = JSON.stringify({
      formato: 'mapa-hex',
      versao: 1,
      hexagonos: [],
      mestre: { ocultos: [{ q: 'x' }, oculto(0, 0)], notas: [{ q: 0, r: 0, texto: '' }, nota(1, 1, 'ok'), 'lixo'] },
    })
    const lido = lerArquivo(texto)
    expect(lido.ok && lido.resumo).toMatchObject({ ocultos: 1, notas: 1, descartados: 3 })
  })

  it('o nome do arquivo do mestre é diferente, para não ser confundido com o público', () => {
    const d = new Date('2026-11-24T10:00:00Z')
    expect(nomeDoArquivo('Mundo', d)).toBe('mapa-mundo-2026-11-24.json')
    expect(nomeDoArquivo('Mundo', d, true)).toBe('mapa-mundo-mestre-2026-11-24.json')
  })
})

describe('plano de importação da camada do mestre', () => {
  const ocultosAtuais = () => {
    const a = new ArmazemMapa()
    a.definirChunk(ck, [{ ...oculto(0, 0), rev: 3 }])
    return a
  }
  const notasAtuais = () => {
    const n = new ArmazemNotas()
    n.definirChunk(ck, [nota(0, 0, 'velha')])
    return n
  }

  it('mesclar põe o arquivo por cima e mantém o resto', () => {
    const p = planejarImportacaoMestre(ocultosAtuais(), notasAtuais(), { ocultos: [oculto(1, 0, 'cripta')], notas: [nota(0, 0, 'nova')] }, 'mesclar')
    expect(p.ocultos).toHaveLength(1)
    expect(p.ocultos[0].depois).toMatchObject({ terreno: 'cripta', rev: 2 })
    expect(p.notas[0].depois).toMatchObject({ texto: 'nova', rev: 2 })
    expect(p.ocultosAplicados).toBe(1)
  })

  it('o que já é igual não muda', () => {
    const p = planejarImportacaoMestre(ocultosAtuais(), notasAtuais(), { ocultos: [oculto(0, 0)], notas: [nota(0, 0, 'velha')] }, 'mesclar')
    expect(p.ocultos).toEqual([])
    expect(p.notas).toEqual([])
  })

  it('substituir apaga o que existe e não está no arquivo', () => {
    const existente = { ocultos: [oculto(0, 0), oculto(2, 0)], notas: [nota(0, 0, 'velha'), nota(2, 0, 'outra')] }
    const p = planejarImportacaoMestre(ocultosAtuais(), notasAtuais(), { ocultos: [], notas: [] }, 'substituir', existente)
    expect(p.ocultos.filter((m) => m.depois === null)).toHaveLength(2)
    expect(p.notas.filter((m) => m.depois === null)).toHaveLength(2)
    expect(p.ocultosAplicados).toBe(0)
  })
})

describe('exportar e importar pelo controlador do mestre', () => {
  it('a exportação do mestre leva a camada, a pública não', async () => {
    const repo = new RepositorioDoMestre()
    repo.ocultos = [oculto(1, 0)]
    repo.notas = [nota(1, 0, 'tesouro')]
    const c = await cliente(repo)
    const publica = await c.exportar(meta)
    expect(publica.mestre).toBeUndefined()
    const comMestre = await c.exportar(meta, { comMestre: true })
    expect(comMestre.mestre?.ocultos).toHaveLength(1)
    expect(comMestre.mestre?.notas[0].texto).toBe('tesouro')
  })

  it('o que está na tela e ainda não chegou ao servidor entra na exportação', async () => {
    const repo = new RepositorioDoMestre()
    const c = await cliente(repo)
    c.editarNota(2, 0, 'só na tela')
    const a = await c.exportar(meta, { comMestre: true })
    expect(a.mestre?.notas.map((n) => n.texto)).toEqual(['só na tela'])
  })

  it('jogador não exporta a camada do mestre, mesmo pedindo', async () => {
    const repo = new RepositorioDoMestre(false)
    repo.ocultos = [oculto(1, 0)]
    const c = await cliente(repo)
    const a = await c.exportar(meta, { comMestre: true })
    expect(a.mestre).toBeUndefined()
  })

  it('importar o arquivo do mestre leva os ocultos e as notas num lote só, que desfaz de uma vez', async () => {
    const origem = new RepositorioDoMestre()
    origem.ocultos = [oculto(1, 0, 'cripta')]
    origem.notas = [nota(1, 0, 'armadilha')]
    const arquivo = await (await cliente(origem)).exportar(meta, { comMestre: true })

    const destino = new RepositorioDoMestre()
    const c = await cliente(destino)
    const r = await c.importar(arquivo, 'mesclar')
    expect(r).toMatchObject({ ocultos: 1, notas: 1 })
    expect(c.mestre?.ocultos.ler(1, 0)?.terreno).toBe('cripta')
    expect(c.mestre?.notas.ler(1, 0)?.texto).toBe('armadilha')
    expect(destino.enviados).toHaveLength(1)
    expect(destino.enviados[0].tipo).toBe('importacao')
    expect(destino.enviados[0].privado?.ocultos).toHaveLength(1)
    c.desfazer()
    expect(c.mestre?.ocultos.ler(1, 0)).toBeNull()
    expect(c.mestre?.notas.ler(1, 0)).toBeNull()
  })

  it('substituir deixa a camada do mestre igual ao arquivo', async () => {
    const repo = new RepositorioDoMestre()
    repo.ocultos = [oculto(0, 0), oculto(2, 0)]
    repo.notas = [nota(2, 0, 'velha')]
    const c = await cliente(repo)
    const arquivo = montarArquivo(meta, [], [], null, new Date(), { ocultos: [oculto(1, 0)], notas: [] })
    await c.importar(arquivo, 'substituir')
    expect(c.mestre?.ocultos.ler(0, 0)).toBeNull()
    expect(c.mestre?.ocultos.ler(2, 0)).toBeNull()
    expect(c.mestre?.ocultos.ler(1, 0)).not.toBeNull()
    expect(c.mestre?.notas.ler(2, 0)).toBeNull()
  })

  it('arquivo sem camada do mestre não mexe na camada que existe, nem em substituir', async () => {
    const repo = new RepositorioDoMestre()
    repo.ocultos = [oculto(0, 0)]
    const c = await cliente(repo)
    await c.importar(montarArquivo(meta, [], [], null), 'substituir')
    expect(c.mestre?.ocultos.ler(0, 0)).not.toBeNull()
  })

  it('jogador que importa o arquivo do mestre ignora a camada', async () => {
    const repo = new RepositorioDoMestre(false)
    const c = await cliente(repo)
    const arquivo = montarArquivo(meta, [hexagonoNovo(0, 0, 'planicie')], [], null, new Date(), { ocultos: [oculto(1, 0)], notas: [nota(1, 0, 'x')] })
    const r = await c.importar(arquivo, 'mesclar')
    expect(r.ocultos).toBeUndefined()
    expect(repo.enviados[0].privado).toBeUndefined()
    expect(c.armazem.total).toBe(1)
  })

  it('a camada do mestre conta no limite de importação', async () => {
    const repo = new RepositorioDoMestre()
    const c = new ControladorMapa(repo, 'gm', { limiteImportacao: 2 })
    await c.garantirChunk(ck)
    const arquivo = montarArquivo(meta, [], [], null, new Date(), { ocultos: [oculto(0, 0), oculto(1, 0)], notas: [nota(2, 0, 'x')] })
    await expect(c.importar(arquivo, 'mesclar')).rejects.toThrow('Divida o mapa')
    expect(c.mestre?.ocultos.ler(0, 0)).toBeNull()
  })
})
