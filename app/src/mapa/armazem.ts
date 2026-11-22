// Armazém em memória dos hexágonos carregados, agrupados por chunk.
// É o que o desenho lê. Não sabe de rede nem de disco: quem manda nele é o controlador.

import { chave, chaveChunk } from './hex'
import type { Hexagono, Leitor, Mudanca } from './tipos'

export type OuvinteArmazem = (chunksAlterados: ReadonlySet<string>) => void

export class ArmazemMapa implements Leitor {
  private chunks = new Map<string, Map<string, Hexagono>>()
  private ouvintes = new Set<OuvinteArmazem>()
  /** Quantidade de hexágonos carregados. */
  total = 0

  ler(q: number, r: number): Hexagono | null {
    return this.chunks.get(chaveChunk({ q, r }))?.get(chave(q, r)) ?? null
  }

  temChunk(chaveDoChunk: string): boolean {
    return this.chunks.has(chaveDoChunk)
  }

  hexagonosDoChunk(chaveDoChunk: string): Iterable<Hexagono> {
    return this.chunks.get(chaveDoChunk)?.values() ?? []
  }

  /** Registra o conteúdo de um chunk vindo do repositório. */
  definirChunk(chaveDoChunk: string, hexagonos: Hexagono[]) {
    const antigo = this.chunks.get(chaveDoChunk)
    if (antigo) this.total -= antigo.size
    const mapa = new Map<string, Hexagono>()
    for (const h of hexagonos) mapa.set(chave(h.q, h.r), h)
    this.chunks.set(chaveDoChunk, mapa)
    this.total += mapa.size
    this.avisar(new Set([chaveDoChunk]))
  }

  /**
   * Aplica mudanças sem conferir nada: a ordem de chegada é a verdade.
   * Mudanças em chunk não carregado são ignoradas, porque o conteúdo virá do repositório ao carregar.
   * Retorna os chunks que mudaram.
   */
  aplicarMudancas(mudancas: readonly Mudanca[]): Set<string> {
    const alterados = new Set<string>()
    for (const m of mudancas) {
      const ck = chaveChunk(m)
      const mapa = this.chunks.get(ck)
      if (!mapa) continue
      const k = chave(m.q, m.r)
      if (m.depois) {
        if (!mapa.has(k)) this.total++
        mapa.set(k, m.depois)
      } else if (mapa.delete(k)) {
        this.total--
      }
      alterados.add(ck)
    }
    if (alterados.size) this.avisar(alterados)
    return alterados
  }

  ouvir(ouvinte: OuvinteArmazem): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  private avisar(chunks: ReadonlySet<string>) {
    for (const o of this.ouvintes) o(chunks)
  }
}
