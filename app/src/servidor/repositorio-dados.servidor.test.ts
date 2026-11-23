import { beforeAll, describe, expect, it } from 'vitest'
import type { Rolagem } from '../dados/tipos'
import type { ConexaoServidor } from './conexao'
import { DADOS_SO_MESTRE } from './erros'
import type { RepositorioDadosPocketBase } from './repositorio-dados'
import { campanhaDeTeste, ENDERECO_DE_TESTE, entrarComoTeste, esperarAte, instalarEventSource } from './teste-servidor'

// O RepositorioDadosPocketBase contra um PocketBase de verdade, com o SDK de verdade: o servidor de teste
// (pocketbase/servidor-de-teste.mjs). Pulado sem DISCORDVTT_SERVIDOR_TESTE. A verificação do GitHub
// sobe o servidor de teste e roda estes testes em todo pull request.

function abrir(conexao: ConexaoServidor) {
  const repositorio = conexao.abrirRepositorioDados()
  if (!repositorio) throw new Error('Sem campanha aberta para abrir as rolagens.')
  const ouvidas: Rolagem[] = []
  repositorio.assinar((r) => ouvidas.push(r))
  return { repositorio, ouvidas }
}

/** Espera o tempo real das rolagens valer, rolando até a outra pessoa receber. */
async function esperarTempoReal(quemRola: RepositorioDadosPocketBase, quemOuve: Rolagem[]): Promise<Rolagem> {
  for (let i = 0; i < 5; i++) {
    const rolagem = await quemRola.rolar(4)
    if (await esperarAte(() => quemOuve.some((r) => r.id === rolagem.id), 1000)) return rolagem
  }
  throw new Error('O tempo real das rolagens não chegou.')
}

describe.skipIf(!ENDERECO_DE_TESTE)('RepositorioDadosPocketBase com o servidor de verdade', () => {
  let mestre: ConexaoServidor
  let jogadora: ConexaoServidor

  beforeAll(async () => {
    instalarEventSource()
    mestre = await entrarComoTeste('mestre')
    jogadora = await entrarComoTeste('jogadora')
  }, 30000)

  it('o servidor sorteia, e a jogadora vê a rolagem do mestre na hora', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    expect(doMestre.repositorio.podeRolarEmSegredo).toBe(true)
    expect(daJogadora.repositorio.podeRolarEmSegredo).toBe(false)
    await esperarTempoReal(doMestre.repositorio, daJogadora.ouvidas)

    const d20 = await doMestre.repositorio.rolar(20)
    expect(d20.resultado).toBeGreaterThanOrEqual(1)
    expect(d20.resultado).toBeLessThanOrEqual(20)
    expect(d20.autorId).toBe(mestre.estado.usuario?.id)
    expect(await esperarAte(() => daJogadora.ouvidas.some((r) => r.id === d20.id && r.resultado === d20.resultado))).toBe(true)
    expect((await daJogadora.repositorio.recentes(30))[0]).toEqual(d20)
    await Promise.all([doMestre.repositorio.fechar(), daJogadora.repositorio.fechar()])
  }, 30000)

  it('a rolagem secreta chega só aos mestres', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    await esperarTempoReal(doMestre.repositorio, daJogadora.ouvidas)

    const secreta = await doMestre.repositorio.rolar(20, { secreta: true })
    expect(secreta.secreta).toBe(true)
    const aberta = await doMestre.repositorio.rolar(6)
    // A aberta, feita depois, chega à jogadora: se a secreta fosse chegar, já teria chegado.
    expect(await esperarAte(() => daJogadora.ouvidas.some((r) => r.id === aberta.id))).toBe(true)
    expect(daJogadora.ouvidas.some((r) => r.id === secreta.id)).toBe(false)
    expect((await daJogadora.repositorio.recentes(30)).some((r) => r.id === secreta.id)).toBe(false)
    expect((await doMestre.repositorio.recentes(30)).slice(0, 2).map((r) => r.id)).toEqual([aberta.id, secreta.id])
    await expect(daJogadora.repositorio.rolar(20, { secreta: true })).rejects.toThrow(DADOS_SO_MESTRE)
    await Promise.all([doMestre.repositorio.fechar(), daJogadora.repositorio.fechar()])
  }, 30000)

  it('sair do servidor fecha as rolagens', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const { repositorio } = abrir(jogadora)
    await repositorio.recentes(30)
    jogadora.sair()
    expect(repositorio.fechado).toBe(true)
    await expect(repositorio.rolar(6)).rejects.toThrow('você trocou de campanha ou saiu do servidor')
  }, 30000)
})
