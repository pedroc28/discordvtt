// Arquivo de exportação do mapa (JSON): montar, ler com validação e planejar a importação.
// Tudo puro, sem rede, sem disco e sem React. Serve de cópia de segurança e para levar o mapa
// de um navegador (ou de um servidor) para outro.

import { normalizarHexagono, normalizarRegiao } from './armazenamento'
import { chave } from './hex'
import { mesmoConteudo } from './operacoes'
import type { Hexagono, Leitor, MapaMeta, Mudanca, MudancaRegiao, Regiao } from './tipos'

export const VERSAO_ARQUIVO = 1

export interface ArquivoMapa {
  formato: 'mapa-hex'
  versao: number
  /** Nome e dados do mapa de onde veio. */
  meta: Pick<MapaMeta, 'id' | 'nome' | 'tileset' | 'escala'>
  /** Data e hora da exportação, ISO 8601. */
  exportadoEm: string
  hexagonos: Hexagono[]
  regioes: Regiao[]
  /** Onde estava o token do grupo, ou null. */
  token: { q: number; r: number } | null
}

export function montarArquivo(
  meta: MapaMeta,
  hexagonos: readonly Hexagono[],
  regioes: readonly Regiao[],
  token: { q: number; r: number } | null,
  agora = new Date(),
): ArquivoMapa {
  return {
    formato: 'mapa-hex',
    versao: VERSAO_ARQUIVO,
    meta: { id: meta.id, nome: meta.nome, tileset: meta.tileset, escala: meta.escala },
    exportadoEm: agora.toISOString(),
    // Ordem fixa (fileira e depois coluna), para dois arquivos do mesmo mapa serem iguais e darem diff legível.
    hexagonos: [...hexagonos].sort((a, b) => a.r - b.r || a.q - b.q),
    regioes: [...regioes].sort((a, b) => a.id.localeCompare(b.id)),
    token: token ? { q: token.q, r: token.r } : null,
  }
}

export interface ResumoLeitura {
  hexagonos: number
  regioes: number
  /** Itens do arquivo que estavam quebrados e foram deixados de fora. */
  descartados: number
}

export type ResultadoLeitura =
  | { ok: true; arquivo: ArquivoMapa; resumo: ResumoLeitura }
  | { ok: false; erro: string }

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Lê o texto de um arquivo de mapa. Itens quebrados são descartados e contados, o arquivo inteiro inválido é recusado. */
export function lerArquivo(texto: string): ResultadoLeitura {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido. Escolha um arquivo exportado pelo mapa.' }
  }
  if (!ehObj(bruto) || bruto.formato !== 'mapa-hex') {
    return { ok: false, erro: 'Este arquivo não é um mapa exportado pelo DiscordVtt.' }
  }
  const versao = typeof bruto.versao === 'number' ? bruto.versao : 0
  if (versao < 1) return { ok: false, erro: 'O arquivo não informa a versão do formato.' }
  if (versao > VERSAO_ARQUIVO) {
    return { ok: false, erro: 'Este arquivo vem de uma versão mais nova do mapa. Atualize o app e tente de novo.' }
  }
  if (!Array.isArray(bruto.hexagonos)) return { ok: false, erro: 'O arquivo não tem a lista de hexágonos.' }

  let descartados = 0
  // Se o mesmo hexágono aparece duas vezes, vale a última.
  const porChave = new Map<string, Hexagono>()
  for (const item of bruto.hexagonos) {
    const h = normalizarHexagono(item)
    if (h) porChave.set(chave(h.q, h.r), h)
    else descartados++
  }
  const regioes = new Map<string, Regiao>()
  for (const item of Array.isArray(bruto.regioes) ? bruto.regioes : []) {
    const r = normalizarRegiao(item)
    if (r) regioes.set(r.id, r)
    else descartados++
  }
  const t = bruto.token
  const token =
    ehObj(t) && Number.isInteger(t.q) && Number.isInteger(t.r) ? { q: t.q as number, r: t.r as number } : null
  const meta = ehObj(bruto.meta) ? bruto.meta : {}
  const texto2 = (v: unknown, padrao: string) => (typeof v === 'string' && v ? v : padrao)

  const arquivo: ArquivoMapa = {
    formato: 'mapa-hex',
    versao,
    meta: {
      id: texto2(meta.id, 'principal'),
      nome: texto2(meta.nome, 'Mapa importado'),
      tileset: texto2(meta.tileset, ''),
      escala: typeof meta.escala === 'string' ? meta.escala : '',
    },
    exportadoEm: texto2(bruto.exportadoEm, ''),
    hexagonos: [...porChave.values()],
    regioes: [...regioes.values()],
    token,
  }
  return { ok: true, arquivo, resumo: { hexagonos: arquivo.hexagonos.length, regioes: arquivo.regioes.length, descartados } }
}

/** Ids de terreno do arquivo que o tileset em uso não tem (esses hexágonos aparecem em cinza), com a contagem. */
export function terrenosDesconhecidos(arquivo: ArquivoMapa, conhecidos: ReadonlySet<string>): Map<string, number> {
  const falta = new Map<string, number>()
  for (const h of arquivo.hexagonos) {
    if (!conhecidos.has(h.terreno)) falta.set(h.terreno, (falta.get(h.terreno) ?? 0) + 1)
  }
  return falta
}

export type ModoImportacao = 'mesclar' | 'substituir'

export interface Existente {
  hexagonos: readonly Hexagono[]
  regioes: readonly Regiao[]
}

export interface PlanoImportacao {
  mudancas: Mudanca[]
  regioes: MudancaRegiao[]
  /** Hexágonos do arquivo que entraram ou mudaram. */
  aplicados: number
  /** Hexágonos que existiam e foram apagados (só no modo substituir). */
  removidos: number
}

/**
 * Monta as mudanças que levam o mapa atual ao conteúdo do arquivo.
 * - `mesclar`: o que está no arquivo entra por cima (mesmo hexágono, vale o do arquivo), o resto fica como está.
 * - `substituir`: o mapa fica igual ao arquivo, e o que não está nele é apagado. Precisa de `existente`
 *   (tudo o que há hoje, inclusive em chunks que não estão carregados).
 * `atual` lê os hexágonos já carregados e serve para o "antes" (e para o desfazer) e para subir a revisão.
 */
export function planejarImportacao(
  atual: Leitor,
  arquivo: ArquivoMapa,
  modo: ModoImportacao,
  existente?: Existente,
): PlanoImportacao {
  const mudancas: Mudanca[] = []
  const regioes: MudancaRegiao[] = []
  const nosArquivo = new Set<string>()
  let aplicados = 0
  let removidos = 0

  for (const novo of arquivo.hexagonos) {
    nosArquivo.add(chave(novo.q, novo.r))
    const antes = atual.ler(novo.q, novo.r)
    if (antes && mesmoConteudo(antes, novo)) continue
    const rev = Math.max(antes?.rev ?? 0, novo.rev) + 1
    mudancas.push({ q: novo.q, r: novo.r, antes, depois: { ...novo, rev } })
    aplicados++
  }
  if (modo === 'substituir') {
    for (const h of existente?.hexagonos ?? []) {
      if (nosArquivo.has(chave(h.q, h.r))) continue
      mudancas.push({ q: h.q, r: h.r, antes: atual.ler(h.q, h.r) ?? h, depois: null })
      removidos++
    }
  }

  const idsArquivo = new Set<string>()
  for (const novo of arquivo.regioes) {
    idsArquivo.add(novo.id)
    const antes = atual.lerRegiao(novo.id)
    if (antes && mesmoConteudo(antes, novo)) continue
    regioes.push({ id: novo.id, antes, depois: { ...novo, rev: Math.max(antes?.rev ?? 0, novo.rev) + 1 } })
  }
  if (modo === 'substituir') {
    for (const r of existente?.regioes ?? []) {
      if (idsArquivo.has(r.id)) continue
      regioes.push({ id: r.id, antes: atual.lerRegiao(r.id) ?? r, depois: null })
    }
  }
  return { mudancas, regioes, aplicados, removidos }
}

/** Nome de arquivo para baixar, sem caracteres problemáticos: `mapa-mapa-do-mundo-2026-11-22.json`. */
export function nomeDoArquivo(nomeDoMapa: string, agora = new Date()): string {
  const limpo = nomeDoMapa
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const data = agora.toISOString().slice(0, 10)
  return `mapa-${limpo || 'sem-nome'}-${data}.json`
}
