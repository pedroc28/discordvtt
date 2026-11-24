// Imagens de exemplo que vêm com o app, para testar o quadro sem escolher arquivos. São desenhos
// feitos para o projeto (as fontes estão em exemplos/desenhos/), sem imagens de terceiros.

import lista from './exemplos/lista.json'

// O Vite dá a cada imagem um endereço próprio no site. Elas só são baixadas quando alguém pede.
const enderecos = import.meta.glob<string>('./exemplos/*.webp', { query: '?url', import: 'default', eager: true })

export const EXEMPLOS: ReadonlyArray<{ nome: string; url: string }> = lista.imagens.flatMap((imagem) => {
  const url = enderecos[`./exemplos/${imagem.arquivo}`]
  return url ? [{ nome: imagem.nome, url }] : []
})

/** Baixa as imagens de exemplo do próprio site, como arquivos prontos para enviar ao servidor. */
export async function carregarExemplos(): Promise<File[]> {
  return Promise.all(
    EXEMPLOS.map(async ({ nome, url }) => {
      let resposta: Response
      try {
        resposta = await fetch(url)
      } catch {
        throw new Error('o site não respondeu. Confira a internet e tente de novo.')
      }
      if (!resposta.ok) throw new Error('as imagens de exemplo não estão no site. Atualize a página e tente de novo.')
      // O nome do arquivo vira o nome da imagem na biblioteca.
      return new File([await resposta.blob()], `${nome}.webp`, { type: 'image/webp' })
    }),
  )
}
