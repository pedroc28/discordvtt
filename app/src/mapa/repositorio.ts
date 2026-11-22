// De onde o mapa vem e para onde vai.
//
// O resto do código só conhece esta interface. Hoje há duas implementações:
//   RepositorioMemoria  testes e mapa descartável
//   RepositorioLocal    IndexedDB do navegador, com aviso entre abas (ver repositorio-local.ts)
// Na etapa do servidor entra uma terceira, que fala com o PocketBase, e nada acima muda.

import type { Hexagono, Lote, Mudanca, MudancaRegiao, Regiao, TokenGrupo } from './tipos'
import { chave, chaveChunk } from './hex'

export type OuvinteLote = (lote: Lote) => void
export type OuvinteToken = (token: TokenGrupo | null) => void

export interface RepositorioMapa {
  /** Hexágonos de um chunk. Chunk que ninguém construiu devolve lista vazia. */
  carregarChunk(chaveDoChunk: string): Promise<Hexagono[]>
  /** Todas as regiões do mapa (são poucas e globais, então vêm de uma vez). */
  carregarRegioes(): Promise<Regiao[]>
  /** Grava um lote. Deve avisar os outros clientes (e pode avisar o próprio, que ignora o eco). */
  aplicar(lote: Lote): Promise<void>
  /** Recebe lotes feitos por outros clientes. Retorna a função que cancela. */
  assinar(ouvinte: OuvinteLote): () => void
  // O token do grupo é opcional: sem estes três métodos ele vive só na memória deste cliente.
  /** Posição atual do token do grupo, ou null se não há. */
  carregarToken?(): Promise<TokenGrupo | null>
  /** Grava a posição do token (null tira o token). Vale o mais recente. Avisa os outros clientes. */
  gravarToken?(token: TokenGrupo | null): Promise<void>
  /** Recebe o token gravado por outros clientes. Retorna a função que cancela. */
  assinarToken?(ouvinte: OuvinteToken): () => void
}

/** Aplica as mudanças de hexágonos de um lote a um mapa de chunks. Compartilhado pelas implementações. */
export function aplicarNosChunks(chunks: Map<string, Map<string, Hexagono>>, mudancas: readonly Mudanca[]) {
  for (const m of mudancas) {
    const ck = chaveChunk(m)
    let mapa = chunks.get(ck)
    if (!mapa) chunks.set(ck, (mapa = new Map()))
    if (m.depois) mapa.set(chave(m.q, m.r), m.depois)
    else mapa.delete(chave(m.q, m.r))
  }
}

/** Aplica as mudanças de regiões de um lote a um mapa de regiões. */
export function aplicarNasRegioes(regioes: Map<string, Regiao>, mudancas: readonly MudancaRegiao[]) {
  for (const m of mudancas) {
    if (m.depois) regioes.set(m.id, m.depois)
    else regioes.delete(m.id)
  }
}

export class RepositorioMemoria implements RepositorioMapa {
  private chunks = new Map<string, Map<string, Hexagono>>()
  private regioes = new Map<string, Regiao>()
  private ouvintes = new Set<OuvinteLote>()
  private ouvintesToken = new Set<OuvinteToken>()
  private token: TokenGrupo | null = null
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
    return [...(this.chunks.get(chaveDoChunk)?.values() ?? [])].map((h) => structuredClone(h))
  }

  async carregarRegioes(): Promise<Regiao[]> {
    await this.esperar()
    return [...this.regioes.values()].map((r) => ({ ...r }))
  }

  async aplicar(lote: Lote): Promise<void> {
    await this.esperar()
    aplicarNosChunks(this.chunks, lote.mudancas)
    aplicarNasRegioes(this.regioes, lote.regioes)
    for (const o of [...this.ouvintes]) o(lote)
  }

  assinar(ouvinte: OuvinteLote): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  async carregarToken(): Promise<TokenGrupo | null> {
    await this.esperar()
    return this.token ? { ...this.token } : null
  }

  async gravarToken(token: TokenGrupo | null): Promise<void> {
    await this.esperar()
    this.token = token ? { ...token } : null
    for (const o of [...this.ouvintesToken]) o(token ? { ...token } : null)
  }

  assinarToken(ouvinte: OuvinteToken): () => void {
    this.ouvintesToken.add(ouvinte)
    return () => this.ouvintesToken.delete(ouvinte)
  }
}
