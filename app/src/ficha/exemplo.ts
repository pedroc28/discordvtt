// Modelo de exemplo no estilo d20, para testar o editor.

import { DEF } from './campos'
import type { ConfigCampo, Elemento, Estilo, Modelo, TipoCampo } from './tipos'

let contador = 0

function el(
  tipo: TipoCampo,
  chave: string,
  rotulo: string,
  x: number,
  y: number,
  w: number,
  h: number,
  estilo: Partial<Estilo> = {},
  config: ConfigCampo = {},
): Elemento {
  const d = DEF[tipo]
  contador++
  return {
    id: `ex_${contador}`,
    tipo,
    chave,
    rotulo,
    x,
    y,
    w,
    h,
    estilo: { ...d.estilo, ...estilo },
    config: { ...structuredClone(d.config), ...config },
  }
}

const ATRIBUTOS: [string, string][] = [
  ['forca', 'Força'],
  ['destreza', 'Destreza'],
  ['constituicao', 'Constituição'],
  ['inteligencia', 'Inteligência'],
  ['sabedoria', 'Sabedoria'],
  ['carisma', 'Carisma'],
]

export function modeloExemplo(): Modelo {
  contador = 0
  const atributos = ATRIBUTOS.map(([chave, rotulo], i) =>
    el('numero', chave, rotulo, 32, 168 + i * 112, 152, 96, { tamanhoFonte: 40, tamanhoRotulo: 13 }),
  )
  const resistencias = ATRIBUTOS.map(([chave, rotulo], i) =>
    el('checkbox', `res_${chave}`, rotulo, 232, 600 + i * 36, 240, 28, {}, { forma: 'circulo' }),
  )

  const principal: Elemento[] = [
    // molduras ficam primeiro para ficarem atrás dos campos
    el('moldura', '', 'Testes contra a morte', 216, 456, 272, 104),
    el('moldura', '', 'Resistências', 216, 576, 272, 264),

    el('texto', 'nome', 'Nome do personagem', 32, 32, 368, 64, { tamanhoFonte: 26, tamanhoRotulo: 12 }),
    el('texto', 'classe_nivel', 'Classe e nível', 416, 32, 176, 64, { tamanhoRotulo: 12 }),
    el('texto', 'origem', 'Origem', 608, 32, 160, 64, { tamanhoRotulo: 12 }),
    el('texto', 'antecedente', 'Antecedente', 416, 104, 176, 48, { tamanhoRotulo: 12 }),
    el('texto', 'jogador', 'Jogador', 608, 104, 160, 48, { tamanhoRotulo: 12 }),
    el('lista', 'tendencia', 'Tendência', 32, 104, 368, 48, { tamanhoRotulo: 12, rotulo: 'abaixo' }, {
      opcoes: ['Leal', 'Neutro', 'Caótico'],
    }),

    ...atributos,

    el('numero', 'ca', 'CA', 216, 168, 80, 96, { tamanhoFonte: 30, rotulo: 'abaixo' }),
    el('numero', 'iniciativa', 'Iniciativa', 312, 168, 80, 96, { tamanhoFonte: 30, rotulo: 'abaixo' }),
    el('texto', 'deslocamento', 'Deslocamento', 408, 168, 80, 96, {
      tamanhoFonte: 22,
      alinhamento: 'centro',
      borda: 'caixa',
    }),
    el('recurso', 'pv', 'Pontos de vida', 216, 280, 272, 88, { tamanhoFonte: 28, tamanhoRotulo: 12 }),
    el('numero', 'pv_temp', 'PV temporários', 216, 384, 128, 56, { tamanhoFonte: 20 }),
    el('recurso', 'dados_vida', 'Dados de vida', 360, 384, 128, 56, { tamanhoFonte: 18 }, {
      barra: false,
      botoes: false,
    }),
    el('marcadores', 'morte_sucessos', 'Sucessos', 232, 488, 240, 28, {}, { quantidade: 3 }),
    el('marcadores', 'morte_falhas', 'Falhas', 232, 520, 240, 28, {}, { quantidade: 3 }),
    ...resistencias,

    el('imagem', 'retrato', 'Retrato', 504, 168, 264, 272),
    el('checkbox', 'inspiracao', 'Inspiração', 504, 456, 264, 28, {}, { forma: 'losango' }),
    el('lista', 'condicao', 'Condição', 504, 496, 264, 64, { tamanhoFonte: 17 }, {
      opcoes: ['Normal', 'Envenenado', 'Atordoado', 'Caído', 'Agarrado', 'Amedrontado', 'Invisível'],
    }),
    el('tabela', 'ataques', 'Ataques', 504, 576, 264, 264, { tamanhoRotulo: 12 }, {
      colunas: [
        { id: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 3 },
        { id: 'bonus', rotulo: 'Bônus', tipo: 'numero', largura: 1.4 },
        { id: 'dano', rotulo: 'Dano', tipo: 'texto', largura: 2 },
      ],
    }),

    el('textoLongo', 'equipamento', 'Equipamento', 32, 856, 456, 232, { tamanhoRotulo: 12 }, { pautado: true }),
    el('textoLongo', 'tracos', 'Traços e anotações', 504, 856, 264, 232, { tamanhoRotulo: 12 }, { pautado: true }),
  ]

  const magias: Elemento[] = [
    el('moldura', '', 'Espaços de magia', 504, 32, 264, 168),
    el('titulo', '', '', 32, 32, 440, 48, { tamanhoFonte: 30 }, { texto: 'Magias' }),
    el('lista', 'atributo_conjuracao', 'Atributo de conjuração', 32, 104, 200, 56, { tamanhoFonte: 17 }, {
      opcoes: ['Inteligência', 'Sabedoria', 'Carisma'],
    }),
    el('numero', 'cd_magia', 'CD', 248, 96, 96, 64, { tamanhoFonte: 24 }),
    el('numero', 'ataque_magia', 'Ataque', 360, 96, 112, 64, { tamanhoFonte: 24 }),
    el('marcadores', 'espacos_1', 'Nível 1', 520, 64, 232, 28, {}, { quantidade: 4, forma: 'quadrado' }),
    el('marcadores', 'espacos_2', 'Nível 2', 520, 96, 232, 28, {}, { quantidade: 3, forma: 'quadrado' }),
    el('marcadores', 'espacos_3', 'Nível 3', 520, 128, 232, 28, {}, { quantidade: 3, forma: 'quadrado' }),
    el('marcadores', 'espacos_4', 'Nível 4', 520, 160, 232, 28, {}, { quantidade: 2, forma: 'quadrado' }),
    el('tabela', 'magias', 'Magias conhecidas', 32, 224, 736, 600, { tamanhoRotulo: 12 }, {
      colunas: [
        { id: 'nivel', rotulo: 'Nível', tipo: 'numero', largura: 1 },
        { id: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 4 },
        { id: 'preparada', rotulo: 'Preparada', tipo: 'checkbox', largura: 1.4 },
        { id: 'notas', rotulo: 'Notas', tipo: 'texto', largura: 5 },
      ],
    }),
    el('textoLongo', 'notas_magia', 'Anotações', 32, 848, 736, 240, { tamanhoRotulo: 12 }, { pautado: true }),
  ]

  return {
    formato: 'ficha-modelo',
    versao: 1,
    id: 'exemplo-d20',
    nome: 'Exemplo d20',
    largura: 800,
    altura: 1120,
    grade: 8,
    fonte: 'serifada',
    corFundo: '#fffdf8',
    corTinta: '#231f1c',
    corDestaque: '#8c2f2f',
    paginas: [
      { id: 'pg_principal', nome: 'Principal', elementos: principal },
      { id: 'pg_magias', nome: 'Magias', elementos: magias },
    ],
  }
}
