// Funções puras sobre os dados do servidor: montam o que a tela mostra a partir do que
// o PocketBase devolveu. Não fazem pedidos nem mudam o que receberam.

import type { Campanha, FaseConexao, MinhaCampanha, Papel, Participacao, ParticipanteVisivel, Usuario } from './tipos'

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })

/** As campanhas do usuário, com o papel dele em cada uma, em ordem alfabética. */
export function montarCampanhas(campanhas: Campanha[], minhasParticipacoes: Participacao[]): MinhaCampanha[] {
  const papelPorCampanha = new Map(minhasParticipacoes.map((p) => [p.campanhaId, p.papel]))
  return campanhas
    .flatMap((c) => {
      const papel = papelPorCampanha.get(c.id)
      // Campanha sem participação do usuário não deveria chegar, mas não dá para mostrar sem papel.
      return papel ? [{ ...c, papel }] : []
    })
    .sort(porNome)
}

/** Participantes de uma campanha com nome, mestres primeiro e depois em ordem alfabética. */
export function montarParticipantes(participacoes: Participacao[], usuarios: Usuario[], euId: string | null): ParticipanteVisivel[] {
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]))
  return participacoes
    .map((p) => ({ ...p, nome: nomes.get(p.usuarioId) ?? 'Pessoa sem nome', euMesmo: p.usuarioId === euId }))
    .sort((a, b) => (a.papel === b.papel ? porNome(a, b) : a.papel === 'mestre' ? -1 : 1))
}

/** A campanha que fica aberta: a escolhida antes, se ainda existir, ou a primeira da lista. */
export function campanhaValida(escolhida: string | null, campanhas: MinhaCampanha[]): string | null {
  if (escolhida && campanhas.some((c) => c.id === escolhida)) return escolhida
  return campanhas[0]?.id ?? null
}

/** A participação é a única de mestre: tirar ou rebaixar deixaria a campanha sem mestre. */
export function ehUnicoMestre(participantes: Participacao[], participacaoId: string): boolean {
  const alvo = participantes.find((p) => p.id === participacaoId)
  if (!alvo || alvo.papel !== 'mestre') return false
  return !participantes.some((p) => p.id !== participacaoId && p.papel === 'mestre')
}

/** Contas que ainda não estão na campanha, para o mestre escolher quem adicionar. */
export function usuariosDisponiveis(usuarios: Usuario[], participantes: Participacao[]): Usuario[] {
  const dentro = new Set(participantes.map((p) => p.usuarioId))
  return usuarios.filter((u) => !dentro.has(u.id)).sort(porNome)
}

export const NOME_PAPEL: Record<Papel, string> = { mestre: 'Mestre', jogador: 'Jogador' }

// Limites da senha no PocketBase: mínimo da coleção de contas e máximo do bcrypt.
export const SENHA_MINIMA = 8
export const SENHA_MAXIMA = 71

/** O que está errado na troca de senha, antes de mandar ao servidor, ou null se está tudo certo. */
export function problemaNaNovaSenha(atual: string, nova: string, confirmacao: string): string | null {
  if (!atual) return 'Digite a senha atual.'
  if (nova.length < SENHA_MINIMA) return `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
  if (nova.length > SENHA_MAXIMA) return `A nova senha pode ter no máximo ${SENHA_MAXIMA} caracteres.`
  if (nova !== confirmacao) return 'A confirmação não bate com a nova senha. Digite a mesma senha nos dois campos.'
  if (nova === atual) return 'A nova senha é igual à atual. Escolha uma diferente.'
  return null
}

/** Nome de campanha aceito pelo servidor: sem espaços nas pontas e com até 80 letras. */
export function limparNomeCampanha(nome: string): string | null {
  const limpo = nome.trim().replace(/\s+/g, ' ')
  return limpo && limpo.length <= 80 ? limpo : null
}

/**
 * Um mapa aberto continua valendo enquanto a pessoa está conectada, na mesma sessão, com a mesma campanha
 * aberta e o mesmo papel nela. Trocar de campanha, sair, trocar de servidor ou virar mestre (ou deixar de
 * ser) fecha as assinaturas dele: a camada do mestre depende do papel.
 */
export function mapaContinuaAberto(
  mapa: { campanhaId: string; geracao: number; papel: Papel },
  sessao: { fase: FaseConexao; campanhaAtualId: string | null; geracao: number; campanhas: MinhaCampanha[] },
): boolean {
  if (sessao.fase !== 'conectado' || sessao.geracao !== mapa.geracao || sessao.campanhaAtualId !== mapa.campanhaId) return false
  return sessao.campanhas.find((c) => c.id === mapa.campanhaId)?.papel === mapa.papel
}
