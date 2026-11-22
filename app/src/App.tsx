import { useState } from 'react'
import { EditorDeFichas } from './ficha/EditorDeFichas'
import { MapaHex } from './mapa/MapaHex'

type Vista = 'fichas' | 'mapa'

const VISTAS: { id: Vista; nome: string }[] = [
  { id: 'fichas', nome: 'Fichas' },
  { id: 'mapa', nome: 'Mapa' },
]

const CHAVE_VISTA = 'app:vista'

function vistaSalva(): Vista {
  try {
    return localStorage.getItem(CHAVE_VISTA) === 'mapa' ? 'mapa' : 'fichas'
  } catch {
    return 'fichas'
  }
}

export default function App() {
  const [vista, setVista] = useState<Vista>(vistaSalva)

  const trocar = (v: Vista) => {
    setVista(v)
    try {
      localStorage.setItem(CHAVE_VISTA, v)
    } catch {
      // só não lembra a tela na próxima vez
    }
  }

  return (
    <div className="raiz">
      <nav className="navegacao" role="tablist" aria-label="Telas">
        {VISTAS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={vista === v.id} onClick={() => trocar(v.id)}>
            {v.nome}
          </button>
        ))}
      </nav>
      <div className="raiz__conteudo">{vista === 'mapa' ? <MapaHex /> : <EditorDeFichas />}</div>
    </div>
  )
}
