import { describe, expect, it } from 'vitest'
import type { Rolagem } from '../dados/tipos'
import { DADOS_FECHADO, DADOS_INVALIDO, DADOS_SO_MESTRE } from './erros'
import { RepositorioDadosPocketBase, type ClienteDados, type ColecaoDados } from './repositorio-dados'
import type { Cancelar, EventoTempoReal, FiltroServidor } from './repositorio-mapa'

// Servidor de mentira com o mesmo comportamento do hook (pocketbase/pb_hooks/dados.js): sorteia,
// grava quem rolou e avisa pelo tempo real quem pode ver.

type Registro = Record<string, unknown>

/** Erro no formato do SDK do PocketBase. */
const erroDoServidor = (status: number, message = '') => Object.assign(new Error(message), { status, response: { message } })
const esperar = (ms = 0) => new Promise((resolver) => setTimeout(resolver, ms))

class ServidorFalso implements ClienteDados {
  readonly endereco = 'https://servidor.teste'
  registros: Record<ColecaoDados, Registro[]> = { rolagens: [], rolagens_secretas: [] }
  criados: Array<{ colecao: ColecaoDados; dados: Record<string, unknown> }> = []
  assinaturas: Array<{ colecao: ColecaoDados; filtro: FiltroServidor; ouvinte: (e: EventoTempoReal) => void; ativa: boolean }> = []
  reconexoes: Array<() => void> = []
  /** Próximos pedidos falham com este erro. */
  falha: unknown = null
  /** Resultado do próximo sorteio. */
  proximoResultado = 3
  /** Com false, o servidor responde mas não avisa pelo tempo real. */
  avisar = true
  private contador = 0

  async recentes(colecao: ColecaoDados, filtro: FiltroServidor, quantos: number): Promise<unknown[]> {
    if (this.falha) throw this.falha
    return this.registros[colecao]
      .filter((r) => r.campanha === filtro.valores.campanha)
      .slice()
      .reverse()
      .slice(0, quantos)
  }

  async criar(colecao: ColecaoDados, dados: Record<string, unknown>): Promise<unknown> {
    if (this.falha) throw this.falha
    this.criados.push({ colecao, dados })
    const registro = this.registrar(colecao, { ...dados, autor: 'eu', resultado: this.proximoResultado })
    return registro
  }

  /** Grava uma rolagem como o servidor faria e avisa quem assina. */
  registrar(colecao: ColecaoDados, dados: Registro): Registro {
    const segundos = String(++this.contador).padStart(2, '0')
    const registro: Registro = { id: `r${this.contador}`, created: `2026-11-23 04:00:${segundos}.000Z`, ...dados }
    this.registros[colecao].push(registro)
    if (this.avisar) {
      for (const a of this.assinaturas) {
        if (a.ativa && a.colecao === colecao && a.filtro.valores.campanha === registro.campanha) a.ouvinte({ acao: 'create', registro })
      }
    }
    return registro
  }

  async assinar(colecao: ColecaoDados, filtro: FiltroServidor, ouvinte: (e: EventoTempoReal) => void): Promise<Cancelar> {
    const assinatura = { colecao, filtro, ouvinte, ativa: true }
    this.assinaturas.push(assinatura)
    return async () => {
      assinatura.ativa = false
    }
  }

  async aoReconectar(ouvinte: () => void): Promise<Cancelar> {
    this.reconexoes.push(ouvinte)
    return async () => {
      this.reconexoes = this.reconexoes.filter((o) => o !== ouvinte)
    }
  }

  get ativas() {
    return this.assinaturas.filter((a) => a.ativa).map((a) => a.colecao)
  }
}

function abrir(servidor: ServidorFalso, papel: 'mestre' | 'jogador' = 'jogador') {
  const repositorio = new RepositorioDadosPocketBase(servidor, 'campanha1', { papel })
  const ouvidas: Rolagem[] = []
  repositorio.assinar((r) => ouvidas.push(r))
  return { repositorio, ouvidas }
}

describe('RepositorioDadosPocketBase', () => {
  it('manda só a campanha e o dado, e devolve o que o servidor sorteou', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    servidor.proximoResultado = 13
    const rolagem = await repositorio.rolar(20)
    expect(servidor.criados).toEqual([{ colecao: 'rolagens', dados: { campanha: 'campanha1', lados: 20 } }])
    expect(rolagem).toMatchObject({ id: 'r1', autorId: 'eu', lados: 20, resultado: 13, secreta: false })
    expect(rolagem.quando).toBe(Date.parse('2026-11-23T04:00:01.000Z'))
  })

  it('a própria rolagem chega uma vez pela resposta e outra pelo tempo real, com o mesmo id', async () => {
    const servidor = new ServidorFalso()
    const { repositorio, ouvidas } = abrir(servidor)
    await esperar()
    await repositorio.rolar(6)
    expect(ouvidas.map((r) => r.id)).toEqual(['r1', 'r1'])
  })

  it('sem tempo real, a própria rolagem aparece mesmo assim', async () => {
    const servidor = new ServidorFalso()
    servidor.avisar = false
    const { repositorio, ouvidas } = abrir(servidor)
    await repositorio.rolar(6)
    expect(ouvidas.map((r) => r.id)).toEqual(['r1'])
  })

  it('recebe as rolagens dos outros da mesma campanha, e ignora o resto', async () => {
    const servidor = new ServidorFalso()
    const { ouvidas } = abrir(servidor)
    await esperar()
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 8, resultado: 5 })
    servidor.registrar('rolagens', { campanha: 'outra', autor: 'ana', lados: 8, resultado: 5 })
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 8, resultado: 9 })
    servidor.assinaturas[0]?.ouvinte({ acao: 'update', registro: { id: 'x' } })
    expect(ouvidas.map((r) => [r.autorId, r.resultado])).toEqual([['ana', 5]])
  })

  it('jogador não assina nem lê as rolagens secretas', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    await esperar()
    expect(servidor.ativas).toEqual(['rolagens'])
    await expect(repositorio.rolar(20, { secreta: true })).rejects.toThrow(DADOS_SO_MESTRE)
    expect(servidor.criados).toEqual([])
    expect(repositorio.podeRolarEmSegredo).toBe(false)
  })

  it('o mestre rola em segredo e recebe as secretas dos outros mestres', async () => {
    const servidor = new ServidorFalso()
    const { repositorio, ouvidas } = abrir(servidor, 'mestre')
    await esperar()
    expect(servidor.ativas).toEqual(['rolagens', 'rolagens_secretas'])
    const minha = await repositorio.rolar(20, { secreta: true })
    expect(servidor.criados[0]?.colecao).toBe('rolagens_secretas')
    expect(minha.secreta).toBe(true)
    servidor.registrar('rolagens_secretas', { campanha: 'campanha1', autor: 'outro-mestre', lados: 4, resultado: 2 })
    expect(ouvidas.at(-1)).toMatchObject({ autorId: 'outro-mestre', secreta: true })
  })

  it('as mais recentes juntam abertas e secretas, da mais nova para a mais velha', async () => {
    const servidor = new ServidorFalso()
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 6, resultado: 1 })
    servidor.registrar('rolagens_secretas', { campanha: 'campanha1', autor: 'eu', lados: 20, resultado: 2 })
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 6, resultado: 3 })
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 7, resultado: 3 })
    const mestre = new RepositorioDadosPocketBase(servidor, 'campanha1', { papel: 'mestre' })
    expect((await mestre.recentes(30)).map((r) => r.resultado)).toEqual([3, 2, 1])
    expect((await mestre.recentes(2)).map((r) => r.resultado)).toEqual([3, 2])
    const jogador = new RepositorioDadosPocketBase(servidor, 'campanha1')
    expect((await jogador.recentes(30)).map((r) => r.resultado)).toEqual([3, 1])
  })

  it('quando a conexão volta, avisa de novo as mais recentes, da mais velha para a mais nova', async () => {
    const servidor = new ServidorFalso()
    const { ouvidas } = abrir(servidor)
    await esperar()
    servidor.avisar = false
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 6, resultado: 1 })
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 6, resultado: 2 })
    expect(ouvidas).toEqual([])
    for (const ouvinte of servidor.reconexoes) ouvinte()
    await esperar()
    expect(ouvidas.map((r) => r.resultado)).toEqual([1, 2])
  })

  it('erro do servidor vira mensagem que diz o que fazer', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor, 'mestre')
    servidor.falha = erroDoServidor(429)
    await expect(repositorio.rolar(20)).rejects.toThrow('muitas rolagens seguidas')
    servidor.falha = erroDoServidor(0)
    await expect(repositorio.rolar(20)).rejects.toThrow('https://servidor.teste não respondeu')
    servidor.falha = erroDoServidor(400, 'Rolagem recusada: o dado precisa ter 2, 4, 6, 8, 10, 12, 20 lados.')
    await expect(repositorio.rolar(20)).rejects.toThrow('o servidor recusou: o dado precisa ter')
    servidor.falha = erroDoServidor(400, 'Failed to create record.')
    await expect(repositorio.rolar(20, { secreta: true })).rejects.toThrow('ainda é mestre')
    await expect(repositorio.rolar(20)).rejects.toThrow('não participa mais desta campanha')
  })

  it('resposta que o app não entende não vira rolagem', async () => {
    const servidor = new ServidorFalso()
    const { repositorio } = abrir(servidor)
    servidor.proximoResultado = 25
    await expect(repositorio.rolar(20)).rejects.toThrow(DADOS_INVALIDO)
  })

  it('fechar cancela as assinaturas, e rolar depois falha com uma mensagem clara', async () => {
    const servidor = new ServidorFalso()
    const { repositorio, ouvidas } = abrir(servidor, 'mestre')
    await esperar()
    await repositorio.fechar()
    expect(servidor.ativas).toEqual([])
    expect(servidor.reconexoes).toEqual([])
    expect(repositorio.fechado).toBe(true)
    await expect(repositorio.rolar(20)).rejects.toThrow(DADOS_FECHADO)
    await expect(repositorio.recentes(30)).rejects.toThrow(DADOS_FECHADO)
    servidor.registrar('rolagens', { campanha: 'campanha1', autor: 'ana', lados: 6, resultado: 1 })
    expect(ouvidas).toEqual([])
  })

  it('fechar enquanto assina cancela a assinatura que chegar depois', async () => {
    const servidor = new ServidorFalso()
    const repositorio = new RepositorioDadosPocketBase(servidor, 'campanha1')
    repositorio.assinar(() => {})
    await repositorio.fechar()
    await esperar()
    expect(servidor.ativas).toEqual([])
  })
})
