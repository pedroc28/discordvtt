// Formato de dados do mapa hexagonal.
//
// O mapa é esparso: só existem os hexágonos que alguém construiu. Quem edita produz
// lotes de mudanças (antes e depois), e o repositório (local ou servidor) só transporta lotes.
// É isso que permite o mesmo código servir para o mapa solo, o multijogador e o desfazer.

/** Um ponto de interesse sobre o hexágono (cidade, masmorra...). Mora dentro do hexágono. */
export interface Marcador {
  id: string
  /** Id do ícone no tileset (ex.: "cidade"). */
  tipo: string
  nome: string
}

export interface Hexagono {
  q: number
  r: number
  /** Id do terreno no tileset (ex.: "floresta"). */
  terreno: string
  /** Região a que pertence, ou null. Id que não existe mais conta como "sem região". */
  regiaoId: string | null
  nome: string
  nota: string
  marcadores: Marcador[]
  /**
   * Arestas deste hexágono por onde passa um rio: 0 leste, 1 sudeste, 2 sudoeste. Cada aresta pertence ao
   * hexágono "dono" (ver `arestaCanonica`), então as outras três direções ficam guardadas no vizinho.
   */
  rios: number[]
  /** Igual a `rios`, para estradas. A estrada liga o centro do hexágono ao do vizinho dessa direção. */
  estradas: number[]
  /** Número da revisão, sobe a cada alteração. Ordena versões (o servidor vai usar); o desfazer compara conteúdo. */
  rev: number
}

/**
 * Onde está o grupo no mapa. É estado pequeno e muito mutável: não entra em lotes nem no desfazer.
 * Vale o mais recente (`ts`).
 */
export interface TokenGrupo {
  q: number
  r: number
  ts: number
  autor: string
}

/** Área nomeada do mapa. Regiões são globais: não pertencem a um chunk. */
export interface Regiao {
  id: string
  nome: string
  /** Cor #rrggbb. */
  cor: string
  descricao: string
  /** Região maior que contém esta (reino › província), ou null. Id que não existe conta como null. */
  paiId: string | null
  rev: number
}

export interface MapaMeta {
  formato: 'mapa-hex'
  versao: 1
  id: string
  nome: string
  /** Id do tileset em uso. */
  tileset: string
  /** Texto livre, ex.: "1 hexágono = 10 km". */
  escala: string
}

/** Uma alteração em um hexágono. `antes` null = não existia. `depois` null = foi apagado. */
export interface Mudanca {
  q: number
  r: number
  antes: Hexagono | null
  depois: Hexagono | null
}

/** Uma alteração em uma região. Mesma convenção de `Mudanca`. */
export interface MudancaRegiao {
  id: string
  antes: Regiao | null
  depois: Regiao | null
}

/** Um passo de edição, como uma pincelada inteira. É a unidade de rede e de desfazer. */
export interface Lote {
  id: string
  autor: string
  ts: number
  mudancas: Mudanca[]
  regioes: MudancaRegiao[]
}

/** Campos de um hexágono que a interface edita. Ficam de fora as coordenadas e a revisão. */
export type PatchHexagono = Partial<Pick<Hexagono, 'terreno' | 'nome' | 'nota' | 'regiaoId' | 'marcadores'>>

export type PatchRegiao = Partial<Pick<Regiao, 'nome' | 'cor' | 'descricao' | 'paiId'>>

/** Leitura do mapa. As operações puras só precisam disto, não do armazém inteiro. */
export interface Leitor {
  ler(q: number, r: number): Hexagono | null
  lerRegiao(id: string): Regiao | null
}
