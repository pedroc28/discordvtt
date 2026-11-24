// Contrato de armazenamento do quadro de cortiça (ver docs/contratos.md, "Quadro e servidor").
// A implementação é a do servidor (app/src/servidor/repositorio-quadro.ts): o quadro é da campanha e
// não tem versão só neste aparelho.
//
// Todos os métodos que falham lançam um Error cuja mensagem diz a causa e o que fazer, começando com
// letra minúscula: a tela mostra "Não consegui enviar a imagem: ...".

import type { CorNota, EventoQuadro, ImagemQuadro, ItemQuadro, NovoItem, Posicao } from './tipos'

export interface InfoImagem {
  /** Nome que a pessoa deu, pode ser vazio. */
  nome: string
  /** Nome do arquivo enviado, só para o servidor guardar a extensão. */
  nomeArquivo: string
  largura: number
  altura: number
}

export interface RepositorioQuadro {
  /** Quem usa é mestre da campanha: tira qualquer item e apaga ou renomeia qualquer imagem. */
  readonly ehMestre: boolean
  /** A biblioteca e os itens do quadro. */
  carregar(): Promise<{ imagens: ImagemQuadro[]; itens: ItemQuadro[] }>
  /** Avisa o que muda, inclusive o que a própria pessoa fez. Devolve a função que para de ouvir. */
  assinar(ouvinte: (evento: EventoQuadro) => void): () => void

  enviarImagem(arquivo: Blob, info: InfoImagem): Promise<ImagemQuadro>
  renomearImagem(id: string, nome: string): Promise<ImagemQuadro>
  /** Apagar a imagem tira do quadro os itens que a usam. */
  apagarImagem(id: string): Promise<void>
  /**
   * Endereço para mostrar a imagem num <img>, válido até o repositório fechar. A miniatura tem 320 px
   * de largura. Cada imagem é baixada uma vez só: as imagens são protegidas, e o link direto não abre.
   */
  urlDaImagem(imagem: ImagemQuadro, tamanho: 'miniatura' | 'inteira'): Promise<string>

  criarItem(novo: NovoItem): Promise<ItemQuadro>
  /** Mover, mudar de tamanho ou de camada. Qualquer pessoa da campanha pode. */
  moverItem(id: string, posicao: Partial<Posicao>): Promise<ItemQuadro>
  /** Só quem escreveu a nota consegue. */
  editarNota(id: string, mudanca: { texto?: string; cor?: CorNota }): Promise<ItemQuadro>
  /** Quem prendeu ou o mestre. */
  tirarItem(id: string): Promise<void>

  /** Para de ouvir o servidor e libera as imagens baixadas. Depois disso, tudo falha. */
  fechar(): Promise<void>
}
