import { describe, expect, it } from 'vitest'
import { ENDERECO_PADRAO, ehEnderecoLocal, enderecoDoLink, linkDeConvite, normalizarEndereco, semParametroDoServidor } from './endereco'

describe('endereço do servidor', () => {
  it('aceita o endereço completo e tira a barra do fim', () => {
    expect(normalizarEndereco('http://127.0.0.1:8090/')).toBe('http://127.0.0.1:8090')
    expect(normalizarEndereco('  https://mesa.exemplo.ts.net  ')).toBe('https://mesa.exemplo.ts.net')
  })

  it('sem esquema, endereço local vira http e o resto vira https', () => {
    expect(normalizarEndereco('127.0.0.1:8090')).toBe('http://127.0.0.1:8090')
    expect(normalizarEndereco('localhost:8090')).toBe('http://localhost:8090')
    expect(normalizarEndereco('192.168.0.10:8090')).toBe('http://192.168.0.10:8090')
    expect(normalizarEndereco('pc-do-pedro.tail1234.ts.net')).toBe('https://pc-do-pedro.tail1234.ts.net')
  })

  it('mantém um caminho base, mas descarta busca e âncora', () => {
    expect(normalizarEndereco('https://exemplo.com/pb/?x=1#topo')).toBe('https://exemplo.com/pb')
  })

  it('recusa o que não é endereço http ou https', () => {
    expect(normalizarEndereco('')).toBeNull()
    expect(normalizarEndereco('   ')).toBeNull()
    expect(normalizarEndereco('ftp://exemplo.com')).toBeNull()
    expect(normalizarEndereco('javascript:alert(1)')).toBeNull()
    expect(normalizarEndereco('https://usuario:senha@exemplo.com')).toBeNull()
    expect(normalizarEndereco('http://')).toBeNull()
  })

  it('sem configuração, o padrão é o PocketBase no próprio PC', () => {
    expect(normalizarEndereco(ENDERECO_PADRAO)).toBe(ENDERECO_PADRAO)
  })
})

describe('link de convite', () => {
  const SITE = 'https://pedroc28.github.io/discordvtt/'
  const FUNNEL = 'https://pc-do-pedro.tail1234.ts.net'

  it('leva o endereço do servidor e volta igual pelo link', () => {
    const link = linkDeConvite(`${SITE}?tileset=pixel#topo`, FUNNEL)
    expect(link).toBe(`${SITE}?servidor=${encodeURIComponent(FUNNEL)}`)
    expect(enderecoDoLink(new URL(link).search)).toBe(FUNNEL)
  })

  it('link sem servidor ou com endereço inválido é ignorado', () => {
    expect(enderecoDoLink('')).toBeNull()
    expect(enderecoDoLink('?tileset=pixel')).toBeNull()
    expect(enderecoDoLink('?servidor=javascript:alert(1)')).toBeNull()
  })

  it('tira só o parâmetro do servidor do endereço da página', () => {
    expect(semParametroDoServidor(`${SITE}?tileset=pixel&servidor=x`)).toBe(`${SITE}?tileset=pixel`)
  })

  it('reconhece endereço que só funciona em casa', () => {
    expect(ehEnderecoLocal('http://127.0.0.1:8090')).toBe(true)
    expect(ehEnderecoLocal('http://localhost:8090')).toBe(true)
    expect(ehEnderecoLocal('http://192.168.1.20:8090')).toBe(true)
    expect(ehEnderecoLocal(FUNNEL)).toBe(false)
  })
})
