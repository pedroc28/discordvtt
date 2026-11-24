// Transforma os erros do PocketBase em mensagens que dizem o que aconteceu e como resolver.
// O PocketBase responde em inglês e de forma genérica, então a mensagem depende da ação.

export type Acao =
  | 'entrar'
  | 'carregar'
  | 'criar'
  | 'renomear'
  | 'apagar'
  | 'adicionar'
  | 'papel'
  | 'remover'
  | 'sair-da-campanha'
  | 'senha'

const FALHA: Record<Acao, string> = {
  senha: 'Não consegui trocar a senha. Tente de novo.',
  entrar: 'Não consegui entrar. Tente de novo.',
  carregar: 'Não consegui carregar as campanhas. Tente de novo.',
  criar: 'Não consegui criar a campanha. Tente de novo.',
  renomear: 'Não consegui renomear a campanha. Tente de novo.',
  apagar: 'Não consegui apagar a campanha. Tente de novo.',
  adicionar: 'Não consegui adicionar a pessoa. Tente de novo.',
  papel: 'Não consegui trocar o papel. Tente de novo.',
  remover: 'Não consegui tirar a pessoa da campanha. Tente de novo.',
  'sair-da-campanha': 'Não consegui sair da campanha. Tente de novo.',
}

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Códigos de validação que o PocketBase devolve por campo, como validation_not_unique. */
function codigosDosCampos(dados: unknown): string[] {
  if (!ehObj(dados)) return []
  return Object.values(dados).flatMap((campo) => (ehObj(campo) && typeof campo.code === 'string' ? [campo.code] : []))
}

export function mensagemDeErro(erro: unknown, acao: Acao, endereco: string): string {
  if (!ehObj(erro)) return FALHA[acao]
  const status = typeof erro.status === 'number' ? erro.status : -1
  const resposta = ehObj(erro.response) ? erro.response : {}
  const mensagem = typeof resposta.message === 'string' ? resposta.message : ''
  const campos = ehObj(resposta.data) ? resposta.data : {}

  // Status 0 é o navegador sem resposta: servidor desligado, endereço errado ou sem internet.
  if (status === 0) {
    return `Não consegui falar com o servidor em ${endereco}. Confira se ele está ligado e se o endereço está certo.`
  }
  if (status === 429) return 'Muitas tentativas seguidas. Espere alguns segundos e tente de novo.'
  if (acao === 'entrar' && status === 400) return 'E-mail ou senha incorretos.'
  if (status === 401) return 'Sua sessão expirou. Entre de novo.'

  // As regras escritas no próprio servidor já respondem em português.
  if (mensagem.includes('pelo menos um mestre')) return mensagem

  if (acao === 'senha' && status === 400) {
    if (codigosDosCampos(campos).includes('validation_invalid_old_password')) return 'A senha atual está errada.'
    if ('password' in campos || 'passwordConfirm' in campos) return 'O servidor não aceitou a nova senha. Use de 8 a 71 caracteres.'
    return FALHA[acao]
  }

  if (status === 400) {
    if (codigosDosCampos(campos).includes('validation_not_unique')) return 'Essa pessoa já está na campanha.'
    if ('nome' in campos) return 'Dê um nome à campanha, com até 80 letras.'
  }
  if (status === 403 || status === 404 || (status === 400 && acao !== 'criar')) {
    if (acao === 'carregar') return 'Não encontrei essa campanha. Ela pode ter sido apagada, ou você saiu dela.'
    if (acao === 'sair-da-campanha') return FALHA[acao]
    // O PocketBase esconde o motivo de propósito: quase sempre é falta de permissão.
    return 'Só o mestre da campanha pode fazer isso. Se você é mestre, atualize a página e tente de novo.'
  }
  return FALHA[acao]
}

// ---------- mapa ----------
// O mapa mostra estas mensagens depois do que ele tentava fazer ("Não consegui salvar: ..."),
// então elas dizem só a causa e o que fazer, começando com letra minúscula.

export const MAPA_FECHADO = 'o mapa foi fechado porque você trocou de campanha ou saiu do servidor. Abra o mapa de novo.'
export const MAPA_DESATUALIZADO =
  'o mapa ficou desatualizado enquanto a conexão estava fora, e o servidor já apagou o que faltava. Recarregue o mapa.'
export const MAPA_SEM_REGISTRO = 'não encontrei o mapa desta campanha. Confira na aba Campanha se você ainda participa dela.'

export function mensagemDeErroMapa(erro: unknown, endereco: string): string {
  // Erros do próprio repositório já vêm prontos.
  if (erro instanceof Error && [MAPA_FECHADO, MAPA_DESATUALIZADO, MAPA_SEM_REGISTRO].includes(erro.message)) return erro.message
  if (!ehObj(erro)) return 'aconteceu um erro inesperado. Tente de novo.'
  const status = typeof erro.status === 'number' ? erro.status : -1
  const resposta = ehObj(erro.response) ? erro.response : {}
  const mensagem = typeof resposta.message === 'string' ? resposta.message : ''

  if (status === 0) return `o servidor em ${endereco} não respondeu. Confira se ele está ligado e tente de novo.`
  if (status === 401) return 'sua sessão expirou. Entre de novo na aba Campanha.'
  if (status === 429) return 'muitas mudanças seguidas. Espere alguns segundos e tente de novo.'
  if (status === 413) return 'o lote é grande demais para o servidor. Divida a importação em partes.'
  // O hook do servidor já explica em português o que estava errado no lote.
  if (mensagem.startsWith('Lote recusado:')) return `o servidor recusou: ${mensagem.slice('Lote recusado:'.length).trim()}`
  if (status === 403 || status === 404) return 'você não participa mais desta campanha, ou ela foi apagada. Confira na aba Campanha.'
  if (status === 400) return 'o servidor recusou a mudança. Atualize a página e tente de novo.'
  return 'o servidor não conseguiu atender. Tente de novo daqui a pouco.'
}

// ---------- dados ----------
// A aba Dados mostra estas mensagens depois do que tentava fazer ("Não consegui rolar: ..."),
// então elas dizem só a causa e o que fazer, começando com letra minúscula.

export const DADOS_FECHADO = 'as rolagens foram fechadas porque você trocou de campanha ou saiu do servidor. Abra a aba Dados de novo.'
export const DADOS_SO_MESTRE = 'só o mestre da campanha rola em segredo.'
export const DADOS_INVALIDO = 'o servidor respondeu com uma rolagem que o app não entendeu. Atualize a página e role de novo.'

export function mensagemDeErroDados(erro: unknown, endereco: string, secreta = false): string {
  // Erros do próprio repositório já vêm prontos.
  if (erro instanceof Error && [DADOS_FECHADO, DADOS_SO_MESTRE, DADOS_INVALIDO].includes(erro.message)) return erro.message
  if (!ehObj(erro)) return 'aconteceu um erro inesperado. Tente de novo.'
  const status = typeof erro.status === 'number' ? erro.status : -1
  const resposta = ehObj(erro.response) ? erro.response : {}
  const mensagem = typeof resposta.message === 'string' ? resposta.message : ''

  if (status === 0) return `o servidor em ${endereco} não respondeu. Confira se ele está ligado e tente de novo.`
  if (status === 401) return 'sua sessão expirou. Entre de novo na aba Campanha.'
  if (status === 429) return 'muitas rolagens seguidas. Espere alguns segundos e role de novo.'
  // O hook do servidor já explica em português o que estava errado.
  if (mensagem.startsWith('Rolagem recusada:')) return `o servidor recusou: ${mensagem.slice('Rolagem recusada:'.length).trim()}`
  // O PocketBase esconde o motivo de propósito: quase sempre é falta de permissão.
  if (status === 400 || status === 403 || status === 404) {
    return secreta
      ? 'só o mestre da campanha rola em segredo. Confira na aba Campanha se você ainda é mestre dela.'
      : 'você não participa mais desta campanha, ou ela foi apagada. Confira na aba Campanha.'
  }
  return 'o servidor não conseguiu atender. Tente de novo daqui a pouco.'
}

// ---------- quadro ----------
// A aba Quadro mostra estas mensagens depois do que tentava fazer ("Não consegui enviar a imagem: ..."),
// então elas dizem só a causa e o que fazer, começando com letra minúscula.

export const QUADRO_FECHADO = 'o quadro foi fechado porque você trocou de campanha ou saiu do servidor. Abra a aba Quadro de novo.'
export const QUADRO_INVALIDO = 'o servidor respondeu com algo que o app não entendeu. Atualize a página e tente de novo.'

export type AcaoQuadro = 'carregar' | 'enviar' | 'renomear' | 'apagar imagem' | 'abrir' | 'prender' | 'mover' | 'editar' | 'tirar'

const SEM_PERMISSAO: Record<AcaoQuadro, string> = {
  carregar: 'você não participa mais desta campanha, ou ela foi apagada. Confira na aba Campanha.',
  enviar: 'você não participa mais desta campanha, ou ela foi apagada. Confira na aba Campanha.',
  renomear: 'só quem enviou a imagem ou o mestre renomeia.',
  'apagar imagem': 'só quem enviou a imagem ou o mestre apaga. Se já foi apagada, atualize a página.',
  abrir: 'a imagem não está mais no servidor, ou você não participa mais da campanha.',
  prender: 'você não participa mais desta campanha, ou ela foi apagada. Confira na aba Campanha.',
  mover: 'o item não está mais no quadro, ou você não participa mais da campanha.',
  editar: 'só quem escreveu a nota edita.',
  tirar: 'só quem prendeu o item ou o mestre tira do quadro. Se já foi tirado, atualize a página.',
}

/** Erro de validação de um campo, no formato do PocketBase: { data: { campo: { code, message } } }. */
function codigoDoCampo(resposta: Record<string, unknown>, campo: string): string {
  const dados = ehObj(resposta.data) ? resposta.data : {}
  const doCampo = ehObj(dados[campo]) ? dados[campo] : {}
  return typeof doCampo.code === 'string' ? doCampo.code : ''
}

export function mensagemDeErroQuadro(erro: unknown, endereco: string, acao: AcaoQuadro): string {
  if (erro instanceof Error && [QUADRO_FECHADO, QUADRO_INVALIDO].includes(erro.message)) return erro.message
  if (!ehObj(erro)) return 'aconteceu um erro inesperado. Tente de novo.'
  const status = typeof erro.status === 'number' ? erro.status : -1
  const resposta = ehObj(erro.response) ? erro.response : {}
  const mensagem = typeof resposta.message === 'string' ? resposta.message : ''

  if (status === 0) return `o servidor em ${endereco} não respondeu. Confira se ele está ligado e tente de novo.`
  if (status === 401) return 'sua sessão expirou. Entre de novo na aba Campanha.'
  if (status === 429) return 'muitos pedidos seguidos. Espere alguns segundos e tente de novo.'
  if (status === 413) return 'a imagem passou de 2 MB. Tente uma menor.'
  // Os hooks do servidor já explicam em português o que estava errado.
  for (const prefixo of ['Imagem recusada:', 'Item recusado:']) {
    if (mensagem.startsWith(prefixo)) return `o servidor recusou: ${mensagem.slice(prefixo.length).trim()}`
  }
  if (status === 400) {
    const arquivo = codigoDoCampo(resposta, 'arquivo')
    if (arquivo === 'validation_file_size_limit') return 'a imagem passou de 2 MB. Tente uma menor.'
    if (arquivo === 'validation_invalid_mime_type') return 'o arquivo não é uma imagem PNG, JPEG ou WebP.'
    if (codigoDoCampo(resposta, 'texto')) return 'a nota passou de 500 caracteres. Encurte e tente de novo.'
  }
  // O PocketBase esconde o motivo de propósito: quase sempre é falta de permissão.
  if (status === 400 || status === 403 || status === 404) return SEM_PERMISSAO[acao]
  return 'o servidor não conseguiu atender. Tente de novo daqui a pouco.'
}
