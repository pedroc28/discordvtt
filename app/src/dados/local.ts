// Rolagem só neste aparelho, para quem não está numa campanha do servidor. O histórico fica na
// memória e some ao fechar a página: sem campanha, não há com quem compartilhar.

import { sortearComBytes, TAMANHO_HISTORICO } from './operacoes'
import type { OuvinteRolagem, RepositorioDados } from './repositorio'
import type { Lados, Rolagem } from './tipos'

/** Bytes do gerador criptográfico do navegador, que dá a mesma chance a cada valor. */
function bytesDoNavegador(): () => number {
  const buffer = new Uint8Array(16)
  let posicao = buffer.length
  return () => {
    if (posicao >= buffer.length) {
      crypto.getRandomValues(buffer)
      posicao = 0
    }
    return buffer[posicao++] ?? 0
  }
}

export const FECHADO_LOCAL = 'a rolagem deste aparelho foi fechada. Abra a aba de novo.'

export class RepositorioDadosLocal implements RepositorioDados {
  readonly compartilhado = false
  readonly podeRolarEmSegredo = false
  private historico: Rolagem[] = []
  private ouvintes = new Set<OuvinteRolagem>()
  private fechado = false
  private contador = 0
  private proximoByte: () => number
  private agora: () => number

  constructor(opcoes: { proximoByte?: () => number; agora?: () => number } = {}) {
    this.proximoByte = opcoes.proximoByte ?? bytesDoNavegador()
    this.agora = opcoes.agora ?? Date.now
  }

  async rolar(lados: Lados): Promise<Rolagem> {
    if (this.fechado) throw new Error(FECHADO_LOCAL)
    const rolagem: Rolagem = {
      id: `local-${this.agora()}-${++this.contador}`,
      autorId: '',
      lados,
      resultado: sortearComBytes(lados, this.proximoByte),
      quando: this.agora(),
      secreta: false,
    }
    this.historico = [rolagem, ...this.historico].slice(0, TAMANHO_HISTORICO)
    for (const ouvinte of [...this.ouvintes]) ouvinte(rolagem)
    return rolagem
  }

  async recentes(quantas: number): Promise<Rolagem[]> {
    return this.historico.slice(0, quantas)
  }

  assinar(ouvinte: OuvinteRolagem): () => void {
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  async fechar(): Promise<void> {
    this.fechado = true
    this.ouvintes.clear()
  }
}
