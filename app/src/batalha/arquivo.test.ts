// Arquivo de exportação da cena de batalha: montar, ler, validar e preparar a importação.

import { describe, expect, it } from 'vitest'
import { BASE64_MAXIMO, cenaParaImportar, lerArquivo, montarArquivo, nomeDoArquivo } from './arquivo'
import { adicionarToken, cenaNova, mudarGrade } from './operacoes'

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function cenaComCoisas() {
  let c = mudarGrade(cenaNova('p', 'Ponte do Troll'), { tipo: 'hex-chato', tamanho: 90, x: 12, y: -4 })
  c = adicionarToken(c, { x: 100, y: 50 }, 'a').cena
  return adicionarToken(c, { x: 300, y: 80 }, 'b').cena
}

describe('arquivo da cena', () => {
  it('exporta e lê de volta a mesma cena e a mesma imagem', () => {
    const cena = cenaComCoisas()
    const arq = montarArquivo(cena, { tipo: 'image/png', dados: PIXEL }, new Date('2026-11-25T10:00:00Z'))
    const lido = lerArquivo(JSON.stringify(arq))
    expect(lido.ok).toBe(true)
    if (!lido.ok) return
    expect(lido.arquivo.cena).toEqual(cena)
    expect(lido.arquivo.imagem).toEqual({ tipo: 'image/png', dados: PIXEL })
    expect(lido.resumo).toEqual({ tokens: 2, comImagem: true, descartados: 0 })
  })

  it('cena sem imagem também vale', () => {
    const lido = lerArquivo(JSON.stringify(montarArquivo(cenaComCoisas(), null)))
    expect(lido.ok && lido.arquivo.imagem).toBeNull()
    expect(lido.ok && lido.resumo.comImagem).toBe(false)
  })

  it('recusa o que não é JSON, não é do mapa de batalha, ou vem de versão mais nova', () => {
    expect(lerArquivo('{nao é json')).toMatchObject({ ok: false })
    expect(lerArquivo(JSON.stringify({ formato: 'mapa-hex', versao: 1 }))).toMatchObject({ ok: false, erro: expect.stringContaining('não é um mapa de batalha') })
    expect(lerArquivo(JSON.stringify({ formato: 'batalha-vtt' }))).toMatchObject({ ok: false, erro: expect.stringContaining('versão') })
    expect(lerArquivo(JSON.stringify({ formato: 'batalha-vtt', versao: 99, cena: {} }))).toMatchObject({ ok: false, erro: expect.stringContaining('mais nova') })
  })

  it('recusa arquivo sem cena', () => {
    expect(lerArquivo(JSON.stringify({ formato: 'batalha-vtt', versao: 1 }))).toMatchObject({ ok: false, erro: expect.stringContaining('não tem a cena') })
  })

  it('token quebrado é descartado e contado, e o resto da cena vale', () => {
    const arq = montarArquivo(cenaComCoisas(), null)
    const bruto = JSON.parse(JSON.stringify(arq))
    bruto.cena.tokens.push({ x: 1 }, 'lixo', { id: 'a', x: 9, y: 9 })
    const lido = lerArquivo(JSON.stringify(bruto))
    expect(lido.ok && lido.resumo).toMatchObject({ tokens: 2, descartados: 3 })
  })

  it('campo ruim da grade vira o padrão', () => {
    const arq = JSON.parse(JSON.stringify(montarArquivo(cenaComCoisas(), null)))
    arq.cena.grade.tamanho = 'enorme'
    arq.cena.grade.tipo = 'triangular'
    const lido = lerArquivo(JSON.stringify(arq))
    expect(lido.ok && lido.arquivo.cena.grade).toMatchObject({ tipo: 'quadrada', tamanho: 70 })
  })

  it('recusa imagem de tipo que o app não abre, base64 quebrado ou grande demais', () => {
    const com = (imagem: unknown) => lerArquivo(JSON.stringify({ ...JSON.parse(JSON.stringify(montarArquivo(cenaNova(), null))), imagem }))
    expect(com({ tipo: 'image/svg+xml', dados: PIXEL })).toMatchObject({ ok: false, erro: expect.stringContaining('imagem') })
    expect(com({ tipo: 'image/png', dados: 'isto não é base64!' })).toMatchObject({ ok: false })
    expect(com({ tipo: 'image/png', dados: 'abc' })).toMatchObject({ ok: false })
    expect(com({ tipo: 'image/png', dados: 'A'.repeat(BASE64_MAXIMO + 4) })).toMatchObject({ ok: false })
    expect(com('texto')).toMatchObject({ ok: false })
    expect(com({ tipo: 'image/png', dados: PIXEL })).toMatchObject({ ok: true })
  })

  it('o nome do arquivo é limpo e traz a data', () => {
    const d = new Date('2026-11-25T10:00:00Z')
    expect(nomeDoArquivo('Ponte do Troll', d)).toBe('batalha-ponte-do-troll-2026-11-25.json')
    expect(nomeDoArquivo('  ', d)).toBe('batalha-sem-nome-2026-11-25.json')
  })
})

describe('cena para importar', () => {
  it('fica com o id do destino e o fundo vem do tamanho real da imagem', () => {
    const cena = { ...cenaComCoisas(), fundo: { largura: 1, altura: 1 } }
    const nova = cenaParaImportar(cena, 'principal', { largura: 800, altura: 600 })
    expect(nova).toMatchObject({ id: 'principal', fundo: { largura: 800, altura: 600 } })
    expect(nova?.tokens).toHaveLength(2)
  })

  it('sem imagem, sem fundo, mesmo que o arquivo dissesse outra coisa', () => {
    const cena = { ...cenaComCoisas(), fundo: { largura: 800, altura: 600 } }
    expect(cenaParaImportar(cena, 'principal', null)?.fundo).toBeNull()
  })

  it('recusa imagem com lado maior que o limite', () => {
    expect(cenaParaImportar(cenaNova(), 'principal', { largura: 20000, altura: 100 })).toBeNull()
  })
})
