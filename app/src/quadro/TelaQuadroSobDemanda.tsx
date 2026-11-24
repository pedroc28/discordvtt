// A aba Quadro só é baixada quando alguém abre a aba: o código dela (gestos, biblioteca, preparo das
// imagens) não pesa no carregamento do resto do app.

import { lazy, Suspense } from 'react'

const TelaQuadro = lazy(() => import('./TelaQuadro').then((m) => ({ default: m.TelaQuadro })))

export function TelaQuadroSobDemanda() {
  return (
    <Suspense
      fallback={
        <div className="quadro quadro--vazio">
          <div className="quadro__folha">
            <p className="quadro__dica">Abrindo o quadro.</p>
          </div>
        </div>
      }
    >
      <TelaQuadro />
    </Suspense>
  )
}
