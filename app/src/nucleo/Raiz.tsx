// Moldura do app: abas das telas e o botão de tema, valendo para todas as áreas.

import { useState } from 'react'
import { useAparencia, type Tema } from './aparencia'
import { TELAS } from './telas'
import './nucleo.css'

const CHAVE_TELA = 'app:vista'

const PROXIMO_TEMA: Record<Tema, Tema> = { sistema: 'claro', claro: 'escuro', escuro: 'sistema' }
const NOME_TEMA: Record<Tema, string> = { sistema: 'Sistema', claro: 'Claro', escuro: 'Escuro' }

function telaSalva(): string {
  try {
    const id = localStorage.getItem(CHAVE_TELA)
    return TELAS.some((t) => t.id === id) ? (id as string) : (TELAS[0]?.id ?? '')
  } catch {
    return TELAS[0]?.id ?? ''
  }
}

function IconeTema({ escuro }: { escuro: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {escuro ? (
        <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
      ) : (
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.05 1.05M11.55 11.55l1.05 1.05M3.4 12.6l1.05-1.05M11.55 4.45l1.05-1.05" />
        </>
      )}
    </svg>
  )
}

export function Raiz() {
  const [telaId, setTelaId] = useState(telaSalva)
  const aparencia = useAparencia()
  const atual = TELAS.find((t) => t.id === telaId) ?? TELAS[0]

  const abrir = (id: string) => {
    setTelaId(id)
    try {
      localStorage.setItem(CHAVE_TELA, id)
    } catch {
      // só não lembra a tela na próxima vez
    }
  }

  if (!atual) {
    return <p className="raiz__vazio">Nenhuma tela encontrada. Cada área precisa de um arquivo tela.ts.</p>
  }

  const { Componente } = atual
  return (
    <div className="raiz">
      <nav className="navegacao" aria-label="Telas">
        <div className="navegacao__abas" role="tablist">
          {TELAS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === atual.id} onClick={() => abrir(t.id)}>
              {t.nome}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="navegacao__tema"
          title="Trocar o tema"
          aria-label={`Tema: ${NOME_TEMA[aparencia.tema]}. Trocar o tema`}
          onClick={() => aparencia.mudar({ tema: PROXIMO_TEMA[aparencia.tema] })}
        >
          <IconeTema escuro={aparencia.escuro} />
          <span>{NOME_TEMA[aparencia.tema]}</span>
        </button>
      </nav>
      <div className="raiz__conteudo">
        <Componente />
      </div>
    </div>
  )
}
