import { beforeAll, describe, expect, it } from 'vitest'
import { ControladorMapa } from '../mapa/controlador'
import type { Hexagono, Lote } from '../mapa/tipos'
import { normalizarConfig } from '../mapa/viagem'
import { ViagemDaCampanha, type CamposDaCampanha } from '../mapa/viagem-campanha'
import casos from './casos-chunk.json'
import type { ConexaoServidor } from './conexao'
import type { RepositorioPocketBase } from './repositorio-mapa'
import { campanhaDeTeste, ENDERECO_DE_TESTE, entrarComoTeste, esperarAte, instalarEventSource } from './teste-servidor'

// O RepositorioPocketBase contra um PocketBase de verdade, com o SDK de verdade: o servidor de teste
// (pocketbase/servidor-de-teste.mjs). Pulado sem DISCORDVTT_SERVIDOR_TESTE. A verificação do GitHub
// sobe o servidor de teste e roda estes testes em todo pull request.

const hexagono = (q: number, r: number, terreno: string): Hexagono => ({
  q,
  r,
  terreno,
  regiaoId: null,
  nome: '',
  nota: '',
  marcadores: [],
  rios: [],
  estradas: [],
  rev: 1,
})

let id = 0
const lote = (mudancas: Lote['mudancas']): Lote => ({ id: `teste-${Date.now()}-${++id}`, autor: '', ts: Date.now(), mudancas, regioes: [] })

function abrir(conexao: ConexaoServidor): RepositorioPocketBase {
  const repositorio = conexao.abrirRepositorioMapa()
  if (!repositorio) throw new Error('Sem campanha aberta para abrir o mapa.')
  return repositorio
}

describe.skipIf(!ENDERECO_DE_TESTE)('RepositorioPocketBase com o servidor de verdade', () => {
  let mestre: ConexaoServidor
  let jogadora: ConexaoServidor

  beforeAll(async () => {
    instalarEventSource()
    mestre = await entrarComoTeste('mestre')
    jogadora = await entrarComoTeste('jogadora')
  }, 20000)

  it('dois participantes veem as edições um do outro', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const a = new ControladorMapa(abrir(mestre), mestre.estado.usuario?.id ?? '')
    const b = new ControladorMapa(abrir(jogadora), jogadora.estado.usuario?.id ?? '')
    await Promise.all([a, b].flatMap((c) => [c.garantirChunk('0,0'), c.garantirChunk('-1,-2'), c.carregarRegioes(), c.carregarToken()]))

    const traco = a.iniciarTraco()
    traco.pintar([{ q: 2, r: 3 }, { q: -1, r: -17 }], 'floresta')
    traco.confirmar()
    expect(await esperarAte(() => b.armazem.ler(-1, -17)?.terreno === 'floresta' && b.armazem.ler(2, 3)?.terreno === 'floresta')).toBe(true)

    const regiao = b.criarRegiao({ nome: 'Vale', cor: '#336699' })
    expect(regiao).not.toBeNull()
    expect(await esperarAte(() => !!regiao && a.armazem.lerRegiao(regiao)?.nome === 'Vale')).toBe(true)

    b.moverToken({ q: 2, r: 3 })
    expect(await esperarAte(() => a.token?.q === 2 && a.token.r === 3)).toBe(true)

    a.desfazer()
    expect(await esperarAte(() => b.armazem.ler(2, 3) === null && b.armazem.ler(-1, -17) === null)).toBe(true)
    a.destruir()
    b.destruir()
  }, 20000)

  it('cada hexágono chega pelo chunk que o mapa pede, inclusive com coordenadas negativas', async () => {
    await campanhaDeTeste(mestre, [])
    const repositorio = abrir(mestre)
    await repositorio.aplicar(lote(casos.map((c) => ({ q: c.q, r: c.r, antes: null, depois: hexagono(c.q, c.r, 'campo') }))))
    for (const c of casos) {
      const chunk = await repositorio.carregarChunk(c.chunk)
      expect(chunk.some((h) => h.q === c.q && h.r === c.r), `(${c.q}, ${c.r}) no chunk ${c.chunk}`).toBe(true)
    }
    await repositorio.fechar()
  }, 20000)

  it('um lote reenviado é gravado e entregue uma vez só', async () => {
    await campanhaDeTeste(mestre, [])
    const repositorio = abrir(mestre)
    const recebidos: string[] = []
    repositorio.assinar((l) => recebidos.push(l.id))
    const meu = lote([{ q: 0, r: 0, antes: null, depois: hexagono(0, 0, 'pantano') }])
    await repositorio.aplicar(meu)
    await repositorio.aplicar({ ...meu, mudancas: [{ q: 0, r: 0, antes: null, depois: hexagono(0, 0, 'geleira') }] })
    await new Promise((resolver) => setTimeout(resolver, 500))
    expect(recebidos).toEqual([meu.id])
    expect((await repositorio.carregarChunk('0,0')).map((h) => h.terreno)).toEqual(['pantano'])
    await repositorio.fechar()
  }, 20000)

  it('um lote recusado pelo servidor diz o motivo', async () => {
    await campanhaDeTeste(mestre, [])
    const repositorio = abrir(mestre)
    await expect(repositorio.aplicar(lote([{ q: 5, r: -5, antes: null, depois: hexagono(5, -5, '') }]))).rejects.toThrow(
      'o servidor recusou: o hexágono (5, -5) não tem terreno.',
    )
    await repositorio.fechar()
  }, 20000)

  it('a camada do mestre chega só ao mestre, e revelar aparece para o jogador', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    expect([doMestre.ehMestre, daJogadora.ehMestre]).toEqual([true, false])
    const vistosMestre: Lote[] = []
    const vistosJogadora: Lote[] = []
    doMestre.assinar((l) => vistosMestre.push(l))
    daJogadora.assinar((l) => vistosJogadora.push(l))
    await Promise.all([doMestre.carregarRegioes(), daJogadora.carregarRegioes()])

    const esconder = { ...lote([]), privado: { ocultos: [{ q: 4, r: -20, antes: null, depois: hexagono(4, -20, 'ruinas') }], notas: [{ q: 4, r: -20, antes: null, depois: { q: 4, r: -20, texto: 'A cripta', rev: 1 } }] } }
    await doMestre.aplicar(esconder)
    expect(await esperarAte(() => vistosMestre.some((l) => l.id === esconder.id && l.privado?.ocultos.length === 1))).toBe(true)
    expect((await doMestre.carregarChunkOculto('0,-2')).map((h) => h.terreno)).toEqual(['ruinas'])
    expect((await doMestre.carregarNotasPrivadas('0,-2')).map((n) => n.texto)).toEqual(['A cripta'])
    expect(await daJogadora.carregarChunkOculto('0,-2')).toEqual([])

    const revelar = { ...lote([{ q: 4, r: -20, antes: null, depois: hexagono(4, -20, 'ruinas') }]), privado: { ocultos: [{ q: 4, r: -20, antes: null, depois: null }], notas: [] } }
    await doMestre.aplicar(revelar)
    expect(await esperarAte(() => vistosJogadora.some((l) => l.id === revelar.id))).toBe(true)
    expect(vistosJogadora.every((l) => !l.privado && l.id !== esconder.id)).toBe(true)
    expect((await daJogadora.carregarChunk('0,-2')).map((h) => h.terreno)).toEqual(['ruinas'])
    expect(await doMestre.carregarChunkOculto('0,-2')).toEqual([])
    await Promise.all([doMestre.fechar(), daJogadora.fechar()])
  }, 20000)

  it('o mestre trava o mapa, a jogadora fica sabendo e não edita', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = abrir(mestre)
    const daJogadora = abrir(jogadora)
    const vistas: string[] = []
    daJogadora.assinarPermissao((p) => vistas.push(p))
    await daJogadora.carregarRegioes()
    await doMestre.gravarPermissao('mestre')
    expect(await esperarAte(() => vistas.includes('mestre'))).toBe(true)
    await expect(daJogadora.aplicar(lote([{ q: 0, r: 0, antes: null, depois: hexagono(0, 0, 'campo') }]))).rejects.toThrow('só o mestre edita este mapa')
    await doMestre.gravarPermissao('todos')
    expect(await esperarAte(() => vistas.at(-1) === 'todos')).toBe(true)
    await daJogadora.aplicar(lote([{ q: 0, r: 0, antes: null, depois: hexagono(0, 0, 'campo') }]))
    await Promise.all([doMestre.fechar(), daJogadora.fechar()])
  }, 20000)

  it('o mestre grava a viagem, a jogadora recebe e não grava', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const doMestre = new ViagemDaCampanha(abrir(mestre), true, 0)
    const repoDaJogadora = abrir(jogadora)
    const daJogadora = new ViagemDaCampanha(repoDaJogadora, false)
    const vistas: CamposDaCampanha[] = []
    daJogadora.ouvir((campos) => vistas.push(campos))
    // Campanha nova: o mestre nunca gravou, e o mapa usa os valores padrão.
    expect(await daJogadora.carregar()).toBeNull()
    expect(await doMestre.carregar()).toBeNull()

    doMestre.gravar({ ...normalizarConfig(null), viajantes: 5, estoqueAgua: 42.5 })
    await doMestre.descarregar()
    expect(doMestre.estado).toBe('salvo')
    expect(await esperarAte(() => vistas.some((c) => c.viajantes === 5 && c.estoqueAgua === 42.5))).toBe(true)
    expect(await daJogadora.carregar()).toMatchObject({ viajantes: 5, estoqueAgua: 42.5 })

    await expect(repoDaJogadora.gravarViagem({ viajantes: 1 })).rejects.toThrow('só o mestre da campanha muda as regras e o estoque da viagem.')
    const repoDoMestre = abrir(mestre)
    await expect(repoDoMestre.gravarViagem({ estoqueAgua: -1 })).rejects.toThrow('o servidor recusou: estoqueAgua precisa ser um número de 0 a 100000.')
    doMestre.destruir()
    daJogadora.destruir()
    await Promise.all([repoDaJogadora.fechar(), repoDoMestre.fechar()])
  }, 20000)

  it('trocar de campanha fecha o mapa, e o próximo pedido explica', async () => {
    await campanhaDeTeste(mestre, [])
    const repositorio = abrir(mestre)
    await repositorio.carregarRegioes()
    await mestre.criarCampanha(`Outra ${Date.now()}`)
    expect(repositorio.fechado).toBe(true)
    await expect(repositorio.carregarChunk('0,0')).rejects.toThrow('você trocou de campanha ou saiu do servidor')
  }, 20000)

  it('sair do servidor fecha o mapa', async () => {
    await campanhaDeTeste(mestre, [jogadora])
    const repositorio = abrir(jogadora)
    await repositorio.carregarRegioes()
    jogadora.sair()
    expect(repositorio.fechado).toBe(true)
    expect(abrir(mestre).fechado).toBe(false)
  }, 20000)
})
