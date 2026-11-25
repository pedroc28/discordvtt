import { describe, expect, it } from 'vitest'
import {
  emailDaConta,
  horaDoServidor,
  normalizarCampanha,
  normalizarHexagonoDoServidor,
  normalizarImagemQuadroDoServidor,
  normalizarItemQuadroDoServidor,
  normalizarLista,
  normalizarLoteDoServidor,
  normalizarLoteMestreDoServidor,
  normalizarMapaDoServidor,
  normalizarNotaPrivada,
  normalizarParticipacao,
  normalizarRegiaoDoServidor,
  normalizarRolagemDoServidor,
  normalizarTokenDoServidor,
  normalizarUsuario,
  normalizarViagemDoServidor,
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
    expect(normalizarMapaDoServidor({ id: 'm1', ultimaOrdem: 12, permissao: 'mestre' })).toEqual({ id: 'm1', ultimaOrdem: 12, permissao: 'mestre' })
    // Sem trava, ou com um valor desconhecido, vale aberta: quem confere de verdade é o servidor.
    expect(normalizarMapaDoServidor({ id: 'm1' })).toEqual({ id: 'm1', ultimaOrdem: 0, permissao: 'todos' })
    expect(normalizarMapaDoServidor({ id: 'm1', permissao: 'ninguem' })?.permissao).toBe('todos')
    expect(normalizarTokenDoServidor({ id: 't1', q: 2, r: 3, ts: 5, autor: 'u', presente: true })).toEqual({ id: 't1', token: { q: 2, r: 3, ts: 5, autor: 'u' } })
    expect(normalizarTokenDoServidor({ id: 't1', q: 2, r: 3, ts: 5, presente: false })).toEqual({ id: 't1', token: null })
  })

  it('viagem: só os números finitos da configuração, e null enquanto o mestre nunca gravou', () => {
    const hora = '2026-11-24 12:00:00.123Z'
    expect(normalizarViagemDoServidor({ id: 'v1', config: { viajantes: 4, estoqueAgua: 60.5 }, updated: hora })).toEqual({
      id: 'v1',
      config: { viajantes: 4, estoqueAgua: 60.5 },
      atualizado: hora,
    })
    expect(normalizarViagemDoServidor({ id: 'v1', config: { viajantes: '4', montarias: 2, kmPorHex: null } })).toEqual({
      id: 'v1',
      config: { montarias: 2 },
      atualizado: '',
    })
    expect(normalizarViagemDoServidor({ id: 'v1', config: null, updated: hora })?.config).toBeNull()
    expect(normalizarViagemDoServidor({ id: 'v1', config: [1, 2], updated: hora })?.config).toBeNull()
    expect(normalizarViagemDoServidor({ config: {} })).toBeNull()
  })
})

describe('validação da camada do mestre', () => {
  it('lote do mestre vira um Lote só com a parte privada, com o mesmo id', () => {
    const oculto = { q: 1, r: 1, terreno: 'ruinas', regiaoId: null, nome: '', nota: '', marcadores: [], rios: [], estradas: [], rev: 1 }
    const nota = { q: 1, r: 1, texto: 'segredo', rev: 1 }
    const bruto = { ordem: 3, loteId: 'l1', autor: 'u1', ts: 9, tipo: 'reversao', alvoId: 'l0', ocultos: [{ q: 1, r: 1, antes: null, depois: oculto }], notas: [{ q: 1, r: 1, antes: null, depois: nota }] }
    expect(normalizarLoteMestreDoServidor(bruto)).toEqual({
      ordem: 3,
      lote: { id: 'l1', autor: 'u1', ts: 9, mudancas: [], regioes: [], tipo: 'reversao', alvoId: 'l0', privado: { ocultos: [{ q: 1, r: 1, antes: null, depois: oculto }], notas: [{ q: 1, r: 1, antes: null, depois: nota }] } },
    })
  })

  it('tipo desconhecido fica de fora, e o lote vale como edição', () => {
    expect(normalizarLoteDoServidor({ ordem: 1, loteId: 'l', tipo: 'qualquer' })?.lote.tipo).toBeUndefined()
    expect(normalizarLoteDoServidor({ ordem: 1, loteId: 'l', tipo: 'importacao' })?.lote.tipo).toBe('importacao')
  })

  it('nota privada precisa de posição e texto', () => {
    expect(normalizarNotaPrivada({ q: 0, r: -1, texto: 'x' })).toEqual({ q: 0, r: -1, texto: 'x', rev: 1 })
    expect(normalizarNotaPrivada({ q: 0, r: -1 })).toBeNull()
  })
})

describe('validação das rolagens', () => {
  const bruto = { id: 'r1', campanha: 'c1', autor: 'u1', lados: 20, resultado: 17, created: '2026-11-23 04:24:00.123Z' }

  it('registro do servidor vira a Rolagem, com a hora em milissegundos', () => {
    expect(normalizarRolagemDoServidor(bruto, false)).toEqual({
      id: 'r1',
      autorId: 'u1',
      lados: 20,
      resultado: 17,
      quando: Date.parse('2026-11-23T04:24:00.123Z'),
      secreta: false,
    })
    expect(normalizarRolagemDoServidor(bruto, true)?.secreta).toBe(true)
  })

  it('dado fora dos clássicos ou resultado fora do dado descarta o registro', () => {
    expect(normalizarRolagemDoServidor({ ...bruto, lados: 7 }, false)).toBeNull()
    expect(normalizarRolagemDoServidor({ ...bruto, resultado: 21 }, false)).toBeNull()
    expect(normalizarRolagemDoServidor({ ...bruto, resultado: 0 }, false)).toBeNull()
    expect(normalizarRolagemDoServidor({ ...bruto, resultado: 2.5 }, false)).toBeNull()
    expect(normalizarRolagemDoServidor({ ...bruto, autor: '' }, false)).toBeNull()
    expect(normalizarRolagemDoServidor({ ...bruto, created: 'ontem' }, false)).toBeNull()
    expect(normalizarRolagemDoServidor(null, false)).toBeNull()
  })

  it('hora do PocketBase, com espaço no lugar do T', () => {
    expect(horaDoServidor('2026-11-23 04:24:00.123Z')).toBe(Date.UTC(2026, 10, 23, 4, 24, 0, 123))
    expect(horaDoServidor('')).toBeNull()
    expect(horaDoServidor(123)).toBeNull()
  })
})

describe('validação do quadro', () => {
  const imagem = { id: 'i1', autor: 'u1', nome: ' Carta ', arquivo: 'carta_x.webp', largura: 1200, altura: 900, bytes: 4000, created: '2026-11-24 04:00:00.000Z' }

  it('imagem do servidor vira ImagemQuadro', () => {
    expect(normalizarImagemQuadroDoServidor(imagem)).toEqual({
      id: 'i1',
      autorId: 'u1',
      nome: 'Carta',
      arquivo: 'carta_x.webp',
      largura: 1200,
      altura: 900,
      bytes: 4000,
      enviada: Date.parse('2026-11-24T04:00:00.000Z'),
    })
    expect(normalizarImagemQuadroDoServidor({ ...imagem, autor: '' })?.autorId).toBe('')
  })

  it('imagem sem arquivo ou com dimensões fora do contrato é descartada', () => {
    expect(normalizarImagemQuadroDoServidor({ ...imagem, arquivo: '' })).toBeNull()
    expect(normalizarImagemQuadroDoServidor({ ...imagem, largura: 0 })).toBeNull()
    expect(normalizarImagemQuadroDoServidor({ ...imagem, altura: 5000 })).toBeNull()
    expect(normalizarImagemQuadroDoServidor({ ...imagem, bytes: 0 })).toBeNull()
  })

  const nota = { id: 'n1', autor: 'u1', tipo: 'nota', texto: 'Pista', cor: 'rosa', imagem: '', x: 100, y: 200, largura: 180, rotacao: -2, z: 3 }

  it('nota e imagem presas viram ItemQuadro', () => {
    expect(normalizarItemQuadroDoServidor(nota)).toEqual({ id: 'n1', autorId: 'u1', tipo: 'nota', texto: 'Pista', cor: 'rosa', x: 100, y: 200, largura: 180, rotacao: -2, z: 3 })
    expect(normalizarItemQuadroDoServidor({ ...nota, tipo: 'imagem', imagem: 'i1' })).toMatchObject({ tipo: 'imagem', imagemId: 'i1' })
  })

  it('cor desconhecida vira amarelo, e rotação ou camada estranhas viram zero', () => {
    expect(normalizarItemQuadroDoServidor({ ...nota, cor: 'roxo', rotacao: 45, z: -1 })).toMatchObject({ cor: 'amarelo', rotacao: 0, z: 0 })
  })

  it('item fora do quadro, sem imagem ou de tipo desconhecido é descartado', () => {
    expect(normalizarItemQuadroDoServidor({ ...nota, x: 3201 })).toBeNull()
    expect(normalizarItemQuadroDoServidor({ ...nota, y: -1 })).toBeNull()
    expect(normalizarItemQuadroDoServidor({ ...nota, largura: 20 })).toBeNull()
    expect(normalizarItemQuadroDoServidor({ ...nota, tipo: 'imagem', imagem: '' })).toBeNull()
    expect(normalizarItemQuadroDoServidor({ ...nota, tipo: 'barbante' })).toBeNull()
  })
})
