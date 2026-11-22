import { describe, expect, it } from 'vitest'
import {
  campanhaValida,
  ehUnicoMestre,
  limparNomeCampanha,
  mapaContinuaAberto,
  montarCampanhas,
  montarParticipantes,
  problemaNaNovaSenha,
  usuariosDisponiveis,
} from './operacoes'
import type { Participacao, Usuario } from './tipos'

const usuarios: Usuario[] = [
  { id: 'u1', nome: 'bruno' },
  { id: 'u2', nome: 'Ana' },
  { id: 'u3', nome: 'Érica' },
  { id: 'u4', nome: 'Davi' },
]

const p = (id: string, usuarioId: string, papel: 'mestre' | 'jogador', campanhaId = 'c1'): Participacao => ({ id, campanhaId, usuarioId, papel })

describe('campanhas do usuário', () => {
  it('junta o papel de cada campanha e ordena pelo nome', () => {
    const campanhas = [
      { id: 'c2', nome: 'Zona morta' },
      { id: 'c1', nome: 'ária de ferro' },
      { id: 'c3', nome: 'Sem participação' },
    ]
    const minhas = [p('p1', 'u1', 'jogador', 'c2'), p('p2', 'u1', 'mestre', 'c1')]
    expect(montarCampanhas(campanhas, minhas)).toEqual([
      { id: 'c1', nome: 'ária de ferro', papel: 'mestre' },
      { id: 'c2', nome: 'Zona morta', papel: 'jogador' },
    ])
  })

  it('mantém a campanha escolhida antes, ou abre a primeira', () => {
    const lista = [
      { id: 'c1', nome: 'A', papel: 'mestre' as const },
      { id: 'c2', nome: 'B', papel: 'jogador' as const },
    ]
    expect(campanhaValida('c2', lista)).toBe('c2')
    expect(campanhaValida('apagada', lista)).toBe('c1')
    expect(campanhaValida(null, lista)).toBe('c1')
    expect(campanhaValida('c1', [])).toBeNull()
  })
})

describe('participantes', () => {
  const participacoes = [p('p1', 'u1', 'jogador'), p('p2', 'u2', 'jogador'), p('p3', 'u3', 'mestre'), p('p4', 'sumiu', 'jogador')]

  it('mestres primeiro, depois em ordem alfabética, com nome e marca de quem é você', () => {
    const lista = montarParticipantes(participacoes, usuarios, 'u2')
    expect(lista.map((x) => x.nome)).toEqual(['Érica', 'Ana', 'bruno', 'Pessoa sem nome'])
    expect(lista.find((x) => x.euMesmo)?.usuarioId).toBe('u2')
  })

  it('não muda a lista que recebeu', () => {
    const copia = structuredClone(participacoes)
    montarParticipantes(participacoes, usuarios, 'u1')
    expect(participacoes).toEqual(copia)
  })

  it('reconhece o único mestre, que não pode sair nem ser rebaixado', () => {
    expect(ehUnicoMestre(participacoes, 'p3')).toBe(true)
    expect(ehUnicoMestre(participacoes, 'p1')).toBe(false)
    expect(ehUnicoMestre([...participacoes, p('p5', 'u4', 'mestre')], 'p3')).toBe(false)
    expect(ehUnicoMestre(participacoes, 'nao-existe')).toBe(false)
  })

  it('oferece para adicionar só quem ainda não está na campanha', () => {
    expect(usuariosDisponiveis(usuarios, participacoes).map((u) => u.id)).toEqual(['u4'])
  })
})

describe('troca de senha', () => {
  it('aceita senha nova válida e diferente da atual', () => {
    expect(problemaNaNovaSenha('antiga-123', 'nova-senha-1', 'nova-senha-1')).toBeNull()
  })

  it('explica cada problema antes de mandar ao servidor', () => {
    expect(problemaNaNovaSenha('', 'nova-senha-1', 'nova-senha-1')).toBe('Digite a senha atual.')
    expect(problemaNaNovaSenha('antiga-123', 'curta', 'curta')).toContain('pelo menos 8')
    expect(problemaNaNovaSenha('antiga-123', 'x'.repeat(72), 'x'.repeat(72))).toContain('no máximo 71')
    expect(problemaNaNovaSenha('antiga-123', 'nova-senha-1', 'nova-senha-2')).toContain('não bate')
    expect(problemaNaNovaSenha('mesma-senha', 'mesma-senha', 'mesma-senha')).toContain('igual à atual')
  })
})

describe('nome da campanha', () => {
  it('tira espaços sobrando e recusa vazio ou longo demais', () => {
    expect(limparNomeCampanha('  Mesa   de   sábado ')).toBe('Mesa de sábado')
    expect(limparNomeCampanha('   ')).toBeNull()
    expect(limparNomeCampanha('x'.repeat(81))).toBeNull()
    expect(limparNomeCampanha('x'.repeat(80))).toHaveLength(80)
  })
})

describe('mapa aberto', () => {
  const mapa = { campanhaId: 'c1', geracao: 3 }
  it('continua aberto na mesma sessão e na mesma campanha', () => {
    expect(mapaContinuaAberto(mapa, { fase: 'conectado', campanhaAtualId: 'c1', geracao: 3 })).toBe(true)
  })
  it('fecha ao trocar de campanha, sair ou trocar de servidor', () => {
    expect(mapaContinuaAberto(mapa, { fase: 'conectado', campanhaAtualId: 'c2', geracao: 3 })).toBe(false)
    expect(mapaContinuaAberto(mapa, { fase: 'conectado', campanhaAtualId: null, geracao: 3 })).toBe(false)
    expect(mapaContinuaAberto(mapa, { fase: 'desconectado', campanhaAtualId: 'c1', geracao: 3 })).toBe(false)
    expect(mapaContinuaAberto(mapa, { fase: 'conectado', campanhaAtualId: 'c1', geracao: 4 })).toBe(false)
  })
})
