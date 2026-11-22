import { describe, expect, it } from 'vitest'
import type { Lote } from '../mapa/tipos'
import { definirInicio, filaVazia, receberLote, temBuraco, type FilaLotes } from './fila-lotes'

const lote = (id: string): Lote => ({ id, autor: 'a', ts: 0, mudancas: [], regioes: [] })

/** Passa vários lotes pela fila e junta o que saiu. */
function passar(fila: FilaLotes, ...ordens: number[]) {
  const saida: string[] = []
  for (const ordem of ordens) {
    const r = receberLote(fila, ordem, lote(`L${ordem}`))
    fila = r.fila
    saida.push(...r.prontos.map((l) => l.id))
  }
  return { fila, saida }
}

describe('fila dos lotes do servidor', () => {
  it('entrega na ordem do servidor, mesmo chegando trocado', () => {
    const { fila, saida } = passar(definirInicio(filaVazia(), 0).fila, 2, 3, 1, 4)
    expect(saida).toEqual(['L1', 'L2', 'L3', 'L4'])
    expect(fila.ultima).toBe(4)
    expect(temBuraco(fila)).toBe(false)
  })

  it('segura o que chega depois de um que falta e avisa do buraco', () => {
    const { fila, saida } = passar(definirInicio(filaVazia(), 5).fila, 7, 8)
    expect(saida).toEqual([])
    expect(temBuraco(fila)).toBe(true)
    expect(passar(fila, 6).saida).toEqual(['L6', 'L7', 'L8'])
  })

  it('ignora repetidos e os que já estavam no mapa', () => {
    const inicio = definirInicio(filaVazia(), 3).fila
    expect(passar(inicio, 2, 3, 4, 4, 5).saida).toEqual(['L4', 'L5'])
  })

  it('antes de saber onde a numeração está, só guarda', () => {
    const { fila, saida } = passar(filaVazia(), 4, 5)
    expect(saida).toEqual([])
    expect(temBuraco(fila)).toBe(false)
    // O mapa abriu no 4: o lote 4 já está nos hexágonos, o 5 sai.
    const aberto = definirInicio(fila, 4)
    expect(aberto.prontos.map((l) => l.id)).toEqual(['L5'])
    expect(aberto.fila.ultima).toBe(5)
  })

  it('não muda a fila que recebeu', () => {
    const fila = definirInicio(filaVazia(), 0).fila
    receberLote(fila, 2, lote('L2'))
    expect(fila.espera.size).toBe(0)
    expect(fila.ultima).toBe(0)
  })
})
