import { describe, expect, it } from 'vitest'
import { FECHADO_LOCAL, RepositorioDadosLocal } from './local'
import { LADOS, type Rolagem } from './tipos'

describe('RepositorioDadosLocal', () => {
  it('rola cada dado dentro dos próprios lados, com o gerador do navegador', async () => {
    const local = new RepositorioDadosLocal()
    for (const lados of LADOS) {
      for (let i = 0; i < 50; i++) {
        const { resultado } = await local.rolar(lados)
        expect(resultado).toBeGreaterThanOrEqual(1)
        expect(resultado).toBeLessThanOrEqual(lados)
      }
    }
  })

  it('avisa quem ouve e guarda o histórico, da mais nova para a mais velha', async () => {
    let agora = 100
    const local = new RepositorioDadosLocal({ agora: () => agora++ })
    const ouvidas: Rolagem[] = []
    const parar = local.assinar((r) => ouvidas.push(r))
    const primeira = await local.rolar(20)
    const segunda = await local.rolar(4)
    parar()
    await local.rolar(6)
    expect(ouvidas.map((r) => r.id)).toEqual([primeira.id, segunda.id])
    expect((await local.recentes(2)).map((r) => r.lados)).toEqual([6, 4])
    expect(primeira.autorId).toBe('')
    expect(primeira.secreta).toBe(false)
    expect(primeira.id).not.toBe(segunda.id)
  })

  it('fechado, não rola mais', async () => {
    const local = new RepositorioDadosLocal()
    await local.fechar()
    await expect(local.rolar(20)).rejects.toThrow(FECHADO_LOCAL)
  })
})
