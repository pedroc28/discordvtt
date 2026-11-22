// Repositório no navegador: IndexedDB guarda os chunks e as regiões, e um BroadcastChannel avisa
// as outras abas do mesmo mapa, que se comportam como outros jogadores. Isso já exercita
// o caminho de sincronização (lote recebido de outro cliente) antes de existir servidor.

import { normalizarHexagono, normalizarRegiao, normalizarToken } from './armazenamento'
import { aplicarNosChunks, aplicarNasRegioes, type OuvinteLote, type OuvinteToken, type RepositorioMapa } from './repositorio'
import { chaveChunk } from './hex'
import type { Hexagono, Lote, Regiao, TokenGrupo } from './tipos'

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

/** As regiões ficam num registro só, na mesma loja. A chave não tem vírgula, então não colide com a de chunks. */
interface RegistroRegioes {
  id: string
  regioes: Regiao[]
}

/** O token do grupo também é um registro só. */
interface RegistroToken {
  id: string
  token: TokenGrupo | null
}

export class RepositorioLocal implements RepositorioMapa {
  private banco: Promise<IDBDatabase> | null = null
  private ouvintes = new Set<OuvinteLote>()
  private canal: BroadcastChannel | null = null
  private canalToken: BroadcastChannel | null = null
  private ouvintesToken = new Set<OuvinteToken>()
  private mapaId: string

  constructor(mapaId: string) {
    this.mapaId = mapaId
    if (typeof BroadcastChannel !== 'undefined') {
      this.canal = new BroadcastChannel(`discordvtt-mapa:${mapaId}`)
      this.canal.onmessage = (e: MessageEvent<Lote>) => {
        for (const o of [...this.ouvintes]) o(e.data)
      }
      // Canal à parte: o do mapa só carrega lotes.
      this.canalToken = new BroadcastChannel(`discordvtt-mapa:${mapaId}:token`)
      this.canalToken.onmessage = (e: MessageEvent<TokenGrupo | null>) => {
        const token = normalizarToken(e.data)
        for (const o of [...this.ouvintesToken]) o(token)
      }
    }
  }

  private db() {
    return (this.banco ??= abrirBanco())
  }

  private id(chaveDoChunk: string) {
    return `${this.mapaId}|${chaveDoChunk}`
  }

  private idRegioes() {
    return `${this.mapaId}|regioes`
  }

  private idToken() {
    return `${this.mapaId}|token`
  }

  async carregarChunk(chaveDoChunk: string): Promise<Hexagono[]> {
    const db = await this.db()
    const reg = await pedido<RegistroChunk | undefined>(
      db.transaction(LOJA, 'readonly').objectStore(LOJA).get(this.id(chaveDoChunk)),
    )
    return (reg?.hexagonos ?? []).map(normalizarHexagono).filter((h): h is Hexagono => !!h)
  }

  async carregarRegioes(): Promise<Regiao[]> {
    const db = await this.db()
    const reg = await pedido<RegistroRegioes | undefined>(
      db.transaction(LOJA, 'readonly').objectStore(LOJA).get(this.idRegioes()),
    )
    return (reg?.regioes ?? []).map(normalizarRegiao).filter((r): r is Regiao => !!r)
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
    if (lote.regioes.length) {
      const atual = await pedido<RegistroRegioes | undefined>(loja.get(this.idRegioes()))
      const mapa = new Map<string, Regiao>((atual?.regioes ?? []).map((r) => [r.id, r]))
      aplicarNasRegioes(mapa, lote.regioes)
      loja.put({ id: this.idRegioes(), regioes: [...mapa.values()] } satisfies RegistroRegioes)
    }
    await concluida
    this.canal?.postMessage(lote)
  }

  assinar(ouvinte: OuvinteLote): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  async carregarToken(): Promise<TokenGrupo | null> {
    const db = await this.db()
    const reg = await pedido<RegistroToken | undefined>(
      db.transaction(LOJA, 'readonly').objectStore(LOJA).get(this.idToken()),
    )
    return normalizarToken(reg?.token)
  }

  async exportarTudo(): Promise<{ hexagonos: Hexagono[]; regioes: Regiao[] }> {
    const db = await this.db()
    // Todos os registros deste mapa: os chunks, as regiões e o token ficam na mesma loja, com o id começando pelo id do mapa.
    const faixa = IDBKeyRange.bound(`${this.mapaId}|`, `${this.mapaId}|\uffff`)
    const registros = await pedido<unknown[]>(db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll(faixa))
    const hexagonos: Hexagono[] = []
    let regioes: Regiao[] = []
    for (const reg of registros) {
      if (typeof reg !== 'object' || reg === null) continue
      const r = reg as Partial<RegistroChunk & RegistroRegioes>
      if (Array.isArray(r.hexagonos)) {
        for (const h of r.hexagonos) {
          const ok = normalizarHexagono(h)
          if (ok) hexagonos.push(ok)
        }
      } else if (Array.isArray(r.regioes)) {
        regioes = r.regioes.map(normalizarRegiao).filter((x): x is Regiao => !!x)
      }
    }
    return { hexagonos, regioes }
  }

  async gravarToken(token: TokenGrupo | null): Promise<void> {
    const db = await this.db()
    const tx = db.transaction(LOJA, 'readwrite')
    const concluida = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada'))
    })
    tx.objectStore(LOJA).put({ id: this.idToken(), token } satisfies RegistroToken)
    await concluida
    this.canalToken?.postMessage(token)
  }

  assinarToken(ouvinte: OuvinteToken): () => void {
    this.ouvintesToken.add(ouvinte)
    return () => this.ouvintesToken.delete(ouvinte)
  }

  fechar() {
    this.canal?.close()
    this.canalToken?.close()
  }
}
