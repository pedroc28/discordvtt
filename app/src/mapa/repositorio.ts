// De onde o mapa vem e para onde vai.
//
// O resto do código só conhece esta interface. Hoje há duas implementações:
//   RepositorioMemoria  testes e mapa descartável
//   RepositorioLocal    IndexedDB do navegador, com aviso entre abas (ver repositorio-local.ts)
// Na etapa do servidor entra uma terceira, que fala com o PocketBase, e nada acima muda.

import type { Hexagono, Lote, Mudanca } from './tipos'
import { chave, chaveChunk } from './hex'

export type OuvinteLote = (lote: Lote) => void

export interface RepositorioMapa {
  /** Hexágonos de um chunk. Chunk que ninguém construiu devolve lista vazia. */
  carregarChunk(chaveDoChunk: string): Promise<Hexagono[]>
  /** Grava um lote. Deve avisar os outros clientes (e pode avisar o próprio, que ignora o eco). */
  aplicar(lote: Lote): Promise<void>
  /** Recebe lotes feitos por outros clientes. Retorna a função que cancela. */
  assinar(ouvinte: OuvinteLote): () => void
}

/** Aplica as mudanças de um lote a um mapa de chunks. Compartilhado pelas implementações. */
export function aplicarNosChunks(chunks: Map<string, Map<string, Hexagono>>, mudancas: readonly Mudanca[]) {
  for (const m of mudancas) {
    const ck = chaveChunk(m)
    let mapa = chunks.get(ck)
    if (!mapa) chunks.set(ck, (mapa = new Map()))
    if (m.depois) mapa.set(chave(m.q, m.r), m.depois)
    else mapa.delete(chave(m.q, m.r))
  }
}

export class RepositorioMemoria implements RepositorioMapa {
  private chunks = new Map<string, Map<string, Hexagono>>()
  private ouvintes = new Set<OuvinteLote>()
  private atraso: number

  /** Atraso artificial em ms, para simular rede nos testes. */
  constructor(atraso = 0) {
    this.atraso = atraso
  }

  private async esperar() {
    if (this.atraso > 0) await new Promise((r) => setTimeout(r, this.atraso))
  }

  async carregarChunk(chaveDoChunk: string): Promise<Hexagono[]> {
    await this.esperar()
    return [...(this.chunks.get(chaveDoChunk)?.values() ?? [])].map((h) => ({ ...h }))
  }

  async aplicar(lote: Lote): Promise<void> {
    await this.esperar()
    aplicarNosChunks(this.chunks, lote.mudancas)
    for (const o of [...this.ouvintes]) o(lote)
  }

  assinar(ouvinte: OuvinteLote): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }
}
