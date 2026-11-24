import { beforeAll, describe, expect, it } from 'vitest'
import type { EventoQuadro } from '../quadro/tipos'
import type { ConexaoServidor } from './conexao'
import { campanhaDeTeste, ENDERECO_DE_TESTE, entrarComoTeste, esperarAte, instalarEventSource } from './teste-servidor'

// O RepositorioQuadroPocketBase contra um PocketBase de verdade, com o SDK de verdade: o servidor de
// teste (pocketbase/servidor-de-teste.mjs). Pulado sem DISCORDVTT_SERVIDOR_TESTE. A verificação do
// GitHub sobe o servidor de teste e roda estes testes em todo pull request.

// PNG de 1 por 1 pixel, para o servidor conseguir fazer a miniatura.
const PNG_PEQUENO = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0),
)

function abrir(conexao: ConexaoServidor) {
  const repositorio = conexao.abrirRepositorioQuadro()
  if (!repositorio) throw new Error('Sem campanha aberta para abrir o quadro.')
  const eventos: EventoQuadro[] = []
  repositorio.assinar((e) => eventos.push(e))
  return { repositorio, eventos }
}

describe.skipIf(!ENDERECO_DE_TESTE)('RepositorioQuadroPocketBase com o servidor de verdade', () => {
  let mestre: ConexaoServidor
  let jogadora: ConexaoServidor

  beforeAll(async () => {
    instalarEventSource()
    mestre = await entrarComoTeste('mestre')
    jogadora = await entrarComoTeste('jogadora')
  }, 30000)

  it('a jogadora envia uma imagem e prende no quadro, e o mestre vê, abre e move', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    // O tempo real liga em segundo plano: espera os dois estarem ouvindo.
    await doMestre.repositorio.carregar()
    await daJogadora.repositorio.carregar()
    await new Promise((resolver) => setTimeout(resolver, 500))

    const imagem = await daJogadora.repositorio.enviarImagem(new Blob([PNG_PEQUENO], { type: 'image/png' }), {
      nome: 'Selo do duque',
      nomeArquivo: 'selo.png',
      largura: 1,
      altura: 1,
    })
    expect(imagem).toMatchObject({ nome: 'Selo do duque', bytes: PNG_PEQUENO.length, autorId: jogadora.estado.usuario?.id })
    expect(await esperarAte(() => doMestre.eventos.some((e) => e.tipo === 'imagem' && e.imagem.id === imagem.id))).toBe(true)

    // A imagem é protegida: o mestre abre pelo repositório, que baixa com o token de arquivo.
    const endereco = await doMestre.repositorio.urlDaImagem(imagem, 'miniatura')
    expect(endereco).toMatch(/^blob:/)
    expect((await (await fetch(endereco)).blob()).size).toBeGreaterThan(0)

    const item = await daJogadora.repositorio.criarItem({ tipo: 'imagem', imagemId: imagem.id, x: 400, y: 300, largura: 240, rotacao: -2, z: 1 })
    await doMestre.repositorio.moverItem(item.id, { x: 1500, y: 900, z: 2 })
    expect(await esperarAte(() => daJogadora.eventos.some((e) => e.tipo === 'item' && e.item.id === item.id && e.item.x === 1500))).toBe(true)

    // Apagar a imagem tira ela do quadro.
    await daJogadora.repositorio.apagarImagem(imagem.id)
    expect((await doMestre.repositorio.carregar()).itens.some((i) => i.id === item.id)).toBe(false)
    await Promise.all([doMestre.repositorio.fechar(), daJogadora.repositorio.fechar()])
  }, 30000)

  it('a nota só quem escreveu edita, e o mestre tira do quadro', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    await daJogadora.repositorio.carregar()
    await new Promise((resolver) => setTimeout(resolver, 500))

    const nota = await daJogadora.repositorio.criarItem({ tipo: 'nota', texto: 'O duque mente.', cor: 'amarelo', x: 800, y: 500, largura: 180, rotacao: 2, z: 1 })
    await expect(doMestre.repositorio.editarNota(nota.id, { texto: 'Editado.' })).rejects.toThrow('só quem escreveu a nota edita')
    const editada = await daJogadora.repositorio.editarNota(nota.id, { texto: 'O duque mente, e a irmã sabe.', cor: 'rosa' })
    expect(editada).toMatchObject({ tipo: 'nota', cor: 'rosa' })

    await doMestre.repositorio.tirarItem(nota.id)
    expect(await esperarAte(() => daJogadora.eventos.some((e) => e.tipo === 'itemApagado' && e.id === nota.id))).toBe(true)
    await Promise.all([doMestre.repositorio.fechar(), daJogadora.repositorio.fechar()])
  }, 30000)

  it('sair do servidor fecha o quadro', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const { repositorio } = abrir(jogadora)
    await repositorio.carregar()
    jogadora.sair()
    expect(repositorio.fechado).toBe(true)
    await expect(repositorio.carregar()).rejects.toThrow('você trocou de campanha ou saiu do servidor')
  }, 30000)
})
