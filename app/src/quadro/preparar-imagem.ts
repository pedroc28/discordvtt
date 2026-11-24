// Prepara a imagem no navegador antes de enviar: reduz o lado maior para 1600 px e reconverte.
// A reconversão também apaga os dados escondidos do arquivo, como a localização das fotos de celular,
// e gira a foto conforme a orientação gravada nela.
//
// Usa o canvas do navegador, então não roda nos testes. As contas ficam em operacoes.ts, com teste.

import { dimensoesReduzidas, nomeDoArquivo } from './operacoes'

export interface ImagemPreparada {
  arquivo: Blob
  largura: number
  altura: number
  /** Nome do arquivo para o servidor, com a extensão do formato final. */
  nomeArquivo: string
  /** Nome que a imagem ganha na biblioteca, tirado do arquivo original. */
  nome: string
}

const LADO_MAXIMO = 1600
// O servidor aceita até 2 MB. Mirando abaixo disso, sobra folga para o envio.
const TAMANHO_ALVO = 1.2 * 1024 * 1024
const QUALIDADE = 0.85

const EXTENSAO: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob | null> {
  return new Promise((resolver) => canvas.toBlob(resolver, tipo, qualidade))
}

/** Algum pixel não é totalmente opaco. */
function temTransparencia(contexto: CanvasRenderingContext2D, largura: number, altura: number): boolean {
  const { data } = contexto.getImageData(0, 0, largura, altura)
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true
  return false
}

/**
 * WebP, que é menor e guarda transparência. O Safari não gera WebP: devolve PNG no lugar. Aí fica PNG
 * para imagem com transparência e JPEG para o resto, que fica bem menor.
 */
async function codificar(canvas: HTMLCanvasElement, contexto: CanvasRenderingContext2D): Promise<Blob> {
  const webp = await paraBlob(canvas, 'image/webp', QUALIDADE)
  if (webp && webp.type === 'image/webp') return webp
  const final = temTransparencia(contexto, canvas.width, canvas.height) ? await paraBlob(canvas, 'image/png') : await paraBlob(canvas, 'image/jpeg', QUALIDADE)
  if (!final) throw new Error('o navegador não conseguiu converter a imagem. Tente outro navegador.')
  return final
}

export async function prepararImagem(original: File): Promise<ImagemPreparada> {
  let imagem: ImageBitmap
  try {
    imagem = await createImageBitmap(original, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`"${original.name}" não abriu como imagem. Use PNG, JPEG ou WebP.`)
  }
  try {
    let { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height, LADO_MAXIMO)
    // Imagem muito detalhada pode passar do tamanho mesmo reduzida: diminui mais um pouco e tenta de novo.
    for (let tentativa = 0; ; tentativa++) {
      const canvas = document.createElement('canvas')
      canvas.width = largura
      canvas.height = altura
      const contexto = canvas.getContext('2d')
      if (!contexto) throw new Error('o navegador não conseguiu preparar a imagem. Tente outro navegador.')
      contexto.drawImage(imagem, 0, 0, largura, altura)
      const arquivo = await codificar(canvas, contexto)
      if (arquivo.size <= TAMANHO_ALVO || tentativa >= 4) {
        const nome = nomeDoArquivo(original.name)
        return { arquivo, largura, altura, nome, nomeArquivo: `${nome.replace(/[^\w-]+/g, '-') || 'imagem'}.${EXTENSAO[arquivo.type] ?? 'png'}` }
      }
      const menor = dimensoesReduzidas(largura, altura, Math.round(Math.max(largura, altura) * 0.8))
      largura = menor.largura
      altura = menor.altura
    }
  } finally {
    imagem.close()
  }
}
