// Onde a cena e a imagem de fundo ficam guardadas. Hoje: o navegador (IndexedDB). O servidor entra como outra implementação.
// A imagem fica à parte da cena porque é grande: a cena é um JSON pequeno que se grava a cada movimento.

import { normalizarCena } from './operacoes'
import type { Cena, RepositorioBatalha } from './tipos'

export class RepositorioBatalhaMemoria implements RepositorioBatalha {
  private cenas = new Map<string, Cena>()
  private imagens = new Map<string, Blob>()

  async carregar(id: string) {
    const cena = this.cenas.get(id)
    return { cena: cena ? structuredClone(cena) : null, imagem: this.imagens.get(id) ?? null }
  }

  async salvarCena(cena: Cena) {
    this.cenas.set(cena.id, structuredClone(cena))
  }

  async salvarImagem(id: string, imagem: Blob | null) {
    if (imagem) this.imagens.set(id, imagem)
    else this.imagens.delete(id)
  }
}

const NOME_BANCO = 'discordvtt-batalha'

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(NOME_BANCO, 1)
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore('cenas')
      pedido.result.createObjectStore('imagens')
    }
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rejeitar(pedido.error ?? new Error('Não consegui abrir o armazenamento do navegador.'))
  })
}

function pedir<T>(banco: IDBDatabase, loja: string, modo: IDBTransactionMode, operacao: (l: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    const t = banco.transaction(loja, modo)
    const req = operacao(t.objectStore(loja))
    t.oncomplete = () => resolver(req.result)
    t.onerror = () => rejeitar(t.error ?? new Error('Falha ao gravar no navegador.'))
    t.onabort = () => rejeitar(t.error ?? new Error('Falha ao gravar no navegador.'))
  })
}

/** Guarda tudo no IndexedDB deste navegador. */
export class RepositorioBatalhaLocal implements RepositorioBatalha {
  private banco: Promise<IDBDatabase> | null = null

  private abrir() {
    return (this.banco ??= abrirBanco())
  }

  async carregar(id: string) {
    const banco = await this.abrir()
    const bruto = await pedir<unknown>(banco, 'cenas', 'readonly', (l) => l.get(id))
    const imagem = await pedir<unknown>(banco, 'imagens', 'readonly', (l) => l.get(id))
    return { cena: normalizarCena(bruto), imagem: imagem instanceof Blob ? imagem : null }
  }

  async salvarCena(cena: Cena) {
    const banco = await this.abrir()
    await pedir(banco, 'cenas', 'readwrite', (l) => l.put(cena, cena.id))
  }

  async salvarImagem(id: string, imagem: Blob | null) {
    const banco = await this.abrir()
    await pedir(banco, 'imagens', 'readwrite', (l) => (imagem ? l.put(imagem, id) : l.delete(id)) as IDBRequest<unknown>)
  }
}
