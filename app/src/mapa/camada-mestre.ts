// A camada do mestre em memória: hexágonos ocultos e notas privadas, agrupados por chunk como o mapa.
// Só existe para quem é mestre da campanha. Jogadores nunca recebem estes dados (o servidor não entrega),
// e o controlador não cria esta camada para eles.

import { ArmazemMapa } from './armazem'
import { chave, chaveChunk } from './hex'
import type { MudancaNota, NotaPrivada } from './tipos'

/** Notas privadas carregadas, por chunk. Mesma convenção do armazém dos hexágonos. */
export class ArmazemNotas {
  private chunks = new Map<string, Map<string, NotaPrivada>>()
  /** Sobe a cada mudança. Serve para invalidar caches e atualizar a interface. */
  versao = 0
  private ouvintes = new Set<() => void>()

  ler(q: number, r: number): NotaPrivada | null {
    return this.chunks.get(chaveChunk({ q, r }))?.get(chave(q, r)) ?? null
  }

  temChunk(chaveDoChunk: string): boolean {
    return this.chunks.has(chaveDoChunk)
  }

  notasDoChunk(chaveDoChunk: string): Iterable<NotaPrivada> {
    return this.chunks.get(chaveDoChunk)?.values() ?? []
  }

  definirChunk(chaveDoChunk: string, notas: NotaPrivada[]) {
    this.chunks.set(chaveDoChunk, new Map(notas.map((n) => [chave(n.q, n.r), n])))
    this.mudou()
  }

  /** Aplica sem conferir nada, como o armazém dos hexágonos: a ordem de chegada é a verdade. Chunk não carregado é ignorado. */
  aplicar(mudancas: readonly MudancaNota[]) {
    let mexeu = false
    for (const m of mudancas) {
      const mapa = this.chunks.get(chaveChunk(m))
      if (!mapa) continue
      if (m.depois) mapa.set(chave(m.q, m.r), m.depois)
      else mapa.delete(chave(m.q, m.r))
      mexeu = true
    }
    if (mexeu) this.mudou()
  }

  ouvir(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  private mudou() {
    this.versao++
    for (const o of this.ouvintes) o()
  }
}

/** Tudo o que só o mestre tem no mapa. */
export class CamadaMestre {
  /** Hexágonos ocultos. Podem estar sobre uma posição que os jogadores veem com outro terreno, ou vazia. */
  readonly ocultos = new ArmazemMapa()
  readonly notas = new ArmazemNotas()
  /** Ver o mapa como os jogadores veem: a camada some da tela, mas continua editável pelas ferramentas. */
  verComoJogador = false

  temChunk(chaveDoChunk: string): boolean {
    return this.ocultos.temChunk(chaveDoChunk) && this.notas.temChunk(chaveDoChunk)
  }
}
