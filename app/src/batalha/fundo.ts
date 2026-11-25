// Prepara a imagem de fundo no navegador. Usa canvas, então não roda nos testes.
// Imagem de até 4096 pixels no lado maior fica como veio (mapa em pixel art não pode ser reamostrado).
// Maior que isso é reduzida, para caber na memória do celular.

import { dimensoesReduzidas } from './operacoes'

export const LADO_MAXIMO_FUNDO = 4096
const TAMANHO_MAXIMO_ARQUIVO = 40 * 1024 * 1024
const TAMANHO_MAXIMO_GUARDADO = 25 * 1024 * 1024

export interface FundoPreparado {
  /** O que fica guardado: o arquivo original ou a versão reduzida. */
  blob: Blob
  bitmap: ImageBitmap
}

/** Abre a imagem guardada, com a mesma orientação de quando foi escolhida. */
export function abrirImagem(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

export async function prepararFundo(arquivo: File): Promise<FundoPreparado> {
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    throw new Error('A imagem tem mais de 40 MB. Reduza o arquivo e tente de novo.')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await abrirImagem(arquivo)
  } catch {
    throw new Error(`"${arquivo.name}" não abriu como imagem. Use PNG, JPEG ou WebP.`)
  }
  const alvo = dimensoesReduzidas(bitmap.width, bitmap.height, LADO_MAXIMO_FUNDO)
  if (alvo.largura === bitmap.width && alvo.altura === bitmap.height && arquivo.size <= TAMANHO_MAXIMO_GUARDADO) {
    return { blob: arquivo, bitmap }
  }
  const canvas = document.createElement('canvas')
  canvas.width = alvo.largura
  canvas.height = alvo.altura
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('O navegador não conseguiu preparar a imagem. Tente outro navegador.')
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, alvo.largura, alvo.altura)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, 'image/webp', 0.92))
  const final = blob ?? (await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, 'image/png')))
  if (!final) throw new Error('O navegador não conseguiu converter a imagem. Tente outro navegador.')
  return { blob: final, bitmap: await abrirImagem(final) }
}
