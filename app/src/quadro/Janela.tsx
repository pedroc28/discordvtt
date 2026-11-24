// Janela por cima da tela (o <dialog> do navegador), para ver uma imagem ou escrever uma nota.
// O navegador cuida do foco: ele entra na janela ao abrir, fica preso nela e volta ao fechar.
// Esc fecha.

import { useEffect, useRef, type ReactNode } from 'react'
import { IconeFechar } from './icones'

export function Janela({ titulo, aoFechar, larga = false, children }: { titulo: string; aoFechar: () => void; larga?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  // Sem fechar na limpeza do efeito: o React, em desenvolvimento, limpa e roda de novo cada efeito, e
  // fechar ali avisaria aoFechar no meio da abertura. Ao sair da tela, o elemento some e a janela junto.
  useEffect(() => {
    const janela = ref.current
    if (janela && !janela.open) janela.showModal()
  }, [])

  return (
    <dialog ref={ref} className={`quadro__janela${larga ? ' quadro__janela--larga' : ''}`} aria-label={titulo} onClose={aoFechar}>
      <div className="quadro__janela-topo">
        <h2 className="quadro__janela-titulo">{titulo}</h2>
        <button type="button" className="botao-icone" aria-label="Fechar" onClick={() => ref.current?.close()}>
          <IconeFechar />
        </button>
      </div>
      {children}
    </dialog>
  )
}
