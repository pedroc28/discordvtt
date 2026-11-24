// Levar o mapa que o mestre construiu neste navegador para a campanha, uma vez.
// Só decide se vale oferecer e monta o arquivo. Quem pergunta e quem importa é o MapaHex e o controlador.

import { montarArquivo, type ArquivoMapa } from './arquivo'
import type { RepositorioMapa } from './repositorio'
import type { MapaMeta } from './tipos'

export interface OfertaDeLevar {
  hexagonos: number
  regioes: number
  /** O mapa do navegador, no formato de exportação. Serve de cópia para baixar e de conteúdo da importação. */
  arquivo: ArquivoMapa
}

/**
 * Há o que levar? Sim, quando o mapa da campanha está vazio (sem hexágonos e sem regiões) e o do navegador
 * tem hexágonos. Nos outros casos devolve null, para não oferecer por cima de um mapa que já existe.
 */
export async function prepararOferta(campanha: RepositorioMapa, local: RepositorioMapa, meta: MapaMeta): Promise<OfertaDeLevar | null> {
  if (!campanha.exportarTudo || !local.exportarTudo) return null
  const naCampanha = await campanha.exportarTudo()
  if (naCampanha.hexagonos.length > 0 || naCampanha.regioes.length > 0) return null
  const doNavegador = await local.exportarTudo()
  if (doNavegador.hexagonos.length === 0) return null
  const token = (await local.carregarToken?.()) ?? null
  return {
    hexagonos: doNavegador.hexagonos.length,
    regioes: doNavegador.regioes.length,
    arquivo: montarArquivo(meta, doNavegador.hexagonos, doNavegador.regioes, token),
  }
}
