import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './nucleo/fontes'
import './nucleo/tema.css'
import { Raiz } from './nucleo/Raiz'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
