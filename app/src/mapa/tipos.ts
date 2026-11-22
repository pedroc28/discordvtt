// Formato de dados do mapa hexagonal.
//
// O mapa é esparso: só existem os hexágonos que alguém construiu. Quem edita produz
// lotes de mudanças (antes e depois), e o repositório (local ou servidor) só transporta lotes.
// É isso que permite o mesmo código servir para o mapa solo, o multijogador e o desfazer.

export interface Hexagono {
  q: number
  r: number
  /** Id do terreno no tileset (ex.: "floresta"). */
  terreno: string
  /** Região a que pertence, ou null. (Fase 2) */
  regiaoId: string | null
  nome: string
  nota: string
  /** Número da revisão, sobe a cada alteração. Serve para detectar conflito no desfazer. */
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

/** Um passo de edição, como uma pincelada inteira. É a unidade de rede e de desfazer. */
export interface Lote {
  id: string
  autor: string
  ts: number
  mudancas: Mudanca[]
}

/** Leitura de um hexágono. As operações puras só precisam disto, não do armazém inteiro. */
export interface Leitor {
  ler(q: number, r: number): Hexagono | null
}
