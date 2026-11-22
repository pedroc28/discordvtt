// Armazém em memória dos hexágonos carregados (agrupados por chunk) e das regiões.
// É o que o desenho e a interface leem. Não sabe de rede nem de disco: quem manda nele é o controlador.

import { chave, chaveChunk } from './hex'
import type { Hexagono, Leitor, Mudanca, MudancaRegiao, Regiao } from './tipos'

export type OuvinteArmazem = (chunksAlterados: ReadonlySet<string>) => void

export class ArmazemMapa implements Leitor {
  private chunks = new Map<string, Map<string, Hexagono>>()
  private regioes = new Map<string, Regiao>()
  private ouvintes = new Set<OuvinteArmazem>()
  private ouvintesRegioes = new Set<() => void>()
  /** Quantidade de hexágonos carregados. */
  total = 0
  /** Sobe a cada mudança em hexágonos. Serve para invalidar caches e atualizar a interface. */
  versao = 0
  /** Sobe a cada mudança nas regiões. */
  versaoRegioes = 0
  /** Falso até as regiões chegarem do repositório. */
  regioesProntas = false

  ler(q: number, r: number): Hexagono | null {
    return this.chunks.get(chaveChunk({ q, r }))?.get(chave(q, r)) ?? null
  }

  lerRegiao(id: string): Regiao | null {
    return this.regioes.get(id) ?? null
  }

  listarRegioes(): Regiao[] {
    return [...this.regioes.values()]
  }

  temChunk(chaveDoChunk: string): boolean {
    return this.chunks.has(chaveDoChunk)
  }

  hexagonosDoChunk(chaveDoChunk: string): Iterable<Hexagono> {
    return this.chunks.get(chaveDoChunk)?.values() ?? []
  }

  *todosOsHexagonos(): Iterable<Hexagono> {
    for (const mapa of this.chunks.values()) yield* mapa.values()
  }

  /** Registra o conteúdo de um chunk vindo do repositório. */
  definirChunk(chaveDoChunk: string, hexagonos: Hexagono[]) {
    const antigo = this.chunks.get(chaveDoChunk)
    if (antigo) this.total -= antigo.size
    const mapa = new Map<string, Hexagono>()
    for (const h of hexagonos) mapa.set(chave(h.q, h.r), h)
    this.chunks.set(chaveDoChunk, mapa)
    this.total += mapa.size
    this.versao++
    this.avisar(new Set([chaveDoChunk]))
  }

  /** Registra as regiões vindas do repositório. */
  definirRegioes(lista: Regiao[]) {
    this.regioes = new Map(lista.map((r) => [r.id, r]))
    this.regioesProntas = true
    this.versaoRegioes++
    this.avisarRegioes()
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
    if (alterados.size) {
      this.versao++
      this.avisar(alterados)
    }
    return alterados
  }

  aplicarRegioes(mudancas: readonly MudancaRegiao[]) {
    if (!mudancas.length) return
    for (const m of mudancas) {
      if (m.depois) this.regioes.set(m.id, m.depois)
      else this.regioes.delete(m.id)
    }
    this.versaoRegioes++
    this.avisarRegioes()
  }

  ouvir(ouvinte: OuvinteArmazem): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  ouvirRegioes(ouvinte: () => void): () => void {
    this.ouvintesRegioes.add(ouvinte)
    return () => this.ouvintesRegioes.delete(ouvinte)
  }

  private avisar(chunks: ReadonlySet<string>) {
    for (const o of this.ouvintes) o(chunks)
  }

  private avisarRegioes() {
    for (const o of this.ouvintesRegioes) o()
  }
}
