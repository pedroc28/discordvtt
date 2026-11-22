// Registro da tela de campanha. O núcleo encontra este arquivo sozinho (ver nucleo/telas.ts).

import type { DefinicaoTela } from '../nucleo/telas'
import { TelaCampanha } from './TelaCampanha'
import './servidor.css'

export const tela: DefinicaoTela = { id: 'campanha', nome: 'Campanha', ordem: 30, Componente: TelaCampanha }
