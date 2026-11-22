import { describe, expect, it } from 'vitest'
import { chaveChunk, TAMANHO_CHUNK } from '../mapa/hex'
import casos from './casos-chunk.json'

// O servidor calcula o chunk de cada hexágono (pocketbase/pb_hooks/mapa.js), e o mapa pede os hexágonos
// por chunk. As duas contas precisam bater, inclusive com coordenadas negativas. Os mesmos casos são
// conferidos no servidor por pocketbase/testar-regras.mjs.
describe('chunk calculado pelo servidor e pelo mapa', () => {
  it('o tamanho do chunk é o que o servidor usa', () => {
    expect(TAMANHO_CHUNK).toBe(16)
  })

  it.each(casos)('($q, $r) fica no chunk "$chunk"', ({ q, r, chunk }) => {
    expect(chaveChunk({ q, r })).toBe(chunk)
  })
})
