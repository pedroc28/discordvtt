// Formato de dados das fichas.
// O modelo (layout + campos) fica separado dos valores do personagem.
// Um mesmo modelo serve para vários personagens.

export type TipoCampo =
  | 'texto'
  | 'textoLongo'
  | 'numero'
  | 'recurso'
  | 'checkbox'
  | 'marcadores'
  | 'lista'
  | 'tabela'
  | 'imagem'
  | 'titulo'
  | 'moldura'
  | 'relogio'

export type PosicaoRotulo = 'acima' | 'abaixo' | 'esquerda' | 'direita' | 'oculto'
export type Borda = 'caixa' | 'linha' | 'nenhuma'
export type Alinhamento = 'esquerda' | 'centro' | 'direita'
export type Fonte = 'serifada' | 'sem-serifa' | 'condensada'
export type FormaMarcador = 'quadrado' | 'circulo' | 'losango'
export type TipoColuna = 'texto' | 'numero' | 'checkbox'

export interface Estilo {
  /** Tamanho da fonte do conteúdo, em px (no zoom 100%). */
  tamanhoFonte: number
  /** Tamanho da fonte do rótulo, em px. */
  tamanhoRotulo: number
  alinhamento: Alinhamento
  rotulo: PosicaoRotulo
  borda: Borda
  negrito: boolean
}

export interface ColunaTabela {
  /** Chave estável da coluna. Não muda quando o rótulo é renomeado. */
  id: string
  rotulo: string
  tipo: TipoColuna
  /** Proporção da largura (1, 2, 3...). */
  largura: number
}

/** Configurações específicas de cada tipo. Cada tipo usa só as que fazem sentido para ele. */
export interface ConfigCampo {
  // numero e recurso
  min?: number | null
  max?: number | null
  passo?: number
  // recurso
  /** 'numeros' mostra 19/20. 'barra' é a barra de vida dividida em partes. */
  estiloRecurso?: 'numeros' | 'barra'
  barra?: boolean
  botoes?: boolean
  /** Barra de vida: mostra a linha entre as partes. */
  divisoes?: boolean
  /** Barra de vida: mostra atual/máximo por cima da barra. */
  mostrarNumeros?: boolean
  /** Máximo usado enquanto o personagem não preencher o dele. */
  maxPadrao?: number | null
  // recurso (barra) e relogio: null usa a cor de destaque do modelo
  cor?: string | null
  // relogio
  formatoRelogio?: 'apocalypse' | 'iguais'
  mostrarHoras?: boolean
  // checkbox, marcadores e relogio (partes iguais)
  forma?: FormaMarcador
  quantidade?: number
  sequencial?: boolean
  // lista
  opcoes?: string[]
  // tabela
  colunas?: ColunaTabela[]
  // imagem
  ajuste?: 'cobrir' | 'conter'
  // titulo
  texto?: string
  // texto e textoLongo
  dica?: string
  pautado?: boolean
  // moldura
  espessura?: number
  raio?: number
  preenchimento?: string | null
}

export interface Elemento {
  id: string
  tipo: TipoCampo
  /** Chave do dado (ex.: "forca"). Vazia em elementos decorativos. */
  chave: string
  rotulo: string
  x: number
  y: number
  w: number
  h: number
  estilo: Estilo
  config: ConfigCampo
}

export interface Pagina {
  id: string
  nome: string
  elementos: Elemento[]
}

export interface Modelo {
  formato: 'ficha-modelo'
  versao: 1
  id: string
  nome: string
  largura: number
  altura: number
  grade: number
  fonte: Fonte
  corFundo: string
  corTinta: string
  corDestaque: string
  paginas: Pagina[]
}

export interface Recurso {
  atual: number | null
  max: number | null
}

export type Celula = string | number | boolean | null

export interface LinhaTabela {
  _id: string
  [coluna: string]: Celula
}

export type Valor = string | number | boolean | null | boolean[] | Recurso | LinhaTabela[]
export type Valores = Record<string, Valor>

export interface Personagem {
  formato: 'ficha-personagem'
  versao: 1
  modeloId: string
  modeloNome: string
  valores: Valores
}

export type Modo = 'editar' | 'usar'
