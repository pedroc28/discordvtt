import { describe, expect, it } from 'vitest'
import { emailDaConta, normalizarCampanha, normalizarLista, normalizarParticipacao, normalizarUsuario } from './validacao'

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
