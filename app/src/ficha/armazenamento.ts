// Salvar no navegador e validar arquivos JSON importados.
// Na etapa de sincronização isto vai ser trocado pelo PocketBase + Yjs.

import { DEF } from './campos'
import type {
  ColunaTabela,
  Elemento,
  Estilo,
  Fonte,
  Modelo,
  Pagina,
  Personagem,
  TipoCampo,
  Valores,
} from './tipos'
import { novoId } from './util'

const CHAVE_MODELO = 'fichas:modelo'
const prefixoValores = 'fichas:valores:'

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao)
const str = (v: unknown, padrao: string) => (typeof v === 'string' ? v : padrao)
const umDe = <T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T =>
  opcoes.includes(v as T) ? (v as T) : padrao

const FONTES: Fonte[] = ['serifada', 'sem-serifa', 'condensada']

function normalizarElemento(bruto: unknown): Elemento | null {
  if (!ehObj(bruto)) return null
  const tipo = bruto.tipo as TipoCampo
  const def = DEF[tipo]
  if (!def) return null
  const e = ehObj(bruto.estilo) ? bruto.estilo : {}
  const estilo: Estilo = {
    tamanhoFonte: num(e.tamanhoFonte, def.estilo.tamanhoFonte),
    tamanhoRotulo: num(e.tamanhoRotulo, def.estilo.tamanhoRotulo),
    alinhamento: umDe(e.alinhamento, ['esquerda', 'centro', 'direita'], def.estilo.alinhamento),
    rotulo: umDe(e.rotulo, ['acima', 'abaixo', 'esquerda', 'direita', 'oculto'], def.estilo.rotulo),
    borda: umDe(e.borda, ['caixa', 'linha', 'nenhuma'], def.estilo.borda),
    negrito: typeof e.negrito === 'boolean' ? e.negrito : def.estilo.negrito,
  }
  const config = { ...structuredClone(def.config), ...(ehObj(bruto.config) ? bruto.config : {}) }
  if (config.colunas) {
    config.colunas = (Array.isArray(config.colunas) ? config.colunas : [])
      .filter(ehObj)
      .map(
        (c): ColunaTabela => ({
          id: str(c.id, novoId('c')),
          rotulo: str(c.rotulo, 'Coluna'),
          tipo: umDe(c.tipo, ['texto', 'numero', 'checkbox'], 'texto'),
          largura: Math.max(1, num(c.largura, 1)),
        }),
      )
  }
  return {
    id: str(bruto.id, novoId()),
    tipo,
    chave: def.temChave ? str(bruto.chave, '') : '',
    rotulo: str(bruto.rotulo, def.rotulo),
    x: num(bruto.x, 0),
    y: num(bruto.y, 0),
    w: Math.max(8, num(bruto.w, def.w)),
    h: Math.max(8, num(bruto.h, def.h)),
    estilo,
    config,
  }
}

export function normalizarModelo(bruto: unknown): Modelo | null {
  if (!ehObj(bruto) || bruto.formato !== 'ficha-modelo' || !Array.isArray(bruto.paginas)) return null
  const paginas: Pagina[] = bruto.paginas.filter(ehObj).map((p) => ({
    id: str(p.id, novoId('p')),
    nome: str(p.nome, 'Página'),
    elementos: (Array.isArray(p.elementos) ? p.elementos : [])
      .map(normalizarElemento)
      .filter((e): e is Elemento => !!e),
  }))
  if (!paginas.length) paginas.push({ id: novoId('p'), nome: 'Página 1', elementos: [] })
  return {
    formato: 'ficha-modelo',
    versao: 1,
    id: str(bruto.id, novoId('m')),
    nome: str(bruto.nome, 'Modelo sem nome'),
    largura: Math.max(200, num(bruto.largura, 800)),
    altura: Math.max(200, num(bruto.altura, 1120)),
    grade: Math.max(0, num(bruto.grade, 8)),
    fonte: umDe(bruto.fonte, FONTES, 'serifada'),
    corFundo: str(bruto.corFundo, '#ffffff'),
    corTinta: str(bruto.corTinta, '#1d1d1b'),
    corDestaque: str(bruto.corDestaque, '#8c2f2f'),
    paginas,
  }
}

export function normalizarPersonagem(bruto: unknown): Personagem | null {
  if (!ehObj(bruto) || bruto.formato !== 'ficha-personagem' || !ehObj(bruto.valores)) return null
  return {
    formato: 'ficha-personagem',
    versao: 1,
    modeloId: str(bruto.modeloId, ''),
    modeloNome: str(bruto.modeloNome, ''),
    valores: bruto.valores as Valores,
  }
}

export function modeloEmBranco(): Modelo {
  return {
    formato: 'ficha-modelo',
    versao: 1,
    id: novoId('m'),
    nome: 'Novo modelo',
    largura: 800,
    altura: 1120,
    grade: 8,
    fonte: 'sem-serifa',
    corFundo: '#ffffff',
    corTinta: '#1d1d1b',
    corDestaque: '#2f5d8c',
    paginas: [{ id: novoId('p'), nome: 'Página 1', elementos: [] }],
  }
}

/** Retorna false se o navegador recusou (sem espaço ou bloqueado). */
function gravar(chave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

function ler(chave: string): unknown {
  try {
    const t = localStorage.getItem(chave)
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

export const salvarModelo = (m: Modelo) => gravar(CHAVE_MODELO, m)
export const carregarModelo = () => normalizarModelo(ler(CHAVE_MODELO))
export const salvarValores = (modeloId: string, v: Valores) => gravar(prefixoValores + modeloId, v)
export function carregarValores(modeloId: string): Valores {
  const v = ler(prefixoValores + modeloId)
  return ehObj(v) ? (v as Valores) : {}
}
