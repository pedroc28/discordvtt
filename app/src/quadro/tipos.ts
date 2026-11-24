// Formato do quadro de cortiça. Tudo o que vem do servidor passa por validação antes de virar um
// destes tipos. Os números aqui são contrato com o servidor (pocketbase/pb_migrations/1795321006_quadro.js).

/** Tamanho do quadro, em unidades do app. A posição de um item é o centro dele. */
export const LARGURA_QUADRO = 3200
export const ALTURA_QUADRO = 2000

export const CORES_NOTA = ['amarelo', 'rosa', 'azul', 'verde', 'branco'] as const
export type CorNota = (typeof CORES_NOTA)[number]

export const LIMITES_QUADRO = {
  textoNota: 500,
  nomeImagem: 80,
  larguraMinima: 60,
  larguraMaxima: 1600,
  /** Graus para cada lado. */
  rotacaoMaxima: 10,
  /** Lado maior que o servidor aceita, em pixels. O app reduz para 1600 antes de enviar. */
  ladoImagem: 4096,
  /** Tamanho máximo de um arquivo de imagem. */
  bytesImagem: 2 * 1024 * 1024,
  /** Espaço de imagens de cada campanha. */
  bytesCampanha: 50 * 1024 * 1024,
} as const

/** Uma imagem da biblioteca da campanha. */
export interface ImagemQuadro {
  id: string
  /** Conta de quem enviou. Vazio se a conta foi apagada. */
  autorId: string
  /** Nome que as pessoas deram. Pode ser vazio. */
  nome: string
  /** Nome do arquivo no servidor, para baixar. */
  arquivo: string
  /** Dimensões em pixels. */
  largura: number
  altura: number
  bytes: number
  /** Quando foi enviada, em milissegundos desde 1970. */
  enviada: number
}

/** Onde e como um item está no quadro: o que muda ao arrastar. */
export interface Posicao {
  /** Centro do item, de 0 a LARGURA_QUADRO e de 0 a ALTURA_QUADRO. */
  x: number
  y: number
  largura: number
  rotacao: number
  /** Ordem de empilhamento: o maior fica por cima. */
  z: number
}

interface BaseItem extends Posicao {
  id: string
  /** Conta de quem prendeu. Vazio se a conta foi apagada. */
  autorId: string
}

export interface ItemImagem extends BaseItem {
  tipo: 'imagem'
  imagemId: string
}

export interface ItemNota extends BaseItem {
  tipo: 'nota'
  texto: string
  cor: CorNota
}

export type ItemQuadro = ItemImagem | ItemNota

/** Item novo, antes de o servidor dar id e autor. */
export type NovoItem = (Omit<ItemImagem, 'id' | 'autorId'> | Omit<ItemNota, 'id' | 'autorId'>)

/** O que chega do servidor pelo tempo real. */
export type EventoQuadro =
  | { tipo: 'imagem'; imagem: ImagemQuadro }
  | { tipo: 'imagemApagada'; id: string }
  | { tipo: 'item'; item: ItemQuadro }
  | { tipo: 'itemApagado'; id: string }
  /** A conexão caiu e voltou: este é o quadro inteiro de novo. */
  | { tipo: 'tudo'; imagens: ImagemQuadro[]; itens: ItemQuadro[] }
