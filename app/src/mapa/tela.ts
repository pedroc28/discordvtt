// Registro da tela do mapa. O núcleo encontra este arquivo sozinho (ver nucleo/telas.ts).

import type { DefinicaoTela } from '../nucleo/telas'
import { MapaHex } from './MapaHex'
import './mapa.css'

export const tela: DefinicaoTela = { id: 'mapa', nome: 'Mapa', ordem: 20, Componente: MapaHex }
