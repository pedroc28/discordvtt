// Registro da tela do mapa de batalha. O núcleo encontra este arquivo sozinho (ver nucleo/telas.ts).

import type { DefinicaoTela } from '../nucleo/telas'
import { TelaBatalha } from './TelaBatalha'
import './batalha.css'

// Logo depois do mapa hexagonal (20).
export const tela: DefinicaoTela = { id: 'batalha', nome: 'Batalha', ordem: 22, Componente: TelaBatalha }
