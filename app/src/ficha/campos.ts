// Registro dos tipos de campo: nome, tamanho inicial, estilo e configuração padrão.
// Para criar um tipo novo: acrescente em TipoCampo (tipos.ts), aqui e em CampoVisual.tsx.

import type { ConfigCampo, Elemento, Estilo, Modelo, TipoCampo, Valor } from './tipos'
import { chaveUnica, novoId, slug } from './util'

export interface DefinicaoCampo {
  tipo: TipoCampo
  nome: string
  descricao: string
  /** Guarda um valor no personagem? Falso para elementos decorativos. */
  temChave: boolean
  w: number
  h: number
  rotulo: string
  estilo: Estilo
  config: ConfigCampo
}

const base: Estilo = {
  tamanhoFonte: 15,
  tamanhoRotulo: 11,
  alinhamento: 'esquerda',
  rotulo: 'acima',
  borda: 'linha',
  negrito: false,
}

export const DEFINICOES: DefinicaoCampo[] = [
  {
    tipo: 'texto',
    nome: 'Texto',
    descricao: 'Uma linha, como nome ou classe',
    temChave: true,
    w: 208,
    h: 48,
    rotulo: 'Texto',
    estilo: { ...base, rotulo: 'abaixo' },
    config: { dica: '' },
  },
  {
    tipo: 'textoLongo',
    nome: 'Texto longo',
    descricao: 'Vários parágrafos, como história',
    temChave: true,
    w: 288,
    h: 160,
    rotulo: 'Anotações',
    estilo: { ...base, tamanhoFonte: 14, borda: 'caixa' },
    config: { dica: '', pautado: false },
  },
  {
    tipo: 'numero',
    nome: 'Número',
    descricao: 'Atributos, CA, bônus',
    temChave: true,
    w: 80,
    h: 72,
    rotulo: 'Valor',
    estilo: { ...base, tamanhoFonte: 26, alinhamento: 'centro', borda: 'caixa' },
    config: { min: null, max: null, passo: 1 },
  },
  {
    tipo: 'recurso',
    nome: 'Atual e máximo',
    descricao: 'Vida, mana, munição: 19/20',
    temChave: true,
    w: 208,
    h: 80,
    rotulo: 'Pontos de vida',
    estilo: { ...base, tamanhoFonte: 24, alinhamento: 'centro', borda: 'caixa' },
    config: {
      estiloRecurso: 'numeros',
      barra: true,
      botoes: true,
      divisoes: true,
      mostrarNumeros: true,
      maxPadrao: null,
      cor: null,
    },
  },
  {
    tipo: 'checkbox',
    nome: 'Caixa de marcar',
    descricao: 'Sim ou não, como proficiência',
    temChave: true,
    w: 160,
    h: 24,
    rotulo: 'Marcar',
    estilo: { ...base, tamanhoFonte: 15, tamanhoRotulo: 14, rotulo: 'direita', borda: 'nenhuma' },
    config: { forma: 'quadrado' },
  },
  {
    tipo: 'marcadores',
    nome: 'Marcadores',
    descricao: 'Vários círculos, como espaços de magia',
    temChave: true,
    w: 216,
    h: 28,
    rotulo: 'Usos',
    estilo: { ...base, tamanhoFonte: 16, tamanhoRotulo: 14, rotulo: 'esquerda', borda: 'nenhuma' },
    config: { quantidade: 3, forma: 'circulo', sequencial: true },
  },
  {
    tipo: 'lista',
    nome: 'Lista de opções',
    descricao: 'Escolha uma, como condição',
    temChave: true,
    w: 200,
    h: 56,
    rotulo: 'Opção',
    estilo: { ...base },
    config: { opcoes: ['Opção 1', 'Opção 2', 'Opção 3'] },
  },
  {
    tipo: 'tabela',
    nome: 'Tabela',
    descricao: 'Linhas que crescem, como ataques',
    temChave: true,
    w: 360,
    h: 200,
    rotulo: 'Tabela',
    estilo: { ...base, tamanhoFonte: 14, borda: 'caixa' },
    config: {
      colunas: [
        { id: 'nome', rotulo: 'Nome', tipo: 'texto', largura: 3 },
        { id: 'qtd', rotulo: 'Qtd.', tipo: 'numero', largura: 1 },
      ],
    },
  },
  {
    tipo: 'imagem',
    nome: 'Imagem',
    descricao: 'Retrato, símbolo, brasão',
    temChave: true,
    w: 160,
    h: 200,
    rotulo: 'Retrato',
    estilo: { ...base, rotulo: 'oculto', borda: 'caixa' },
    config: { ajuste: 'cobrir' },
  },
  {
    tipo: 'titulo',
    nome: 'Texto fixo',
    descricao: 'Títulos e instruções da ficha',
    temChave: false,
    w: 240,
    h: 40,
    rotulo: '',
    estilo: { ...base, tamanhoFonte: 26, rotulo: 'oculto', borda: 'nenhuma', negrito: true },
    config: { texto: 'Título' },
  },
  {
    tipo: 'relogio',
    nome: 'Relógio',
    descricao: 'Contagem do Apocalypse World: dano e ameaças',
    temChave: true,
    w: 136,
    h: 160,
    rotulo: 'Dano',
    estilo: { ...base, tamanhoRotulo: 13, alinhamento: 'centro', borda: 'nenhuma' },
    config: { formatoRelogio: 'apocalypse', quantidade: 4, mostrarHoras: true, cor: null },
  },
  {
    tipo: 'moldura',
    nome: 'Moldura',
    descricao: 'Caixa para agrupar campos',
    temChave: false,
    w: 288,
    h: 200,
    rotulo: 'Grupo',
    estilo: { ...base, tamanhoRotulo: 13, borda: 'caixa' },
    config: { espessura: 1.5, raio: 6, preenchimento: null },
  },
]

export const DEF = Object.fromEntries(DEFINICOES.map((d) => [d.tipo, d])) as Record<
  TipoCampo,
  DefinicaoCampo
>

export function criarElemento(tipo: TipoCampo, x: number, y: number, m: Modelo): Elemento {
  const d = DEF[tipo]
  return {
    id: novoId(),
    tipo,
    chave: d.temChave ? chaveUnica(slug(d.rotulo), m) : '',
    rotulo: d.rotulo,
    x: Math.round(x),
    y: Math.round(y),
    w: d.w,
    h: d.h,
    estilo: { ...d.estilo },
    config: structuredClone(d.config),
  }
}

export function valorPadrao(el: Elemento): Valor {
  switch (el.tipo) {
    case 'texto':
    case 'textoLongo':
    case 'lista':
    case 'imagem':
      return ''
    case 'numero':
      return null
    case 'recurso':
      return { atual: null, max: null }
    case 'checkbox':
      return false
    case 'marcadores':
      return Array.from({ length: el.config.quantidade ?? 3 }, () => false)
    case 'tabela':
      return []
    case 'relogio':
      return 0
    default:
      return null
  }
}
