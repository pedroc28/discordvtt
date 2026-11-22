import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fontes'
import './ficha/ficha.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
