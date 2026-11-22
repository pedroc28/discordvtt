// Repositório no navegador: IndexedDB guarda os chunks, e um BroadcastChannel avisa
// as outras abas do mesmo mapa, que se comportam como outros jogadores. Isso já exercita
// o caminho de sincronização (lote recebido de outro cliente) antes de existir servidor.

import { normalizarHexagono } from './armazenamento'
import { aplicarNosChunks, type OuvinteLote, type RepositorioMapa } from './repositorio'
import { chaveChunk } from './hex'
import type { Hexagono, Lote } from './tipos'

const NOME_BANCO = 'discordvtt-mapa'
const LOJA = 'chunks'

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_BANCO, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'))
  })
}

const pedido = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

interface RegistroChunk {
  id: string
  hexagonos: Hexagono[]
}

export class RepositorioLocal implements RepositorioMapa {
  private banco: Promise<IDBDatabase> | null = null
  private ouvintes = new Set<OuvinteLote>()
  private canal: BroadcastChannel | null = null
  private mapaId: string

  constructor(mapaId: string) {
    this.mapaId = mapaId
    if (typeof BroadcastChannel !== 'undefined') {
      this.canal = new BroadcastChannel(`discordvtt-mapa:${mapaId}`)
      this.canal.onmessage = (e: MessageEvent<Lote>) => {
        for (const o of [...this.ouvintes]) o(e.data)
      }
    }
  }

  private db() {
    return (this.banco ??= abrirBanco())
  }

  private id(chaveDoChunk: string) {
    return `${this.mapaId}|${chaveDoChunk}`
  }

  async carregarChunk(chaveDoChunk: string): Promise<Hexagono[]> {
    const db = await this.db()
    const reg = await pedido<RegistroChunk | undefined>(
      db.transaction(LOJA, 'readonly').objectStore(LOJA).get(this.id(chaveDoChunk)),
    )
    return (reg?.hexagonos ?? []).map(normalizarHexagono).filter((h): h is Hexagono => !!h)
  }

  async aplicar(lote: Lote): Promise<void> {
    const db = await this.db()
    const porChunk = new Map<string, Lote['mudancas']>()
    for (const m of lote.mudancas) {
      const ck = chaveChunk(m)
      porChunk.set(ck, [...(porChunk.get(ck) ?? []), m])
    }
    const tx = db.transaction(LOJA, 'readwrite')
    const loja = tx.objectStore(LOJA)
    const concluida = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada'))
    })
    for (const [ck, mudancas] of porChunk) {
      const atual = await pedido<RegistroChunk | undefined>(loja.get(this.id(ck)))
      const mapa = new Map<string, Map<string, Hexagono>>()
      const dentro = new Map<string, Hexagono>()
      for (const h of atual?.hexagonos ?? []) dentro.set(`${h.q},${h.r}`, h)
      mapa.set(ck, dentro)
      aplicarNosChunks(mapa, mudancas)
      loja.put({ id: this.id(ck), hexagonos: [...dentro.values()] } satisfies RegistroChunk)
    }
    await concluida
    this.canal?.postMessage(lote)
  }

  assinar(ouvinte: OuvinteLote): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  fechar() {
    this.canal?.close()
  }
}
