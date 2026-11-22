// Paleta de terrenos: pesquisa por nome ou tag e terrenos divididos em pastas.

import { useEffect, useMemo, useState } from 'react'
import { agruparTerrenos, contarTags } from './paleta'
import type { DefTileset } from './tileset'

const CHAVE_FECHADAS = 'mapa:pastas-fechadas'

function lerFechadas(): Set<string> {
  try {
    const bruto: unknown = JSON.parse(localStorage.getItem(CHAVE_FECHADAS) ?? '[]')
    return new Set(Array.isArray(bruto) ? bruto.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function gravarFechadas(fechadas: Set<string>) {
  try {
    localStorage.setItem(CHAVE_FECHADAS, JSON.stringify([...fechadas]))
  } catch {
    // sem armazenamento: só não lembra quais pastas estavam fechadas
  }
}

const CELULAR = '(max-width: 720px)'

/** No celular a paleta é uma faixa de uma linha, sem títulos de pasta: todas as pastas valem como abertas. */
function useCelular(): boolean {
  const [celular, setCelular] = useState(() => window.matchMedia(CELULAR).matches)
  useEffect(() => {
    const mq = window.matchMedia(CELULAR)
    const aoMudar = () => setCelular(mq.matches)
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])
  return celular
}

interface Props {
  def: DefTileset
  urlDe: (terrenoId: string) => string | null
  ativo: string
  aoEscolher: (terrenoId: string) => void
}

export function PaletaTerrenos({ def, urlDe, ativo, aoEscolher }: Props) {
  const [consulta, setConsulta] = useState('')
  const [tagsAtivas, setTagsAtivas] = useState<string[]>([])
  const [fechadas, setFechadas] = useState<Set<string>>(lerFechadas)
  const celular = useCelular()

  const tags = useMemo(() => contarTags(def), [def])
  const grupos = useMemo(() => agruparTerrenos(def, consulta, tagsAtivas), [def, consulta, tagsAtivas])
  const filtrando = consulta.trim() !== '' || tagsAtivas.length > 0
  const total = grupos.reduce((n, g) => n + g.terrenos.length, 0)

  const alternarPasta = (id: string) => {
    const novas = new Set(fechadas)
    if (!novas.delete(id)) novas.add(id)
    setFechadas(novas)
    gravarFechadas(novas)
  }
  const alternarTag = (tag: string) =>
    setTagsAtivas((atuais) => (atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag]))
  const limpar = () => {
    setConsulta('')
    setTagsAtivas([])
  }

  return (
    <div className="mapa-paleta">
      <div className="mapa-busca">
        <input
          type="search"
          value={consulta}
          placeholder="Pesquisar nome ou tag"
          aria-label="Pesquisar terrenos por nome ou tag"
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') limpar()
          }}
        />
      </div>

      <details className="mapa-tags">
        <summary>{tagsAtivas.length ? `Tags (${tagsAtivas.length} ativas)` : 'Tags'}</summary>
        <div className="mapa-tags__lista">
          {tags.map(({ tag, n }) => (
            <button
              key={tag}
              type="button"
              className="mapa-tag"
              aria-pressed={tagsAtivas.includes(tag)}
              title={`${n} terreno(s) com a tag ${tag}`}
              onClick={() => alternarTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </details>

      {filtrando && (
        <p className="mapa-paleta__resumo" aria-live="polite">
          {total === 0 ? 'Nenhum terreno encontrado.' : `${total} terreno(s) encontrado(s).`}{' '}
          <button type="button" className="mapa-paleta__limpar" onClick={limpar}>
            Limpar pesquisa
          </button>
        </p>
      )}

      {grupos.map(({ pasta, terrenos }) => {
        // Durante a pesquisa todas as pastas com resultado ficam abertas, senão o resultado ficaria escondido.
        const aberta = filtrando || celular || !fechadas.has(pasta.id)
        return (
          <section key={pasta.id} className="mapa-pasta">
            <button
              type="button"
              className="mapa-pasta__titulo"
              aria-expanded={aberta}
              disabled={filtrando}
              onClick={() => alternarPasta(pasta.id)}
            >
              <span className="mapa-pasta__seta" aria-hidden="true" />
              <span className="mapa-pasta__nome">{pasta.nome}</span>
              <span className="mapa-pasta__conta">{terrenos.length}</span>
            </button>
            {aberta && (
              <div className="mapa-pasta__grade">
                {terrenos.map((t) => {
                  const url = urlDe(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="mapa-terreno"
                      aria-pressed={ativo === t.id}
                      title={t.tags.length ? `${t.nome}. Tags: ${t.tags.join(', ')}` : t.nome}
                      onClick={() => aoEscolher(t.id)}
                    >
                      {url ? <img src={url} alt="" draggable={false} /> : <span className="mapa-terreno__cor" style={{ background: t.cor }} />}
                      <span>{t.nome}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
