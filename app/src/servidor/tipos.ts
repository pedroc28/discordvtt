// Formato dos dados do servidor dentro do app. Tudo o que chega do PocketBase passa por
// validacao.ts antes de virar um destes tipos.

import type { Lote, TokenGrupo } from '../mapa/tipos'

export type Papel = 'mestre' | 'jogador'

export interface Usuario {
  id: string
  nome: string
}

export interface Campanha {
  id: string
  nome: string
}

export interface Participacao {
  id: string
  campanhaId: string
  usuarioId: string
  papel: Papel
}

/** Campanha da lista do usuário, com o papel dele nela. */
export interface MinhaCampanha extends Campanha {
  papel: Papel
}

/** Participação pronta para mostrar: com o nome da pessoa. */
export interface ParticipanteVisivel extends Participacao {
  nome: string
  /** É a própria pessoa que está usando o app. */
  euMesmo: boolean
}

export type FaseConexao = 'iniciando' | 'desconectado' | 'entrando' | 'conectado'

export interface EstadoServidor {
  fase: FaseConexao
  /** Endereço do PocketBase em uso, já normalizado. */
  endereco: string
  usuario: Usuario | null
  campanhas: MinhaCampanha[]
  campanhaAtualId: string | null
  /** Participantes da campanha atual. */
  participantes: ParticipanteVisivel[]
  /** Todas as contas que o usuário pode ver, para o mestre escolher quem adicionar. */
  usuarios: Usuario[]
  /** Uma ação está em andamento: a tela desabilita os botões. */
  ocupado: boolean
  /** Última mensagem de erro, já pronta para mostrar. */
  erro: string | null
  /** Aviso de algo que deu certo, para quem usa leitor de tela saber que a ação terminou. */
  aviso: string | null
  /** A conexão caiu depois do login. Os dados mostrados podem estar desatualizados. */
  semResposta: boolean
  /** Há uma sessão guardada neste navegador que não deu para retomar (por exemplo, servidor desligado). */
  sessaoSalva: boolean
}

// ---------- mapa ----------

/** Quem edita o mapa: todos que participam da campanha, ou só o mestre. */
export type PermissaoMapa = 'todos' | 'mestre'

/** O mapa da campanha no servidor. `ultimaOrdem` é o número do último lote gravado nele. */
export interface MapaDoServidor {
  id: string
  ultimaOrdem: number
  permissao: PermissaoMapa
}

/** O contador da camada do mestre de um mapa: só o mestre lê. */
export interface CamadaMestreDoServidor {
  id: string
  ultimaOrdem: number
}

/** Um lote como o servidor gravou: o lote do mapa e o número de ordem que o servidor deu. */
export interface LoteDoServidor {
  ordem: number
  lote: Lote
}

/** O registro do token do grupo de um mapa. `token` é null quando o token está fora do mapa. */
export interface TokenDoServidor {
  id: string
  token: TokenGrupo | null
}

/** A viagem da campanha no servidor. `config` é null enquanto o mestre nunca gravou. */
export interface ViagemDoServidor {
  id: string
  /** Só os campos numéricos: o resto o mapa valida e completa com os padrões (app/src/mapa/viagem-campanha.ts). */
  config: Record<string, number> | null
  /** Quando foi gravada, no formato do servidor ("2026-11-24 12:00:00.123Z"). Vazio se o servidor não mandou. */
  atualizado: string
}

// ---------- batalha ----------

/** Uma cena na lista do seletor do mapa de batalha. `ativa` é a que os jogadores veem. */
export interface ResumoCenaBatalha {
  id: string
  nome: string
  ativa: boolean
}

/** Um token como o mapa de batalha usa (`id` é o idLocal), com quem pode movê-lo além do mestre. */
export interface TokenBatalhaDoServidor {
  id: string
  nome: string
  x: number
  y: number
  tamanho: number
  cor: string
  dono: string | null
}

/** O que o mapa de batalha recebe ao abrir uma cena. `config` e os tokens passam pelo normalizarCena do mapa. */
export interface CenaBatalhaDoServidor {
  nome: string
  config: unknown
  tokens: TokenBatalhaDoServidor[]
  /** Endereço local (blob:) do fundo, ou null sem fundo. Vale até o repositório fechar ou o fundo mudar. */
  imagemUrl: string | null
}

/** A grade, a medida e o fundo de uma cena, quando o mestre muda. */
export interface ConfigDaCenaBatalha {
  nome: string
  config: unknown
  imagemUrl: string | null
}

export type EventoTokenBatalha = { tipo: 'gravado'; token: TokenBatalhaDoServidor } | { tipo: 'removido'; idLocal: string }
