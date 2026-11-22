// Mostra o JSON exportado com as opções de baixar o arquivo ou copiar o texto.
// Copiar serve de reserva onde o navegador bloqueia downloads (ex.: dentro de um iframe).

import { useEffect, useRef, useState } from 'react'
import { baixarArquivo } from './util'

interface Props {
  titulo: string
  nomeArquivo: string
  conteudo: string
  fechar: () => void
}

export function DialogoExportar({ titulo, nomeArquivo, conteudo, fechar }: Props) {
  const texto = useRef<HTMLTextAreaElement>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(conteudo)
      setCopiado(true)
    } catch {
      texto.current?.select()
      setCopiado(document.execCommand('copy'))
    }
  }

  return (
    <div className="dialogo-fundo" onClick={fechar}>
      <div
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialogo-titulo">{titulo}</h2>
        <p className="dialogo__texto">
          Guarde o arquivo para abrir de novo depois ou mandar para o grupo. Se o download não começar, copie o
          texto e salve num arquivo .json.
        </p>
        <textarea ref={texto} className="dialogo__json" readOnly value={conteudo} spellCheck={false} />
        <div className="dialogo__acoes">
          <button type="button" className="botao-topo" onClick={fechar}>
            Fechar
          </button>
          <button type="button" className="botao-topo" onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar texto'}
          </button>
          <button
            type="button"
            className="botao-topo botao-topo--principal"
            autoFocus
            onClick={() => baixarArquivo(nomeArquivo, conteudo)}
          >
            Baixar {nomeArquivo}
          </button>
        </div>
      </div>
    </div>
  )
}
