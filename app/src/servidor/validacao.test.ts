import { describe, expect, it } from 'vitest'
import {
  emailDaConta,
  normalizarCampanha,
  normalizarHexagonoDoServidor,
  normalizarLista,
  normalizarLoteDoServidor,
  normalizarMapaDoServidor,
  normalizarParticipacao,
  normalizarRegiaoDoServidor,
  normalizarTokenDoServidor,
  normalizarUsuario,
} from './validacao'

describe('validação dos dados do servidor', () => {
  it('converte os campos do PocketBase para os nomes do app', () => {
    expect(normalizarUsuario({ id: 'u1', name: ' Ana ', email: 'ana@x' })).toEqual({ id: 'u1', nome: 'Ana' })
    expect(normalizarCampanha({ id: 'c1', nome: 'Mesa', created: '2026' })).toEqual({ id: 'c1', nome: 'Mesa' })
    expect(normalizarParticipacao({ id: 'p1', campanha: 'c1', usuario: 'u1', papel: 'mestre' })).toEqual({
      id: 'p1',
      campanhaId: 'c1',
      usuarioId: 'u1',
      papel: 'mestre',
    })
  })

  it('nome vazio ganha um texto no lugar, em vez de sumir', () => {
    expect(normalizarUsuario({ id: 'u1', name: '' })?.nome).toBe('Sem nome')
    expect(normalizarCampanha({ id: 'c1' })?.nome).toBe('Campanha sem nome')
  })

  it('descarta registros sem id ou com papel desconhecido', () => {
    expect(normalizarUsuario({ name: 'Ana' })).toBeNull()
    expect(normalizarCampanha(null)).toBeNull()
    expect(normalizarParticipacao({ id: 'p1', campanha: 'c1', usuario: 'u1', papel: 'narrador' })).toBeNull()
    expect(normalizarParticipacao({ id: 'p1', campanha: '', usuario: 'u1', papel: 'jogador' })).toBeNull()
  })

  it('lê o e-mail da própria conta só se ele vier certo', () => {
    expect(emailDaConta({ id: 'u1', email: 'ana@teste.local' })).toBe('ana@teste.local')
    expect(emailDaConta({ id: 'u1', email: '' })).toBeNull()
    expect(emailDaConta({ id: 'u1' })).toBeNull()
    expect(emailDaConta(null)).toBeNull()
  })

  it('lista que não é lista vira vazia, e itens inválidos saem', () => {
    expect(normalizarLista({ items: [] }, normalizarCampanha)).toEqual([])
    expect(normalizarLista([{ id: 'c1', nome: 'A' }, 42, { nome: 'sem id' }], normalizarCampanha)).toEqual([{ id: 'c1', nome: 'A' }])
  })
})

describe('validação dos dados do mapa no servidor', () => {
  const hex = { q: 1, r: -2, terreno: 'floresta', regiaoId: null, nome: '', nota: '', marcadores: [], rios: [0], estradas: [], rev: 3 }

  it('hexágono vale a posição do registro, e campos que faltam ganham o padrão do mapa', () => {
    expect(normalizarHexagonoDoServidor({ q: 1, r: -2, chunk: '0,-1', dados: { ...hex, q: 9 } })).toEqual(hex)
    expect(normalizarHexagonoDoServidor({ q: 0, r: 0, dados: { terreno: 'campo' } })).toEqual({
      q: 0,
      r: 0,
      terreno: 'campo',
      regiaoId: null,
      nome: '',
      nota: '',
      marcadores: [],
      rios: [],
      estradas: [],
      rev: 1,
    })
    expect(normalizarHexagonoDoServidor({ q: 0, r: 0, dados: { terreno: '' } })).toBeNull()
  })

  it('região vale o id do registro', () => {
    expect(normalizarRegiaoDoServidor({ regiaoId: 'r1', dados: { id: 'x', nome: 'Vale', cor: '#123456' } })).toMatchObject({ id: 'r1', nome: 'Vale' })
    expect(normalizarRegiaoDoServidor({ dados: {} })).toBeNull()
  })

  it('lote do servidor vira o Lote do mapa, com o número de ordem', () => {
    const bruto = {
      id: 'reg',
      ordem: 7,
      loteId: 'l7',
      autor: 'u1',
      ts: 123,
      mudancas: [
        { q: 1, r: -2, antes: null, depois: hex },
        { q: 5, r: 5, antes: hex, depois: null },
      ],
      regioes: [],
    }
    expect(normalizarLoteDoServidor(bruto)).toEqual({
      ordem: 7,
      lote: { id: 'l7', autor: 'u1', ts: 123, mudancas: [bruto.mudancas[0], { q: 5, r: 5, antes: { ...hex }, depois: null }], regioes: [] },
    })
  })

  it('um "depois" inválido não vira "apagar o hexágono"', () => {
    const lote = normalizarLoteDoServidor({ ordem: 1, loteId: 'l', mudancas: [{ q: 1, r: 1, antes: null, depois: { terreno: '' } }] })
    expect(lote?.lote.mudancas).toEqual([])
    expect(normalizarLoteDoServidor({ ordem: 0, loteId: 'l' })).toBeNull()
  })

  it('mapa e token', () => {
    expect(normalizarMapaDoServidor({ id: 'm1', ultimaOrdem: 12 })).toEqual({ id: 'm1', ultimaOrdem: 12 })
    expect(normalizarMapaDoServidor({ id: 'm1' })).toEqual({ id: 'm1', ultimaOrdem: 0 })
    expect(normalizarTokenDoServidor({ id: 't1', q: 2, r: 3, ts: 5, autor: 'u', presente: true })).toEqual({ id: 't1', token: { q: 2, r: 3, ts: 5, autor: 'u' } })
    expect(normalizarTokenDoServidor({ id: 't1', q: 2, r: 3, ts: 5, presente: false })).toEqual({ id: 't1', token: null })
  })
})
