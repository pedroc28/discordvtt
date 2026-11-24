// Validação do que chega do PocketBase. O servidor pode estar numa versão diferente ou com
// dados antigos, então nada é usado sem passar por aqui. Registro inválido é descartado.

import { ehLados } from '../dados/operacoes'
import type { Rolagem } from '../dados/tipos'
import { ALTURA_QUADRO, CORES_NOTA, LARGURA_QUADRO, LIMITES_QUADRO, type CorNota, type ImagemQuadro, type ItemQuadro } from '../quadro/tipos'
import { normalizarHexagono, normalizarRegiao } from '../mapa/armazenamento'
import type { Hexagono, Lote, Mudanca, MudancaNota, MudancaRegiao, NotaPrivada, Regiao, TipoLote, TokenGrupo } from '../mapa/tipos'
import type { CamadaMestreDoServidor, Campanha, LoteDoServidor, MapaDoServidor, Papel, Participacao, TokenDoServidor, Usuario } from './tipos'

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const texto = (v: unknown, padrao: string) => (typeof v === 'string' && v.trim() ? v.trim() : padrao)

export function ehPapel(v: unknown): v is Papel {
  return v === 'mestre' || v === 'jogador'
}

export function normalizarUsuario(bruto: unknown): Usuario | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, nome: texto(bruto.name, 'Sem nome') }
}

/** E-mail da própria conta, que o servidor só devolve para a dona dela. */
export function emailDaConta(bruto: unknown): string | null {
  if (!ehObj(bruto) || typeof bruto.email !== 'string' || !bruto.email.includes('@')) return null
  return bruto.email
}

export function normalizarCampanha(bruto: unknown): Campanha | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, nome: texto(bruto.nome, 'Campanha sem nome') }
}

export function normalizarParticipacao(bruto: unknown): Participacao | null {
  if (!ehObj(bruto) || !id(bruto.id) || !id(bruto.campanha) || !id(bruto.usuario) || !ehPapel(bruto.papel)) return null
  return { id: bruto.id, campanhaId: bruto.campanha, usuarioId: bruto.usuario, papel: bruto.papel }
}

/** Aplica a validação a uma lista, descartando o que não passar. */
export function normalizarLista<T>(brutos: unknown, normalizar: (bruto: unknown) => T | null): T[] {
  if (!Array.isArray(brutos)) return []
  return brutos.map(normalizar).filter((item): item is T => item !== null)
}

// ---------- mapa ----------
// Os hexágonos e as regiões passam pela mesma validação que o mapa usa para os dados do navegador
// (app/src/mapa/armazenamento.ts). Assim um campo novo do mapa é tratado igual nos dois lugares.

const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

const ordemOuZero = (v: unknown) => (inteiro(v) && v > 0 ? v : 0)

export function normalizarMapaDoServidor(bruto: unknown): MapaDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  // Vazio, ou um valor que o app não conhece, vale a trava aberta: quem decide de verdade é o servidor.
  return { id: bruto.id, ultimaOrdem: ordemOuZero(bruto.ultimaOrdem), permissao: bruto.permissao === 'mestre' ? 'mestre' : 'todos' }
}

export function normalizarCamadaMestreDoServidor(bruto: unknown): CamadaMestreDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  return { id: bruto.id, ultimaOrdem: ordemOuZero(bruto.ultimaOrdem) }
}

/** Nota privada do mestre. A nota não tem validação no mapa (armazenamento.ts), então ela mora aqui. */
export function normalizarNotaPrivada(bruto: unknown): NotaPrivada | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r) || typeof bruto.texto !== 'string') return null
  return { q: bruto.q, r: bruto.r, texto: bruto.texto, rev: inteiro(bruto.rev) && bruto.rev > 0 ? bruto.rev : 1 }
}

/** Nota privada guardada no servidor. A posição vale a do registro. */
export function normalizarNotaDoServidor(bruto: unknown): NotaPrivada | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r) || !ehObj(bruto.dados)) return null
  return normalizarNotaPrivada({ ...bruto.dados, q: bruto.q, r: bruto.r })
}

/** Hexágono guardado no servidor. A posição vale a do registro, que é a que o servidor indexou. */
export function normalizarHexagonoDoServidor(bruto: unknown): Hexagono | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r) || !ehObj(bruto.dados)) return null
  return normalizarHexagono({ ...bruto.dados, q: bruto.q, r: bruto.r })
}

export function normalizarRegiaoDoServidor(bruto: unknown): Regiao | null {
  if (!ehObj(bruto) || !id(bruto.regiaoId) || !ehObj(bruto.dados)) return null
  return normalizarRegiao({ ...bruto.dados, id: bruto.regiaoId })
}

function normalizarMudanca(bruto: unknown): Mudanca | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r)) return null
  const antes = bruto.antes === null || bruto.antes === undefined ? null : normalizarHexagono(bruto.antes)
  const depois = bruto.depois === null || bruto.depois === undefined ? null : normalizarHexagono(bruto.depois)
  // Um "depois" que não passa na validação não pode virar "apagar o hexágono".
  if (bruto.depois && !depois) return null
  if (depois && (depois.q !== bruto.q || depois.r !== bruto.r)) return null
  return { q: bruto.q, r: bruto.r, antes, depois }
}

function normalizarMudancaNota(bruto: unknown): MudancaNota | null {
  if (!ehObj(bruto) || !inteiro(bruto.q) || !inteiro(bruto.r)) return null
  const antes = bruto.antes === null || bruto.antes === undefined ? null : normalizarNotaPrivada(bruto.antes)
  const depois = bruto.depois === null || bruto.depois === undefined ? null : normalizarNotaPrivada(bruto.depois)
  if (bruto.depois && !depois) return null
  if (depois && (depois.q !== bruto.q || depois.r !== bruto.r)) return null
  return { q: bruto.q, r: bruto.r, antes, depois }
}

const TIPOS_DE_LOTE: readonly TipoLote[] = ['edicao', 'importacao', 'reversao']

/** Tipo e alvo do lote, só quando vêm preenchidos. Lote sem tipo vale edição, como no contrato. */
function tipoEAlvo(bruto: Record<string, unknown>): Pick<Lote, 'tipo' | 'alvoId'> {
  const tipo = TIPOS_DE_LOTE.find((t) => t === bruto.tipo)
  return {
    ...(tipo ? { tipo } : {}),
    ...(typeof bruto.alvoId === 'string' && bruto.alvoId ? { alvoId: bruto.alvoId } : {}),
  }
}

function normalizarMudancaRegiao(bruto: unknown): MudancaRegiao | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  const antes = bruto.antes === null || bruto.antes === undefined ? null : normalizarRegiao(bruto.antes)
  const depois = bruto.depois === null || bruto.depois === undefined ? null : normalizarRegiao(bruto.depois)
  if (bruto.depois && !depois) return null
  if (depois && depois.id !== bruto.id) return null
  return { id: bruto.id, antes, depois }
}

/** Registro da coleção `lotes`, convertido para o `Lote` do mapa, com o número de ordem do servidor. */
export function normalizarLoteDoServidor(bruto: unknown): LoteDoServidor | null {
  if (!ehObj(bruto) || !inteiro(bruto.ordem) || bruto.ordem < 1 || !id(bruto.loteId)) return null
  const lote: Lote = {
    id: bruto.loteId,
    autor: typeof bruto.autor === 'string' ? bruto.autor : '',
    ts: typeof bruto.ts === 'number' && Number.isFinite(bruto.ts) ? bruto.ts : 0,
    mudancas: normalizarLista(bruto.mudancas, normalizarMudanca),
    regioes: normalizarLista(bruto.regioes, normalizarMudancaRegiao),
    ...tipoEAlvo(bruto),
  }
  return { ordem: bruto.ordem, lote }
}

/**
 * Registro da coleção `lotes_mestre`, convertido para um `Lote` só com a parte privada. Tem o mesmo id do
 * lote que o app mandou: um lote com parte pública e privada chega ao mestre em duas partes.
 */
export function normalizarLoteMestreDoServidor(bruto: unknown): LoteDoServidor | null {
  if (!ehObj(bruto) || !inteiro(bruto.ordem) || bruto.ordem < 1 || !id(bruto.loteId)) return null
  const lote: Lote = {
    id: bruto.loteId,
    autor: typeof bruto.autor === 'string' ? bruto.autor : '',
    ts: typeof bruto.ts === 'number' && Number.isFinite(bruto.ts) ? bruto.ts : 0,
    mudancas: [],
    regioes: [],
    ...tipoEAlvo(bruto),
    privado: {
      ocultos: normalizarLista(bruto.ocultos, normalizarMudanca),
      notas: normalizarLista(bruto.notas, normalizarMudancaNota),
    },
  }
  return { ordem: bruto.ordem, lote }
}

/** Registro da coleção `tokens_grupo`. Token fora do mapa vira null, como o mapa espera. */
export function normalizarTokenDoServidor(bruto: unknown): TokenDoServidor | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  let token: TokenGrupo | null = null
  if (bruto.presente === true && inteiro(bruto.q) && inteiro(bruto.r)) {
    token = {
      q: bruto.q,
      r: bruto.r,
      ts: typeof bruto.ts === 'number' && Number.isFinite(bruto.ts) ? bruto.ts : 0,
      autor: typeof bruto.autor === 'string' ? bruto.autor : '',
    }
  }
  return { id: bruto.id, token }
}

// ---------- dados ----------

/** Data do PocketBase ("2026-11-23 04:24:00.123Z") em milissegundos, ou null se não der para ler. */
export function horaDoServidor(bruto: unknown): number | null {
  if (typeof bruto !== 'string' || !bruto) return null
  const ms = Date.parse(bruto.replace(' ', 'T'))
  return Number.isFinite(ms) ? ms : null
}

/** Registro de `rolagens` ou de `rolagens_secretas` (diz qual em `secreta`). Resultado fora do dado descarta o registro. */
export function normalizarRolagemDoServidor(bruto: unknown, secreta: boolean): Rolagem | null {
  if (!ehObj(bruto) || !id(bruto.id) || !id(bruto.autor) || !ehLados(bruto.lados)) return null
  const lados = bruto.lados
  if (!inteiro(bruto.resultado) || bruto.resultado < 1 || bruto.resultado > lados) return null
  const quando = horaDoServidor(bruto.created)
  if (quando === null) return null
  return { id: bruto.id, autorId: bruto.autor, lados, resultado: bruto.resultado, quando, secreta }
}

// ---------- quadro ----------

const numeroEntre = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const ehCorNota = (v: unknown): v is CorNota => typeof v === 'string' && (CORES_NOTA as readonly string[]).includes(v)
// Relação vazia vem como string vazia: a conta de quem fez foi apagada.
const idOuVazio = (v: unknown) => (typeof v === 'string' ? v : '')

/** Registro de `quadro_imagens`. Sem arquivo ou com dimensões fora do contrato, descarta. */
export function normalizarImagemQuadroDoServidor(bruto: unknown): ImagemQuadro | null {
  if (!ehObj(bruto) || !id(bruto.id) || !id(bruto.arquivo)) return null
  const { largura, altura, bytes } = bruto
  const lado = LIMITES_QUADRO.ladoImagem
  if (!inteiro(largura) || !inteiro(altura) || largura < 1 || altura < 1 || largura > lado || altura > lado) return null
  if (!inteiro(bytes) || bytes < 1) return null
  const enviada = horaDoServidor(bruto.created)
  if (enviada === null) return null
  const nome = typeof bruto.nome === 'string' ? bruto.nome.trim().slice(0, LIMITES_QUADRO.nomeImagem) : ''
  return { id: bruto.id, autorId: idOuVazio(bruto.autor), nome, arquivo: bruto.arquivo, largura, altura, bytes, enviada }
}

/** Registro de `quadro_itens`. Fora do quadro, de tipo desconhecido ou incompleto, descarta. */
export function normalizarItemQuadroDoServidor(bruto: unknown): ItemQuadro | null {
  if (!ehObj(bruto) || !id(bruto.id)) return null
  const { x, y, largura } = bruto
  if (!numeroEntre(x, 0, LARGURA_QUADRO) || !numeroEntre(y, 0, ALTURA_QUADRO)) return null
  if (!numeroEntre(largura, LIMITES_QUADRO.larguraMinima, LIMITES_QUADRO.larguraMaxima)) return null
  const limite = LIMITES_QUADRO.rotacaoMaxima
  const rotacao = numeroEntre(bruto.rotacao, -limite, limite) ? bruto.rotacao : 0
  const z = inteiro(bruto.z) && bruto.z >= 0 ? bruto.z : 0
  const base = { id: bruto.id, autorId: idOuVazio(bruto.autor), x, y, largura, rotacao, z }
  if (bruto.tipo === 'imagem') {
    if (!id(bruto.imagem)) return null
    return { ...base, tipo: 'imagem', imagemId: bruto.imagem }
  }
  if (bruto.tipo === 'nota') {
    const textoNota = typeof bruto.texto === 'string' ? bruto.texto.slice(0, LIMITES_QUADRO.textoNota) : ''
    return { ...base, tipo: 'nota', texto: textoNota, cor: ehCorNota(bruto.cor) ? bruto.cor : 'amarelo' }
  }
  return null
}
