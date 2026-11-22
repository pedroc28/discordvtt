// Operações puras sobre o mapa. Não alteram nada: recebem um Leitor e devolvem mudanças.
// Quem aplica (e envia, e guarda para desfazer) é o controlador.

import type { Hex } from './hex'
import { chave } from './hex'
import type {
  Hexagono,
  Leitor,
  Lote,
  Mudanca,
  MudancaRegiao,
  PatchHexagono,
  PatchRegiao,
  Regiao,
} from './tipos'

// ---------- hexágonos ----------

export function hexagonoNovo(q: number, r: number, terreno: string): Hexagono {
  return { q, r, terreno, regiaoId: null, nome: '', nota: '', marcadores: [], rev: 1 }
}

/** Pinta o terreno. Em hexágono que já existe só troca o terreno e mantém nome, nota, região e marcadores. */
export function mudancasPintar(leitor: Leitor, hexes: readonly Hex[], terreno: string): Mudanca[] {
  const saida: Mudanca[] = []
  for (const { q, r } of hexes) {
    const antes = leitor.ler(q, r)
    if (!antes) {
      saida.push({ q, r, antes: null, depois: hexagonoNovo(q, r, terreno) })
    } else if (antes.terreno !== terreno) {
      saida.push({ q, r, antes, depois: { ...antes, terreno, rev: antes.rev + 1 } })
    }
  }
  return saida
}

export function mudancasApagar(leitor: Leitor, hexes: readonly Hex[]): Mudanca[] {
  const saida: Mudanca[] = []
  for (const { q, r } of hexes) {
    const antes = leitor.ler(q, r)
    if (antes) saida.push({ q, r, antes, depois: null })
  }
  return saida
}

/** Põe os hexágonos que já existem numa região (ou tira de qualquer região, com null). */
export function mudancasRegiaoDosHexagonos(leitor: Leitor, hexes: readonly Hex[], regiaoId: string | null): Mudanca[] {
  const saida: Mudanca[] = []
  for (const { q, r } of hexes) {
    const antes = leitor.ler(q, r)
    if (antes && antes.regiaoId !== regiaoId) {
      saida.push({ q, r, antes, depois: { ...antes, regiaoId, rev: antes.rev + 1 } })
    }
  }
  return saida
}

const igual = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Edita campos de um hexágono que existe. Null se ele não existe ou nada mudou. */
export function mudancaEditarHexagono(leitor: Leitor, q: number, r: number, patch: PatchHexagono): Mudanca | null {
  const antes = leitor.ler(q, r)
  if (!antes) return null
  const depois: Hexagono = { ...antes }
  let mudou = false
  for (const k of Object.keys(patch) as (keyof PatchHexagono)[]) {
    if (patch[k] === undefined || igual(patch[k], antes[k])) continue
    ;(depois as unknown as Record<string, unknown>)[k] = patch[k]
    mudou = true
  }
  if (!mudou) return null
  depois.rev = antes.rev + 1
  return { q, r, antes, depois }
}

// ---------- regiões ----------

/** Cores sugeridas para regiões novas e no seletor. */
export const CORES_REGIAO = ['#e0524d', '#3f7fd9', '#4aa564', '#d9a53f', '#9a5fd1', '#d9703f', '#3fb5b0', '#cc5fa0']

export function regiaoNova(id: string, dados: { nome: string; cor: string; descricao?: string; paiId?: string | null }): Regiao {
  return { id, nome: dados.nome, cor: dados.cor, descricao: dados.descricao ?? '', paiId: dados.paiId ?? null, rev: 1 }
}

export const mudancaCriarRegiao = (regiao: Regiao): MudancaRegiao => ({ id: regiao.id, antes: null, depois: regiao })

/** Sobe a árvore até a região de topo. Id que não existe encerra a subida. Protegido contra ciclos. */
export function raizDaRegiao(leitor: Leitor, id: string | null): string | null {
  let atual = id
  let raiz: string | null = null
  for (let passo = 0; atual && passo < 32; passo++) {
    const r = leitor.lerRegiao(atual)
    if (!r) break
    raiz = r.id
    atual = r.paiId
  }
  return raiz
}

/**
 * Regiões na ordem de exibição: cada região logo depois do pai, com o nível de recuo.
 * Irmãs saem em ordem alfabética. Pai que não existe (ou ciclo) faz a região virar de topo.
 */
export function arvoreDeRegioes(regioes: readonly Regiao[]): { regiao: Regiao; nivel: number }[] {
  const ids = new Set(regioes.map((r) => r.id))
  const filhas = new Map<string | null, Regiao[]>()
  for (const r of regioes) {
    const pai = r.paiId && ids.has(r.paiId) && r.paiId !== r.id ? r.paiId : null
    filhas.set(pai, [...(filhas.get(pai) ?? []), r])
  }
  const saida: { regiao: Regiao; nivel: number }[] = []
  const visitadas = new Set<string>()
  const descer = (pai: string | null, nivel: number) => {
    const lista = (filhas.get(pai) ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    for (const r of lista) {
      if (visitadas.has(r.id)) continue
      visitadas.add(r.id)
      saida.push({ regiao: r, nivel })
      descer(r.id, nivel + 1)
    }
  }
  descer(null, 0)
  // Regiões presas num ciclo não são alcançadas a partir do topo: entram no fim, como de topo.
  for (const r of regioes) if (!visitadas.has(r.id)) saida.push({ regiao: r, nivel: 0 })
  return saida
}

/** Evita ciclos: uma região não pode ter como pai ela mesma nem uma região que desce dela. */
export function podeSerPai(leitor: Leitor, id: string, paiId: string | null): boolean {
  let atual = paiId
  for (let passo = 0; atual && passo < 32; passo++) {
    if (atual === id) return false
    atual = leitor.lerRegiao(atual)?.paiId ?? null
  }
  return true
}

export function mudancaEditarRegiao(leitor: Leitor, id: string, patch: PatchRegiao): MudancaRegiao | null {
  const antes = leitor.lerRegiao(id)
  if (!antes) return null
  if (patch.paiId !== undefined && !podeSerPai(leitor, id, patch.paiId)) return null
  const depois: Regiao = { ...antes }
  let mudou = false
  for (const k of Object.keys(patch) as (keyof PatchRegiao)[]) {
    if (patch[k] === undefined || patch[k] === antes[k]) continue
    ;(depois as unknown as Record<string, unknown>)[k] = patch[k]
    mudou = true
  }
  if (!mudou) return null
  depois.rev = antes.rev + 1
  return { id, antes, depois }
}

/**
 * Exclui só a região. Os hexágonos que apontavam para ela não são reescritos (podem estar em chunks
 * não carregados): um `regiaoId` sem região correspondente conta como "sem região". Por isso
 * desfazer a exclusão devolve a região com todos os seus hexágonos.
 */
export function mudancaExcluirRegiao(leitor: Leitor, id: string): MudancaRegiao | null {
  const antes = leitor.lerRegiao(id)
  return antes ? { id, antes, depois: null } : null
}

// ---------- juntar e reverter ----------

/**
 * Junta mudanças em sequência no mesmo hexágono numa só: fica o primeiro "antes" e o último "depois".
 * É assim que uma pincelada que passa duas vezes pelo mesmo hexágono vira um passo só.
 */
export function fundirMudancas(sequencia: readonly Mudanca[]): Mudanca[] {
  const mapa = new Map<string, Mudanca>()
  for (const m of sequencia) {
    const k = chave(m.q, m.r)
    const existente = mapa.get(k)
    mapa.set(k, existente ? { q: m.q, r: m.r, antes: existente.antes, depois: m.depois } : m)
  }
  return [...mapa.values()].filter((m) => !(m.antes === null && m.depois === null))
}

export function fundirMudancasRegiao(sequencia: readonly MudancaRegiao[]): MudancaRegiao[] {
  const mapa = new Map<string, MudancaRegiao>()
  for (const m of sequencia) {
    const existente = mapa.get(m.id)
    mapa.set(m.id, existente ? { id: m.id, antes: existente.antes, depois: m.depois } : m)
  }
  return [...mapa.values()].filter((m) => !(m.antes === null && m.depois === null))
}

/** Texto canônico de um valor: chaves em ordem, para comparar conteúdo sem depender da ordem dos campos. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/**
 * Dois estados são "o mesmo" se ambos não existem ou têm o mesmo conteúdo, sem contar a revisão.
 * Não dá para usar a revisão: desfazer e refazer sobem a revisão, e o passo anterior da pilha
 * pareceria alterado por outra pessoa.
 */
function mesmoEstado(a: object | null, b: object | null): boolean {
  if (!a || !b) return a === b
  const { rev: _a, ...ra } = a as Record<string, unknown>
  const { rev: _b, ...rb } = b as Record<string, unknown>
  void _a
  void _b
  return canonico(ra) === canonico(rb)
}

export interface ResultadoDesfazer {
  /** Lote que desfaz o original. Null se nada pôde ser revertido. */
  lote: Lote | null
  /** Itens (hexágonos ou regiões) que não foram revertidos porque outra pessoa mexeu neles depois. */
  conflitos: number
}

/**
 * Monta o lote que desfaz `original`, de forma seletiva: só reverte o que ainda está
 * exatamente como o original deixou. Se outra pessoa mexeu depois, esse item é pulado.
 *
 * Refazer é desfazer o lote de reversão, então não precisa de função própria.
 */
export function reverterLote(
  leitor: Leitor,
  original: Lote,
  novoLote: { id: string; autor: string; ts: number },
): ResultadoDesfazer {
  const mudancas: Mudanca[] = []
  const regioes: MudancaRegiao[] = []
  let conflitos = 0
  for (const m of original.mudancas) {
    const atual = leitor.ler(m.q, m.r)
    if (!mesmoEstado(atual, m.depois)) {
      conflitos++
      continue
    }
    if (!atual && !m.antes) continue
    const rev = Math.max(atual?.rev ?? 0, m.antes?.rev ?? 0) + 1
    mudancas.push({ q: m.q, r: m.r, antes: atual, depois: m.antes ? { ...m.antes, rev } : null })
  }
  for (const m of original.regioes) {
    const atual = leitor.lerRegiao(m.id)
    if (!mesmoEstado(atual, m.depois)) {
      conflitos++
      continue
    }
    if (!atual && !m.antes) continue
    const rev = Math.max(atual?.rev ?? 0, m.antes?.rev ?? 0) + 1
    regioes.push({ id: m.id, antes: atual, depois: m.antes ? { ...m.antes, rev } : null })
  }
  const vazio = !mudancas.length && !regioes.length
  return { lote: vazio ? null : { ...novoLote, mudancas, regioes }, conflitos }
}
