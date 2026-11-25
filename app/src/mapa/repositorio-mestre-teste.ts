// Só para desenvolvimento: um mapa em memória que se comporta como o de um mestre, com camada oculta e
// notas privadas trava do mapa e viagem da campanha, para ver e testar a interface sem o servidor. Entra com `?mestre=teste` no endereço e
// só no `npm run dev` (no site publicado, o código nem é incluído). Nada é guardado: ao recarregar, some.

import { aplicarNosChunks, RepositorioMemoria, type RepositorioComCamadaMestre, type RepositorioComPermissao, type RepositorioComViagem } from './repositorio'
import type { Hexagono, Lote, NotaPrivada, PermissaoMapa } from './tipos'
import { chave, chaveChunk } from './hex'

export class RepositorioMestreDeTeste extends RepositorioMemoria implements RepositorioComCamadaMestre, RepositorioComPermissao, RepositorioComViagem {
  readonly ehMestre = true
  private ocultos = new Map<string, Map<string, Hexagono>>()
  private notas = new Map<string, NotaPrivada>()
  private permissao: PermissaoMapa = 'todos'
  private ouvintesPermissao = new Set<(p: PermissaoMapa) => void>()

  private viagem: unknown = null
  private ouvintesViagem = new Set<(c: unknown) => void>()

  async carregarViagem(): Promise<unknown> {
    return this.viagem
  }

  async gravarViagem(config: unknown): Promise<void> {
    this.viagem = config
    for (const o of this.ouvintesViagem) o(config)
  }

  assinarViagem(ouvinte: (c: unknown) => void): () => void {
    this.ouvintesViagem.add(ouvinte)
    return () => this.ouvintesViagem.delete(ouvinte)
  }

  async carregarPermissao(): Promise<PermissaoMapa> {
    return this.permissao
  }

  async gravarPermissao(p: PermissaoMapa): Promise<void> {
    this.permissao = p
    for (const o of this.ouvintesPermissao) o(p)
  }

  assinarPermissao(ouvinte: (p: PermissaoMapa) => void): () => void {
    this.ouvintesPermissao.add(ouvinte)
    return () => this.ouvintesPermissao.delete(ouvinte)
  }

  override async aplicar(lote: Lote): Promise<void> {
    if (lote.privado) {
      aplicarNosChunks(this.ocultos, lote.privado.ocultos)
      for (const n of lote.privado.notas) {
        if (n.depois) this.notas.set(chave(n.q, n.r), n.depois)
        else this.notas.delete(chave(n.q, n.r))
      }
    }
    await super.aplicar({ ...lote, privado: undefined })
  }

  async carregarChunkOculto(chaveDoChunk: string): Promise<Hexagono[]> {
    return structuredClone([...(this.ocultos.get(chaveDoChunk)?.values() ?? [])])
  }

  async carregarNotasPrivadas(chaveDoChunk: string): Promise<NotaPrivada[]> {
    return structuredClone([...this.notas.values()].filter((n) => chaveChunk(n) === chaveDoChunk))
  }
}
