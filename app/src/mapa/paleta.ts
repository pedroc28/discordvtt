// Organização da paleta de terrenos: pastas e pesquisa por nome ou tag. Puro, sem React.

import type { DefPasta, DefTerreno, DefTileset } from './tileset'

/** Pasta dos terrenos que o tileset não colocou em nenhuma pasta. */
export const PASTA_OUTROS: DefPasta = { id: 'outros', nome: 'Outros' }

/** Minúsculas e sem acento, para "floresta" achar "Floresta" e "agua" achar "água". */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export interface GrupoPasta {
  pasta: DefPasta
  terrenos: DefTerreno[]
}

/**
 * Terrenos que casam com a pesquisa, agrupados por pasta na ordem do tileset ("Outros" por último).
 * Cada palavra da pesquisa precisa aparecer no nome, em alguma tag ou no nome da pasta (sem contar
 * acento e maiúsculas). Cada tag ativa precisa estar entre as tags do terreno. Pasta vazia some.
 */
export function agruparTerrenos(def: DefTileset, consulta: string, tagsAtivas: readonly string[] = []): GrupoPasta[] {
  const palavras = semAcento(consulta).split(/\s+/).filter(Boolean)
  const exigidas = tagsAtivas.map(semAcento)
  const nomePasta = new Map(def.pastas.map((p) => [p.id, p.nome]))

  const casa = (t: DefTerreno) => {
    const tags = t.tags.map(semAcento)
    if (!exigidas.every((e) => tags.includes(e))) return false
    const palheiro = [semAcento(t.nome), semAcento(nomePasta.get(t.pasta ?? '') ?? PASTA_OUTROS.nome), ...tags]
    return palavras.every((p) => palheiro.some((h) => h.includes(p)))
  }

  const porPasta = new Map<string, DefTerreno[]>()
  for (const t of def.terrenos) {
    if (!casa(t)) continue
    const id = t.pasta ?? PASTA_OUTROS.id
    porPasta.set(id, [...(porPasta.get(id) ?? []), t])
  }
  const saida: GrupoPasta[] = []
  for (const pasta of [...def.pastas, PASTA_OUTROS]) {
    const terrenos = porPasta.get(pasta.id)
    if (terrenos?.length) saida.push({ pasta, terrenos })
  }
  return saida
}

/** Todas as tags do tileset com a quantidade de terrenos de cada uma, das mais usadas para as menos. */
export function contarTags(def: DefTileset): { tag: string; n: number }[] {
  const contagem = new Map<string, number>()
  for (const t of def.terrenos) for (const tag of t.tags) contagem.set(tag, (contagem.get(tag) ?? 0) + 1)
  return [...contagem]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'pt-BR'))
}
