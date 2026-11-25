// Tipos do mapa de batalha: uma imagem de fundo, uma grade por cima e tokens que se movem sobre ela.
// Tudo em coordenadas da imagem (pixels). Sem fundo, o plano é infinito e a grade vale do mesmo jeito.

export type TipoGrade = 'quadrada' | 'hex-pontudo' | 'hex-chato' | 'nenhuma'

/** Como a grade aparece sobre o fundo. */
export type CorGrade = 'clara' | 'escura' | 'acento'

/**
 * A grade. `tamanho` é o lado da célula quadrada, ou a distância entre dois lados paralelos do hexágono,
 * em pixels da imagem. Sem grade, ele continua valendo como a "célula de referência" de tokens e régua.
 * `x` e `y` são o ponto de origem: o canto da célula (0, 0) na quadrada e o centro dela nos hexágonos.
 */
export interface Grade {
  tipo: TipoGrade
  tamanho: number
  x: number
  y: number
  visivel: boolean
  cor: CorGrade
  opacidade: number
}

/** Como a régua conta uma diagonal na grade quadrada. Nos hexágonos não há diagonal. */
export type RegraDiagonal = 'simples' | 'alternada' | 'euclidiana'

export interface Medida {
  /** Quanto vale uma célula no mundo do jogo, por exemplo 1,5 metro. */
  valorPorCelula: number
  unidade: string
  diagonal: RegraDiagonal
}

export interface TokenBatalha {
  id: string
  nome: string
  /** Centro do token, em pixels da imagem. */
  x: number
  y: number
  /** Em células: 1 ocupa uma célula, 2 ocupa duas de lado, 0,5 é pequeno. */
  tamanho: number
  /** Cor de fundo, em #rrggbb. */
  cor: string
}

export interface FundoBatalha {
  largura: number
  altura: number
}

export interface Cena {
  versao: 1
  id: string
  nome: string
  /** Null quando não há imagem. A imagem em si fica à parte (ver RepositorioBatalha). */
  fundo: FundoBatalha | null
  grade: Grade
  medida: Medida
  /** Tokens se encaixam nas células ao soltar. */
  encaixar: boolean
  tokens: TokenBatalha[]
}

export interface Ponto {
  x: number
  y: number
}

/** Célula da grade: coluna e linha na quadrada, coordenadas axiais nos hexágonos. */
export interface Celula {
  q: number
  r: number
}

/** De onde a cena e a imagem vêm e para onde vão. Hoje só há o navegador, o servidor entra como outra implementação. */
export interface RepositorioBatalha {
  carregar(id: string): Promise<{ cena: Cena | null; imagem: Blob | null }>
  salvarCena(cena: Cena): Promise<void>
  salvarImagem(id: string, imagem: Blob | null): Promise<void>
}
