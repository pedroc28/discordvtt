// A viagem da campanha: o que vai ao servidor, a espera de gravação e o que chega do mestre.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RepositorioMemoria, temViagem } from './repositorio'
import { CONFIG_PADRAO, normalizarConfig, type ConfigViagem } from './viagem'
import { CAMPOS_DA_CAMPANHA, ViagemDaCampanha, aplicarCampanha, daCampanha, difereDaCampanha, paraServidor } from './viagem-campanha'

/** Repositório com a viagem, como o do servidor. */
class RepositorioComViagemFalso extends RepositorioMemoria {
  guardado: unknown = null
  gravacoes: unknown[] = []
  falhar = false
  private ouvintesV = new Set<(c: unknown) => void>()

  async carregarViagem() {
    return this.guardado
  }
  async gravarViagem(config: unknown) {
    if (this.falhar) throw new Error('o servidor recusou: só o mestre grava a viagem.')
    this.gravacoes.push(config)
    this.guardado = config
    this.de(config)
  }
  assinarViagem(o: (c: unknown) => void) {
    this.ouvintesV.add(o)
    return () => this.ouvintesV.delete(o)
  }
  /** O mestre gravou de outro aparelho. */
  de(config: unknown) {
    for (const o of this.ouvintesV) o(config)
  }
}

const config = (parcial: Partial<ConfigViagem> = {}): ConfigViagem => ({ ...CONFIG_PADRAO, ...parcial })

describe('campos da campanha', () => {
  it('só os campos da campanha vão ao servidor, todos números', () => {
    const saida = paraServidor(config({ ritmo: 'rapido', diasManuais: 9, estoqueRacoes: 12 })) as unknown as Record<string, unknown>
    expect(Object.keys(saida).sort()).toEqual([...CAMPOS_DA_CAMPANHA].sort())
    expect(Object.values(saida).every((v) => typeof v === 'number')).toBe(true)
    expect(saida.estoqueRacoes).toBe(12)
    expect('ritmo' in saida).toBe(false)
    expect('diasManuais' in saida).toBe(false)
  })

  it('cabe nos limites do servidor: 32 campos, números de 0 a 100 mil, 4 KB', () => {
    const maximo = normalizarConfig(Object.fromEntries(CAMPOS_DA_CAMPANHA.map((k) => [k, 1e9])))
    const saida = paraServidor(maximo) as unknown as Record<string, number>
    expect(Object.keys(saida).length).toBeLessThanOrEqual(32)
    for (const v of Object.values(saida)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100000)
    }
    expect(JSON.stringify(saida).length).toBeLessThan(4096)
  })

  it('o que vem do servidor é validado e completado', () => {
    const c = daCampanha({ viajantes: 6, estoqueAgua: 'muita', kmPorDia: -5, lixo: 1 })
    expect(c.viajantes).toBe(6)
    expect(c.estoqueAgua).toBe(CONFIG_PADRAO.estoqueAgua)
    expect(c.kmPorDia).toBe(1)
    expect('lixo' in c).toBe(false)
    expect(daCampanha(null)).toEqual(paraServidor(CONFIG_PADRAO))
  })

  it('a campanha entra por cima da configuração local, que mantém ritmo e dias', () => {
    const local = config({ ritmo: 'lento', diasManuais: 5, viajantes: 9 })
    const nova = aplicarCampanha(local, daCampanha({ viajantes: 3 }))
    expect(nova.viajantes).toBe(3)
    expect(nova.ritmo).toBe('lento')
    expect(nova.diasManuais).toBe(5)
  })

  it('difere da campanha só nos campos da campanha', () => {
    const campanha = daCampanha({ viajantes: 4 })
    expect(difereDaCampanha(config({ viajantes: 4, ritmo: 'rapido', diasManuais: 3 }), campanha)).toBe(false)
    expect(difereDaCampanha(config({ viajantes: 5 }), campanha)).toBe(true)
  })

  it('um repositório sem os três métodos não tem viagem', () => {
    expect(temViagem(new RepositorioMemoria())).toBe(false)
    expect(temViagem(new RepositorioComViagemFalso())).toBe(true)
  })
})

describe('gravação do mestre', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function mestre(repo = new RepositorioComViagemFalso()) {
    return { v: new ViagemDaCampanha(repo, true, 700), repo }
  }

  it('várias mudanças seguidas viram uma gravação só, 700 ms depois da última', async () => {
    const { v, repo } = mestre()
    v.gravar(config({ estoqueRacoes: 1 }))
    await vi.advanceTimersByTimeAsync(500)
    v.gravar(config({ estoqueRacoes: 12 }))
    await vi.advanceTimersByTimeAsync(500)
    expect(repo.gravacoes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(repo.gravacoes).toHaveLength(1)
    expect((repo.gravacoes[0] as { estoqueRacoes: number }).estoqueRacoes).toBe(12)
    expect(v.estado).toBe('salvo')
  })

  it('mudar só o que é local (ritmo) não grava', async () => {
    const { v, repo } = mestre()
    repo.guardado = paraServidor(config())
    await v.carregar()
    v.gravar(config({ ritmo: 'rapido', diasManuais: 4 }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(repo.gravacoes).toHaveLength(0)
  })

  it('quem não é mestre nunca grava', async () => {
    const repo = new RepositorioComViagemFalso()
    const v = new ViagemDaCampanha(repo, false, 700)
    v.gravar(config({ viajantes: 9 }))
    await vi.advanceTimersByTimeAsync(2000)
    expect(repo.gravacoes).toHaveLength(0)
    expect(v.pendente).toBe(false)
  })

  it('se o servidor recusa, mostra o erro, guarda a mudança e tenta de novo', async () => {
    const { v, repo } = mestre()
    repo.falhar = true
    v.gravar(config({ viajantes: 7 }))
    await vi.advanceTimersByTimeAsync(800)
    expect(v.estado).toBe('erro')
    expect(v.erro).toContain('só o mestre')
    expect(v.pendente).toBe(true)
    repo.falhar = false
    v.tentarDeNovo()
    await vi.advanceTimersByTimeAsync(0)
    expect(v.estado).toBe('salvo')
    expect((repo.gravacoes[0] as { viajantes: number }).viajantes).toBe(7)
  })

  it('ao sair, o que está esperando é gravado na hora', async () => {
    const { v, repo } = mestre()
    v.gravar(config({ estoqueAgua: 40 }))
    v.destruir()
    await vi.advanceTimersByTimeAsync(0)
    expect(repo.gravacoes).toHaveLength(1)
  })

  it('carregar devolve null enquanto o mestre nunca gravou', async () => {
    const { v } = mestre()
    expect(await v.carregar()).toBeNull()
  })
})

describe('o que chega do mestre', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('o jogador recebe a mudança do mestre', async () => {
    const repo = new RepositorioComViagemFalso()
    const jogador = new ViagemDaCampanha(repo, false)
    const recebidos: number[] = []
    jogador.ouvir((c) => recebidos.push(c.estoqueRacoes))
    repo.de({ estoqueRacoes: 30 })
    expect(recebidos).toEqual([30])
  })

  it('o mestre com gravação no ar não é atropelado pelo que chega', async () => {
    const repo = new RepositorioComViagemFalso()
    const mestre = new ViagemDaCampanha(repo, true, 700)
    const recebidos: number[] = []
    mestre.ouvir((c) => recebidos.push(c.estoqueRacoes))
    mestre.gravar(config({ estoqueRacoes: 5 }))
    repo.de({ estoqueRacoes: 99 })
    expect(recebidos).toEqual([])
    await vi.advanceTimersByTimeAsync(800)
    // O eco da própria gravação chegou durante a gravação e também foi ignorado. Depois, o que vem de fora vale.
    expect(recebidos).toEqual([])
    repo.de({ estoqueRacoes: 60 })
    expect(recebidos).toEqual([60])
  })

  it('parar de ouvir cancela a assinatura', () => {
    const repo = new RepositorioComViagemFalso()
    const jogador = new ViagemDaCampanha(repo, false)
    const recebidos: number[] = []
    jogador.ouvir((c) => recebidos.push(c.estoqueRacoes))
    jogador.destruir()
    repo.de({ estoqueRacoes: 1 })
    expect(recebidos).toEqual([])
  })
})
