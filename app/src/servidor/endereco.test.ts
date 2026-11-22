import { describe, expect, it } from 'vitest'
import { ENDERECO_PADRAO, normalizarEndereco } from './endereco'

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
