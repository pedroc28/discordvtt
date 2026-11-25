// Arquivo de exportação da cena de batalha (JSON): montar e ler com validação. Puro, sem disco nem React.
// Leva a cena inteira e a imagem de fundo (em base64), então um arquivo basta para levar o mapa a outro navegador.

import { LADO_MAXIMO_IMAGEM, normalizarCena } from './operacoes'
import type { Cena } from './tipos'

export const VERSAO_ARQUIVO = 1
export const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'] as const
/** A imagem guardada passa de 25 MB só se vier de um arquivo de fora: em base64, cabe no máximo isto. */
export const BASE64_MAXIMO = 36 * 1024 * 1024

export interface ImagemNoArquivo {
  tipo: (typeof TIPOS_DE_IMAGEM)[number]
  /** O conteúdo da imagem em base64, sem o prefixo `data:`. */
  dados: string
}

export interface ArquivoBatalha {
  formato: 'batalha-vtt'
  versao: number
  exportadoEm: string
  cena: Cena
  imagem: ImagemNoArquivo | null
}

export function montarArquivo(cena: Cena, imagem: ImagemNoArquivo | null, agora = new Date()): ArquivoBatalha {
  return { formato: 'batalha-vtt', versao: VERSAO_ARQUIVO, exportadoEm: agora.toISOString(), cena, imagem }
}

export interface ResumoLeitura {
  tokens: number
  comImagem: boolean
  /** Tokens do arquivo que estavam quebrados e ficaram de fora. */
  descartados: number
}

export type ResultadoLeitura = { ok: true; arquivo: ArquivoBatalha; resumo: ResumoLeitura } | { ok: false; erro: string }

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

function lerImagem(bruto: unknown): ImagemNoArquivo | null | 'ruim' {
  if (bruto === null || bruto === undefined) return null
  if (!ehObj(bruto)) return 'ruim'
  const tipo = TIPOS_DE_IMAGEM.find((t) => t === bruto.tipo)
  if (!tipo || typeof bruto.dados !== 'string' || !bruto.dados) return 'ruim'
  if (bruto.dados.length > BASE64_MAXIMO || bruto.dados.length % 4 !== 0 || !BASE64.test(bruto.dados)) return 'ruim'
  return { tipo, dados: bruto.dados }
}

/** Lê o texto de um arquivo de cena. Token quebrado é descartado e contado, arquivo inválido é recusado com o motivo. */
export function lerArquivo(texto: string): ResultadoLeitura {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido. Escolha um arquivo exportado pelo mapa de batalha.' }
  }
  if (!ehObj(bruto) || bruto.formato !== 'batalha-vtt') {
    return { ok: false, erro: 'Este arquivo não é um mapa de batalha exportado pelo DiscordVtt.' }
  }
  const versao = typeof bruto.versao === 'number' ? bruto.versao : 0
  if (versao < 1) return { ok: false, erro: 'O arquivo não informa a versão do formato.' }
  if (versao > VERSAO_ARQUIVO) return { ok: false, erro: 'Este arquivo vem de uma versão mais nova do mapa. Atualize o app e tente de novo.' }
  if (!ehObj(bruto.cena)) return { ok: false, erro: 'O arquivo não tem a cena.' }

  const cena = normalizarCena({ ...bruto.cena, id: typeof bruto.cena.id === 'string' && bruto.cena.id ? bruto.cena.id : 'importada' })
  if (!cena) return { ok: false, erro: 'A cena do arquivo está quebrada.' }
  const imagem = lerImagem(bruto.imagem)
  if (imagem === 'ruim') return { ok: false, erro: 'A imagem de fundo do arquivo está quebrada ou é de um tipo que o app não abre. Use PNG, JPEG ou WebP.' }

  const dosTokens = Array.isArray(bruto.cena.tokens) ? bruto.cena.tokens.length : 0
  const arquivo: ArquivoBatalha = {
    formato: 'batalha-vtt',
    versao,
    exportadoEm: typeof bruto.exportadoEm === 'string' ? bruto.exportadoEm : '',
    cena,
    imagem,
  }
  return { ok: true, arquivo, resumo: { tokens: cena.tokens.length, comImagem: !!imagem, descartados: Math.max(0, dosTokens - cena.tokens.length) } }
}

/** Nome de arquivo para baixar, sem caracteres problemáticos: `batalha-ponte-do-troll-2026-11-25.json`. */
export function nomeDoArquivo(nomeDaCena: string, agora = new Date()): string {
  const limpo = nomeDaCena
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `batalha-${limpo || 'sem-nome'}-${agora.toISOString().slice(0, 10)}.json`
}

/** A cena do arquivo no lugar da atual: mantém o id da cena de destino e ajusta o fundo ao que a imagem tem de verdade. */
export function cenaParaImportar(do_arquivo: Cena, idDeDestino: string, imagem: { largura: number; altura: number } | null): Cena | null {
  if (imagem && (imagem.largura > LADO_MAXIMO_IMAGEM || imagem.altura > LADO_MAXIMO_IMAGEM)) return null
  return { ...do_arquivo, id: idDeDestino, fundo: imagem ? { largura: imagem.largura, altura: imagem.altura } : null }
}
