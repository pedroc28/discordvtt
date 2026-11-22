// Formato dos dados do servidor dentro do app. Tudo o que chega do PocketBase passa por
// validacao.ts antes de virar um destes tipos.

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
