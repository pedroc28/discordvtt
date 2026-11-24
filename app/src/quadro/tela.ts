// Registro da tela do quadro. O núcleo encontra este arquivo sozinho (ver nucleo/telas.ts).

import type { DefinicaoTela } from '../nucleo/telas'
import { TelaQuadroSobDemanda } from './TelaQuadroSobDemanda'
import './quadro.css'

// Entre os Dados (25) e a Campanha (30).
export const tela: DefinicaoTela = { id: 'quadro', nome: 'Quadro', ordem: 27, Componente: TelaQuadroSobDemanda }
