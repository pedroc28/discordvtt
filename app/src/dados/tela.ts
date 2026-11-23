// Registro da tela de dados. O núcleo encontra este arquivo sozinho (ver nucleo/telas.ts).

import type { DefinicaoTela } from '../nucleo/telas'
import { TelaDados } from './TelaDados'
import './dados.css'

// Entre o Mapa (20) e a Campanha (30): rola-se durante o jogo, com o mapa aberto na aba ao lado.
export const tela: DefinicaoTela = { id: 'dados', nome: 'Dados', ordem: 25, Componente: TelaDados }
