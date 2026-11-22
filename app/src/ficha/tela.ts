// Registro da tela de fichas. O núcleo encontra este arquivo sozinho (ver nucleo/telas.ts).

import type { DefinicaoTela } from '../nucleo/telas'
import { EditorDeFichas } from './EditorDeFichas'
import './ficha.css'

export const tela: DefinicaoTela = { id: 'fichas', nome: 'Fichas', ordem: 10, Componente: EditorDeFichas }
