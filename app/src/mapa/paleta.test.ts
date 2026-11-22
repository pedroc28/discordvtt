import { describe, expect, it } from 'vitest'
import { agruparTerrenos, contarTags, semAcento } from './paleta'
import { normalizarTags, normalizarTileset, type DefTileset } from './tileset'

const def = normalizarTileset({
  orientacao: 'pointy',
  pastas: [
    { id: 'florestas', nome: 'Florestas' },
    { id: 'aguas', nome: 'Águas e pântanos' },
  ],
  terrenos: [
    { id: 'floresta', nome: 'Floresta', cor: '#050', extra: 0, arquivos: [], pasta: 'florestas', tags: ['árvores', 'temperado', 'caça'] },
    { id: 'taiga', nome: 'Floresta de coníferas', cor: '#050', extra: 0, arquivos: [], pasta: 'florestas', tags: ['frio', 'coníferas', 'árvores'] },
    { id: 'oceano', nome: 'Oceano', cor: '#005', extra: 0, arquivos: [], pasta: 'aguas', tags: ['água', 'profundo', 'navegável'] },
    { id: 'solto', nome: 'Terreno solto', cor: '#555', extra: 0, arquivos: [] },
    { id: 'errado', nome: 'Pasta inexistente', cor: '#555', extra: 0, arquivos: [], pasta: 'nao-existe', tags: ['frio'] },
  ],
}) as DefTileset

const ids = (consulta: string, tags: string[] = []) => agruparTerrenos(def, consulta, tags).flatMap((g) => g.terrenos.map((t) => t.id))

describe('paleta: pastas', () => {
  it('sem pesquisa mostra tudo, agrupado na ordem do tileset e com "Outros" por último', () => {
    const grupos = agruparTerrenos(def, '')
    expect(grupos.map((g) => g.pasta.id)).toEqual(['florestas', 'aguas', 'outros'])
    expect(grupos[2].terrenos.map((t) => t.id)).toEqual(['solto', 'errado'])
  })

  it('pasta que não existe na lista vira "Outros" em vez de sumir', () => {
    expect(def.terrenos.find((t) => t.id === 'errado')?.pasta).toBeNull()
  })

  it('pasta sem resultado some', () => {
    expect(agruparTerrenos(def, 'oceano').map((g) => g.pasta.id)).toEqual(['aguas'])
  })
})

describe('paleta: pesquisa', () => {
  it('acha pelo nome, ignorando acento e maiúsculas', () => {
    expect(ids('FLORESTA')).toEqual(['floresta', 'taiga'])
    expect(ids('conifer')).toEqual(['taiga'])
  })

  it('acha por tag', () => {
    expect(ids('caça')).toEqual(['floresta'])
    expect(ids('agua')).toEqual(['oceano'])
    expect(ids('navegavel')).toEqual(['oceano'])
  })

  it('acha pelo nome da pasta', () => {
    expect(ids('pantanos')).toEqual(['oceano'])
  })

  it('várias palavras precisam casar todas', () => {
    expect(ids('floresta frio')).toEqual(['taiga'])
    expect(ids('floresta navegavel')).toEqual([])
  })

  it('tags ativas exigem todas', () => {
    expect(ids('', ['árvores'])).toEqual(['floresta', 'taiga'])
    expect(ids('', ['árvores', 'frio'])).toEqual(['taiga'])
    expect(ids('', ['frio'])).toEqual(['taiga', 'errado'])
  })

  it('tag ativa e texto se combinam', () => {
    expect(ids('oceano', ['frio'])).toEqual([])
    expect(ids('floresta', ['caça'])).toEqual(['floresta'])
  })
})

describe('paleta: tags', () => {
  it('conta as tags das mais usadas para as menos', () => {
    const c = contarTags(def)
    expect(c[0]).toEqual({ tag: 'árvores', n: 2 })
    expect(c.find((x) => x.tag === 'frio')?.n).toBe(2)
    expect(c.find((x) => x.tag === 'água')?.n).toBe(1)
  })

  it('normaliza tags: minúsculas, sem repetir e sem vazias', () => {
    expect(normalizarTags([' Frio ', 'frio', '', 'Campo  Aberto', 3])).toEqual(['frio', 'campo aberto'])
    expect(normalizarTags('x')).toEqual([])
  })

  it('semAcento tira acento e maiúsculas', () => {
    expect(semAcento('Água Navegável')).toBe('agua navegavel')
  })
})
