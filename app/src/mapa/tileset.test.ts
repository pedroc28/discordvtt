import { describe, expect, it } from 'vitest'
import { normalizarTileset } from './tileset'

const base = {
  orientacao: 'pointy',
  terrenos: [{ id: 'planicie', nome: 'Planície', cor: '#5a9a37', extra: 0, arquivos: ['planicie-1.png'] }],
}

describe('tileset', () => {
  it('pixelart vem desligado por padrão e liga só com true', () => {
    expect(normalizarTileset(base)?.pixelart).toBe(false)
    expect(normalizarTileset({ ...base, pixelart: true })?.pixelart).toBe(true)
    expect(normalizarTileset({ ...base, pixelart: 'sim' })?.pixelart).toBe(false)
  })
})
