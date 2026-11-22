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

const FALHA: Record<Acao, string> = {
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
