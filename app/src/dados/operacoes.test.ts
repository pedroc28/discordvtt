import { describe, expect, it } from 'vitest'
import { descreverRolagem, ehLados, extremo, formatarHora, juntarRolagens, nomeDeQuemRolou, sortearComBytes } from './operacoes'
import { LADOS, type Rolagem } from './tipos'

const rolagem = (id: string, quando: number, extra: Partial<Rolagem> = {}): Rolagem => ({
  id,
  autorId: 'ana',
  lados: 20,
  resultado: 10,
  quando,
  secreta: false,
  ...extra,
})

/** Gerador que devolve os bytes da lista, em ordem. */
const bytes = (lista: number[]) => {
  let i = 0
  return () => {
    const byte = lista[i++]
    if (byte === undefined) throw new Error('acabaram os bytes do teste')
    return byte
  }
}

describe('sorteio local', () => {
  it('só os dados clássicos valem', () => {
    for (const lados of LADOS) expect(ehLados(lados)).toBe(true)
    for (const valor of [0, 1, 3, 7, 100, '20', 20.5, null]) expect(ehLados(valor)).toBe(false)
  })

  it('cada byte vira uma face, de 1 a lados', () => {
    expect(sortearComBytes(6, bytes([0]))).toBe(1)
    expect(sortearComBytes(6, bytes([5]))).toBe(6)
    expect(sortearComBytes(6, bytes([6]))).toBe(1)
    expect(sortearComBytes(2, bytes([255]))).toBe(2)
  })

  it('descarta os bytes do fim que dariam mais chance às faces baixas', () => {
    // 256 = 12 × 20 + 16: os bytes de 240 a 255 são descartados no d20.
    expect(sortearComBytes(20, bytes([240, 255, 239]))).toBe(20)
    // No d6, 256 = 42 × 6 + 4: de 252 a 255 são descartados.
    expect(sortearComBytes(6, bytes([252, 3]))).toBe(4)
  })

  it('com todos os bytes, cada face sai o mesmo número de vezes', () => {
    for (const lados of LADOS) {
      const contagem = new Map<number, number>()
      for (let byte = 0; byte < 256 - (256 % lados); byte++) {
        const face = sortearComBytes(lados, bytes([byte]))
        contagem.set(face, (contagem.get(face) ?? 0) + 1)
      }
      expect(contagem.size).toBe(lados)
      expect(new Set(contagem.values()).size).toBe(1)
    }
  })
})

describe('histórico', () => {
  it('junta sem repetir, da mais nova para a mais velha', () => {
    const historico = [rolagem('b', 200), rolagem('a', 100)]
    const junto = juntarRolagens(historico, [rolagem('c', 300), rolagem('b', 200)])
    expect(junto.map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(historico.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('rolagem que chega atrasada entra no lugar certo', () => {
    const junto = juntarRolagens([rolagem('c', 300), rolagem('a', 100)], [rolagem('b', 200)])
    expect(junto.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('guarda só o tamanho do histórico', () => {
    const muitas = Array.from({ length: 40 }, (_, i) => rolagem(`r${i}`, i))
    const junto = juntarRolagens([], muitas)
    expect(junto).toHaveLength(30)
    expect(junto[0]?.id).toBe('r39')
  })
})

describe('textos', () => {
  it('hora curta para hoje, com o dia para outros dias', () => {
    const agora = new Date(2026, 10, 23, 1, 30).getTime()
    expect(formatarHora(new Date(2026, 10, 23, 1, 7).getTime(), agora)).toBe('01:07')
    expect(formatarHora(new Date(2026, 10, 22, 21, 5).getTime(), agora)).toBe('22/11 21:05')
  })

  it('a própria pessoa aparece como Você', () => {
    const contas = [{ id: 'ana', nome: 'Ana' }]
    expect(nomeDeQuemRolou('ana', 'ana', contas)).toBe('Você')
    expect(nomeDeQuemRolou('ana', 'bruno', contas)).toBe('Ana')
    expect(nomeDeQuemRolou('', null, contas)).toBe('Você')
    expect(nomeDeQuemRolou('sumiu', 'bruno', contas)).toBe('Alguém')
  })

  it('marca a face mais alta e a mais baixa, menos no d2', () => {
    expect(extremo({ lados: 20, resultado: 20 })).toBe('maximo')
    expect(extremo({ lados: 20, resultado: 1 })).toBe('minimo')
    expect(extremo({ lados: 20, resultado: 7 })).toBeNull()
    expect(extremo({ lados: 2, resultado: 2 })).toBeNull()
  })

  it('frase para o leitor de tela', () => {
    expect(descreverRolagem(rolagem('a', 1, { resultado: 20 }), 'Você')).toBe('Você tirou 20 no d20, o máximo.')
    expect(descreverRolagem(rolagem('a', 1, { lados: 6, resultado: 4, secreta: true }), 'Ana')).toBe('Ana tirou 4 no d6, em segredo.')
  })
})
