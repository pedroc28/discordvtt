import { beforeAll, describe, expect, it } from 'vitest'
import type { ConexaoServidor } from './conexao'
import type { EventoTokenBatalha, ResumoCenaBatalha } from './tipos'
import { campanhaDeTeste, ENDERECO_DE_TESTE, entrarComoTeste, esperarAte, instalarEventSource } from './teste-servidor'

// O RepositorioBatalhaPocketBase contra um PocketBase de verdade, com o SDK de verdade: o servidor de
// teste (pocketbase/servidor-de-teste.mjs). Pulado sem DISCORDVTT_SERVIDOR_TESTE. A verificação do
// GitHub sobe o servidor de teste e roda estes testes em todo pull request.

// PNG de 1 por 1 pixel.
const PNG_PEQUENO = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0),
)

const CONFIG = {
  grade: { tipo: 'quadrada', tamanho: 70, x: 0, y: 0, visivel: true, cor: 'clara', opacidade: 0.4 },
  medida: { valorPorCelula: 1.5, unidade: 'm', diagonal: 'simples' },
  encaixar: true,
  fundo: { largura: 1, altura: 1 },
}

const token = (id: string, extra: Record<string, unknown> = {}) => ({ id, nome: id, x: 35, y: 35, tamanho: 1, cor: '#c2185b', ...extra })

function abrir(conexao: ConexaoServidor) {
  const repositorio = conexao.abrirRepositorioBatalha()
  if (!repositorio) throw new Error('Sem campanha aberta para abrir a batalha.')
  return repositorio
}

describe.skipIf(!ENDERECO_DE_TESTE)('RepositorioBatalhaPocketBase com o servidor de verdade', () => {
  let mestre: ConexaoServidor
  let jogadora: ConexaoServidor

  beforeAll(async () => {
    instalarEventSource()
    mestre = await entrarComoTeste('mestre')
    jogadora = await entrarComoTeste('jogadora')
  }, 30000)

  it('o mestre monta e ativa a cena, a jogadora vê só ela e move o próprio token, e o mestre vê', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    const idDaJogadora = jogadora.estado.usuario?.id ?? ''

    const ponte = await doMestre.criarCena('Ponte')
    await doMestre.gravarConfig(ponte, CONFIG)
    await doMestre.gravarImagem(ponte, new Blob([PNG_PEQUENO], { type: 'image/png' }))
    await doMestre.gravarToken(ponte, token('guerreira', { dono: idDaJogadora }))
    await doMestre.gravarToken(ponte, token('orc', { x: 175 }))
    const caverna = await doMestre.criarCena('Caverna')
    await doMestre.gravarToken(caverna, token('dragao', { tamanho: 3 }))

    // Antes de ativar, a jogadora não vê nenhuma cena. Depois, só a ativa.
    expect(await daJogadora.listarCenas()).toEqual([])
    const listas: ResumoCenaBatalha[][] = []
    daJogadora.assinarCenas((l) => listas.push(l))
    await new Promise((resolver) => setTimeout(resolver, 500))
    await doMestre.ativarCena(ponte)
    expect(await esperarAte(() => listas.some((l) => l.length === 1 && l[0].id === ponte && l[0].ativa))).toBe(true)

    const vista = await daJogadora.carregarCena(ponte)
    expect(vista.config).toEqual(CONFIG)
    expect(vista.imagemUrl).toMatch(/^blob:/)
    expect(vista.tokens.map((t) => t.id).sort()).toEqual(['guerreira', 'orc'])
    expect(vista.tokens.find((t) => t.id === 'guerreira')?.dono).toBe(idDaJogadora)
    await expect(daJogadora.carregarCena(caverna)).rejects.toThrow('a cena não está mais ativa')

    const doMestreVistos: EventoTokenBatalha[] = []
    await doMestre.carregarCena(ponte)
    doMestre.assinarTokens(ponte, (e) => doMestreVistos.push(e))
    await new Promise((resolver) => setTimeout(resolver, 500))
    await daJogadora.gravarToken(ponte, token('guerreira', { x: 245, y: 105 }))
    expect(await esperarAte(() => doMestreVistos.some((e) => e.tipo === 'gravado' && e.token.id === 'guerreira' && e.token.x === 245))).toBe(true)
    await expect(daJogadora.gravarToken(ponte, token('orc', { x: 0 }))).rejects.toThrow('você só move os tokens que o mestre deu a você')

    // Trocar de cena: a jogadora fica sabendo e passa a ver a outra.
    await doMestre.ativarCena(caverna)
    expect(await esperarAte(() => listas.some((l) => l.length === 1 && l[0].id === caverna))).toBe(true)
    expect((await daJogadora.carregarCena(caverna)).tokens.map((t) => t.id)).toEqual(['dragao'])

    await Promise.all([doMestre.fechar(), daJogadora.fechar()])
  }, 30000)

  it('o mestre importa uma cena inteira, e o servidor explica o que recusa', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const cena = await doMestre.criarCena('Masmorra')
    await doMestre.gravarToken(cena, token('velho'))
    await doMestre.importarCena(cena, {
      config: CONFIG,
      tokens: [token('a'), token('b', { x: 105 }), token('c', { dono: null })],
      imagem: new Blob([PNG_PEQUENO], { type: 'image/png' }),
    })
    const importada = await doMestre.carregarCena(cena)
    expect(importada.tokens.map((t) => t.id).sort()).toEqual(['a', 'b', 'c'])
    expect(importada.imagemUrl).toMatch(/^blob:/)

    await expect(doMestre.gravarConfig(cena, { ...CONFIG, grade: { ...CONFIG.grade, tamanho: 2 } })).rejects.toThrow(
      'o servidor recusou: o tamanho da grade precisa ficar entre 8 e 1000.',
    )
    await doMestre.fechar()
  }, 30000)
})
