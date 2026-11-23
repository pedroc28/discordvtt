import { describe, expect, it } from 'vitest'
import { RepositorioDadosLocal } from './local'
import { MesaDados } from './mesa'
import type { OuvinteRolagem, RepositorioDados } from './repositorio'
import type { Lados, Rolagem } from './tipos'

const esperar = (ms = 0) => new Promise((resolver) => setTimeout(resolver, ms))

/** Repositório de mentira: o teste decide quando cada rolagem responde e o que chega dos outros. */
class RepositorioFalso implements RepositorioDados {
  readonly compartilhado = true
  podeRolarEmSegredo = false
  ouvintes = new Set<OuvinteRolagem>()
  anteriores: Rolagem[] = []
  pedidos: Array<{ lados: Lados; secreta: boolean; responder: (r: Rolagem) => void; falhar: (e: Error) => void }> = []
  fechado = false
  private contador = 0

  rolar(lados: Lados, opcoes: { secreta?: boolean } = {}): Promise<Rolagem> {
    return new Promise((responder, falhar) => this.pedidos.push({ lados, secreta: opcoes.secreta === true, responder, falhar }))
  }

  /** Responde o pedido `indice` com o resultado, como o servidor faria, e avisa pelo tempo real. */
  responder(indice: number, resultado: number, eco = true): Rolagem {
    const pedido = this.pedidos[indice]
    if (!pedido) throw new Error('pedido inexistente')
    const rolagem: Rolagem = { id: `r${++this.contador}`, autorId: 'eu', lados: pedido.lados, resultado, quando: 1000 + this.contador, secreta: pedido.secreta }
    if (eco) this.chegar(rolagem)
    pedido.responder(rolagem)
    return rolagem
  }

  chegar(rolagem: Rolagem) {
    for (const ouvinte of [...this.ouvintes]) ouvinte(rolagem)
  }

  async recentes(): Promise<Rolagem[]> {
    return this.anteriores
  }

  assinar(ouvinte: OuvinteRolagem): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  async fechar() {
    this.fechado = true
  }
}

const deOutro = (id: string, quando: number): Rolagem => ({ id, autorId: 'ana', lados: 6, resultado: 3, quando, secreta: false })

describe('MesaDados', () => {
  it('abre com as últimas rolagens e recebe as novas', async () => {
    const repositorio = new RepositorioFalso()
    repositorio.anteriores = [deOutro('a', 100)]
    const mesa = new MesaDados(() => repositorio)
    expect(mesa.estado.carregando).toBe(true)
    await mesa.abrir()
    expect(mesa.estado.carregando).toBe(false)
    expect(mesa.estado.historico.map((r) => r.id)).toEqual(['a'])

    repositorio.chegar(deOutro('b', 200))
    repositorio.chegar(deOutro('b', 200))
    expect(mesa.estado.historico.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('rolar mostra o dado rolando e depois o resultado grande', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio)
    await mesa.abrir()
    const rolando = mesa.rolar(20)
    expect(mesa.estado.rolando).toBe(20)
    repositorio.responder(0, 17)
    await rolando
    expect(mesa.estado.rolando).toBeNull()
    expect(mesa.estado.ultima?.resultado).toBe(17)
    expect(mesa.estado.historico.map((r) => r.resultado)).toEqual([17])
  })

  it('o histórico não mostra o resultado antes da rolagem grande', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio, { esperaMinima: 40 })
    await mesa.abrir()
    const rolando = mesa.rolar(20)
    repositorio.responder(0, 17)
    // O eco do tempo real e a rolagem de outra pessoa chegam enquanto o dado ainda gira.
    repositorio.chegar(deOutro('outro', 5000))
    await esperar(5)
    expect(mesa.estado.historico).toEqual([])
    expect(mesa.estado.ultima).toBeNull()
    await rolando
    expect(mesa.estado.ultima?.resultado).toBe(17)
    expect(mesa.estado.historico.map((r) => r.id)).toEqual(['outro', 'r1'])
  })

  it('com duas rolagens seguidas, a grande é a da última pedida', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio)
    await mesa.abrir()
    const primeira = mesa.rolar(6)
    const segunda = mesa.rolar(8)
    repositorio.responder(1, 8)
    repositorio.responder(0, 2)
    await Promise.all([primeira, segunda])
    expect(mesa.estado.ultima?.lados).toBe(8)
    expect(mesa.estado.historico).toHaveLength(2)
  })

  it('erro vira mensagem que diz o que fazer', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio)
    await mesa.abrir()
    const rolando = mesa.rolar(20)
    repositorio.pedidos[0]?.falhar(new Error('muitas rolagens seguidas. Espere alguns segundos e role de novo.'))
    await rolando
    expect(mesa.estado.rolando).toBeNull()
    expect(mesa.estado.erro).toBe('Não consegui rolar: muitas rolagens seguidas. Espere alguns segundos e role de novo.')
    mesa.limparErro()
    expect(mesa.estado.erro).toBeNull()
  })

  it('rolagem secreta só sai para quem pode', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio)
    await mesa.abrir()
    void mesa.rolar(20, true)
    expect(repositorio.pedidos[0]?.secreta).toBe(false)

    const doMestre = new RepositorioFalso()
    doMestre.podeRolarEmSegredo = true
    const mesaDoMestre = new MesaDados(() => doMestre)
    await mesaDoMestre.abrir()
    void mesaDoMestre.rolar(20, true)
    expect(doMestre.pedidos[0]?.secreta).toBe(true)
  })

  it('depois de fechar, resposta atrasada não muda nada', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio)
    await mesa.abrir()
    const rolando = mesa.rolar(20)
    await mesa.fechar()
    expect(repositorio.fechado).toBe(true)
    repositorio.responder(0, 17)
    await rolando
    expect(mesa.estado.ultima).toBeNull()
    expect(mesa.estado.rolando).toBe(20)
  })

  it('abre de novo depois de fechar, com um repositório novo', async () => {
    // O React, em desenvolvimento, monta, desmonta e monta de novo cada tela.
    const criados: RepositorioFalso[] = []
    const mesa = new MesaDados(() => {
      const novo = new RepositorioFalso()
      criados.push(novo)
      return novo
    })
    await mesa.abrir()
    await mesa.fechar()
    await mesa.abrir()
    expect(criados.map((r) => r.fechado)).toEqual([true, false])
    criados[0]?.chegar(deOutro('velha', 100))
    expect(mesa.estado.historico).toEqual([])
    const rolando = mesa.rolar(20)
    criados[1]?.responder(0, 5)
    await rolando
    expect(mesa.estado.ultima?.resultado).toBe(5)
  })

  it('antes de abrir, rolar não faz nada', async () => {
    const repositorio = new RepositorioFalso()
    const mesa = new MesaDados(() => repositorio)
    await mesa.rolar(20)
    expect(repositorio.pedidos).toEqual([])
  })

  it('funciona com a rolagem local', async () => {
    let byte = 0
    const local = new RepositorioDadosLocal({ proximoByte: () => byte++ })
    const mesa = new MesaDados(() => local)
    await mesa.abrir()
    expect(mesa.estado.compartilhado).toBe(false)
    expect(mesa.estado.podeRolarEmSegredo).toBe(false)
    await mesa.rolar(6)
    await mesa.rolar(6)
    expect(mesa.estado.historico.map((r) => r.resultado)).toEqual([2, 1])
    expect(mesa.estado.ultima?.resultado).toBe(2)
  })
})
