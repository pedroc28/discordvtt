// Ponte entre o arquivo da cena e o navegador: imagem para base64 e de volta, e baixar o arquivo.
// Usa FileReader, fetch e o DOM, então não roda nos testes. As regras ficam em arquivo.ts.

import { TIPOS_DE_IMAGEM, type ArquivoBatalha, type ImagemNoArquivo } from './arquivo'

/** O conteúdo da imagem em base64. Devolve null para tipo que o arquivo não aceita (então a cena vai sem imagem). */
export function imagemParaArquivo(blob: Blob): Promise<ImagemNoArquivo | null> {
  const tipo = TIPOS_DE_IMAGEM.find((t) => t === blob.type)
  if (!tipo) return Promise.resolve(null)
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader()
    leitor.onerror = () => rejeitar(leitor.error ?? new Error('Não consegui ler a imagem.'))
    leitor.onload = () => {
      const texto = String(leitor.result)
      resolver({ tipo, dados: texto.slice(texto.indexOf(',') + 1) })
    }
    leitor.readAsDataURL(blob)
  })
}

export async function imagemDoArquivo(imagem: ImagemNoArquivo): Promise<Blob> {
  const resposta = await fetch(`data:${imagem.tipo};base64,${imagem.dados}`)
  return resposta.blob()
}

export function baixarArquivo(arquivo: ArquivoBatalha, nome: string) {
  const blob = new Blob([JSON.stringify(arquivo)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
