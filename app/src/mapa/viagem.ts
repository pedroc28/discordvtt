// Cálculos de viagem e provisões sobre o mapa. Puro, sem React nem canvas: lê hexágonos pelo `Leitor`.
//
// Modelo, em poucas linhas:
// - Cada terreno tem um custo de travessia (1 = planície). Entrar num hexágono de custo 2 gasta o tempo de 2.
// - Estrada pela aresta entre os dois hexágonos custa 0,5, qualquer que seja o terreno.
// - Cruzar um rio (aresta com rio e sem estrada, ou seja, sem ponte) soma 1, que é o vau.
// - Terreno de custo `null` não se atravessa (mar aberto, recife).
// - O tempo vem do custo total, de quantos km vale um hexágono e de quantos km o grupo anda por dia.
// As regras são de jogo, não de física: tudo isto pode ser ajustado pelo grupo no painel.

import { DIRECOES, arestaCanonica, distancia, type Hex } from './hex'
import type { Leitor } from './tipos'

export type Ritmo = 'lento' | 'normal' | 'rapido'

export const MULTIPLICADOR_RITMO: Record<Ritmo, number> = { lento: 0.75, normal: 1, rapido: 1.25 }
export const ROTULO_RITMO: Record<Ritmo, string> = { lento: 'Lento', normal: 'Normal', rapido: 'Rápido' }

export interface ConfigViagem {
  viajantes: number
  /** Montarias e animais de carga. Comem e carregam, mas não bebem mais que o grupo diz em `aguaPorMontaria`. */
  montarias: number
  /** Quanto vale um hexágono no mundo, em km. */
  kmPorHex: number
  /** Km por dia no ritmo normal, em terreno de custo 1. */
  kmPorDia: number
  ritmo: Ritmo
  racaoPorPessoa: number
  aguaPorPessoa: number
  racaoPorMontaria: number
  aguaPorMontaria: number
  /** Peso de uma ração e de um litro de água, em kg. */
  pesoRacao: number
  pesoAgua: number
  /** Quanto cada viajante e cada montaria carregam, em kg. */
  cargaPorViajante: number
  cargaPorMontaria: number
  /** O que o grupo já tem. */
  estoqueRacoes: number
  estoqueAgua: number
  /** Dias de viagem para a conta de provisões quando não há rota marcada. */
  diasManuais: number
}

export const CONFIG_PADRAO: ConfigViagem = {
  viajantes: 4,
  montarias: 0,
  kmPorHex: 10,
  kmPorDia: 24,
  ritmo: 'normal',
  racaoPorPessoa: 1,
  aguaPorPessoa: 4,
  racaoPorMontaria: 2,
  aguaPorMontaria: 20,
  pesoRacao: 1,
  pesoAgua: 1,
  cargaPorViajante: 20,
  cargaPorMontaria: 80,
  estoqueRacoes: 0,
  estoqueAgua: 0,
  diasManuais: 0,
}

const LIMITES: Record<Exclude<keyof ConfigViagem, 'ritmo'>, [number, number]> = {
  viajantes: [1, 200],
  montarias: [0, 200],
  kmPorHex: [0.1, 1000],
  kmPorDia: [1, 500],
  racaoPorPessoa: [0, 100],
  aguaPorPessoa: [0, 1000],
  racaoPorMontaria: [0, 100],
  aguaPorMontaria: [0, 1000],
  pesoRacao: [0, 1000],
  pesoAgua: [0, 1000],
  cargaPorViajante: [0, 100000],
  cargaPorMontaria: [0, 100000],
  estoqueRacoes: [0, 1_000_000],
  estoqueAgua: [0, 1_000_000],
  diasManuais: [0, 3650],
}

/** Aceita dado de fora (localStorage, arquivo): campo ruim vira o padrão e número fora da faixa é puxado para ela. */
export function normalizarConfig(bruto: unknown): ConfigViagem {
  const saida: ConfigViagem = { ...CONFIG_PADRAO }
  if (typeof bruto !== 'object' || bruto === null) return saida
  const o = bruto as Record<string, unknown>
  for (const k of Object.keys(LIMITES) as (keyof typeof LIMITES)[]) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) {
      const [min, max] = LIMITES[k]
      saida[k] = Math.min(max, Math.max(min, v))
    }
  }
  // Viajantes e montarias são contagens: sempre inteiros.
  saida.viajantes = Math.round(saida.viajantes)
  saida.montarias = Math.round(saida.montarias)
  if (o.ritmo === 'lento' || o.ritmo === 'normal' || o.ritmo === 'rapido') saida.ritmo = o.ritmo
  return saida
}

/** Custo de atravessar cada terreno (1 = planície). `null` não se atravessa. Terreno que não está aqui custa 1,5. */
export const CUSTO_TERRENO: Record<string, number | null> = {
  planicie: 1,
  campo: 1,
  pomar: 1,
  savana: 1,
  estepe: 1,
  colina: 1.5,
  charneca: 1.5,
  bosque: 1.25,
  floresta: 1.5,
  'floresta-outono': 1.5,
  'floresta-densa': 2.5,
  'floresta-nevada': 2.5,
  'floresta-morta': 2.5,
  taiga: 2,
  selva: 3,
  rochoso: 2,
  planalto: 1.5,
  canion: 2.5,
  montanha: 3,
  'pico-nevado': 4,
  vulcao: 4,
  'campo-de-lava': 4,
  deserto: 2,
  dunas: 2.5,
  oasis: 1,
  salar: 1.5,
  pantano: 3,
  mangue: 3,
  'agua-rasa': 2,
  oceano: null,
  recife: null,
  tundra: 1.5,
  geleira: 3,
  'mar-congelado': 2,
  praia: 1.25,
  'praia-inteira': 1.25,
  falesia: 3,
  'falesia-inteira': 3,
  delta: 2.5,
  cidade: 1,
  ruinas: 1.5,
  'terra-arrasada': 1.5,
  'floresta-encantada': 2,
  cogumelos: 2.5,
  cristais: 2,
}

const CUSTO_DESCONHECIDO = 1.5
const CUSTO_ESTRADA = 0.5
const CUSTO_VAU = 1

export function custoDoTerreno(id: string): number | null {
  return id in CUSTO_TERRENO ? CUSTO_TERRENO[id] : CUSTO_DESCONHECIDO
}

/** Direção (0 a 5) de `a` para `b`, se forem vizinhos. */
function direcaoEntre(a: Hex, b: Hex): number {
  return DIRECOES.findIndex((v) => a.q + v.q === b.q && a.r + v.r === b.r)
}

function arestaTem(leitor: Leitor, a: Hex, d: number, campo: 'rios' | 'estradas'): boolean {
  const aresta = arestaCanonica(a, d)
  return !!leitor.ler(aresta.q, aresta.r)?.[campo].includes(aresta.d)
}

/** Custo de passar de `a` para o vizinho `b`. Null se `b` não existe no mapa ou não se atravessa. */
export function custoDoPasso(leitor: Leitor, a: Hex, b: Hex): number | null {
  const d = direcaoEntre(a, b)
  if (d < 0) return null
  const destino = leitor.ler(b.q, b.r)
  if (!destino || !leitor.ler(a.q, a.r)) return null
  if (arestaTem(leitor, a, d, 'estradas')) return CUSTO_ESTRADA
  const terreno = custoDoTerreno(destino.terreno)
  if (terreno === null) return null
  return terreno + (arestaTem(leitor, a, d, 'rios') ? CUSTO_VAU : 0)
}

export interface Rota {
  /** Todos os hexágonos do caminho, do começo ao fim, sem repetir a emenda entre trechos. */
  caminho: Hex[]
  /** Custo total, em "hexágonos equivalentes de planície". */
  custo: number
}

/** Fila de prioridade mínima simples (heap binário). */
class Fila {
  private itens: { chave: number; valor: string }[] = []
  get tamanho() {
    return this.itens.length
  }
  inserir(chave: number, valor: string) {
    const a = this.itens
    a.push({ chave, valor })
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].chave <= a[i].chave) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  retirar(): { chave: number; valor: string } | undefined {
    const a = this.itens
    if (!a.length) return undefined
    const topo = a[0]
    const ultimo = a.pop()!
    if (a.length) {
      a[0] = ultimo
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].chave < a[m].chave) m = l
        if (r < a.length && a[r].chave < a[m].chave) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return topo
  }
}

const k = (h: Hex) => `${h.q},${h.r}`

/**
 * Caminho mais barato entre dois hexágonos, andando só por hexágonos que existem (Dijkstra com limite de
 * trabalho). Null se não há caminho (água no meio, ilha, hexágono vazio) ou se passa do limite.
 */
export function acharRota(leitor: Leitor, de: Hex, para: Hex, limite = 20000): Rota | null {
  if (!leitor.ler(de.q, de.r) || !leitor.ler(para.q, para.r)) return null
  if (de.q === para.q && de.r === para.r) return { caminho: [{ ...de }], custo: 0 }
  const custo = new Map<string, number>([[k(de), 0]])
  const anterior = new Map<string, Hex>()
  const fila = new Fila()
  fila.inserir(0, k(de))
  const alvo = k(para)
  let visitados = 0
  const feitos = new Set<string>()
  while (fila.tamanho) {
    const { chave, valor } = fila.retirar()!
    if (feitos.has(valor)) continue
    feitos.add(valor)
    if (valor === alvo) break
    if (++visitados > limite) return null
    const [q, r] = valor.split(',').map(Number)
    const atual = { q, r }
    for (const v of DIRECOES) {
      const viz = { q: q + v.q, r: r + v.r }
      const passo = custoDoPasso(leitor, atual, viz)
      if (passo === null) continue
      const novo = chave + passo
      const kv = k(viz)
      if (novo < (custo.get(kv) ?? Infinity)) {
        custo.set(kv, novo)
        anterior.set(kv, atual)
        fila.inserir(novo, kv)
      }
    }
  }
  if (!custo.has(alvo) || !feitos.has(alvo)) return null
  const caminho: Hex[] = [{ ...para }]
  let atual = para
  while (k(atual) !== k(de)) {
    const p = anterior.get(k(atual))
    if (!p) return null
    caminho.push({ ...p })
    atual = p
  }
  caminho.reverse()
  return { caminho, custo: custo.get(alvo)! }
}

export type ResultadoRota = { ok: true; rota: Rota } | { ok: false; trecho: number }

/** Rota passando por vários pontos, em ordem. Se um trecho não tem caminho, diz qual (1 = do primeiro ao segundo ponto). */
export function rotaPorPontos(leitor: Leitor, pontos: readonly Hex[]): ResultadoRota {
  if (pontos.length < 2) return { ok: true, rota: { caminho: pontos.map((p) => ({ ...p })), custo: 0 } }
  const caminho: Hex[] = []
  let custo = 0
  for (let i = 1; i < pontos.length; i++) {
    const trecho = acharRota(leitor, pontos[i - 1], pontos[i])
    if (!trecho) return { ok: false, trecho: i }
    custo += trecho.custo
    caminho.push(...(i === 1 ? trecho.caminho : trecho.caminho.slice(1)))
  }
  return { ok: true, rota: { caminho, custo } }
}

/** Quantos hexágonos de cada terreno a rota cruza (sem contar o de partida), do mais frequente ao menos. */
export function terrenosDaRota(leitor: Leitor, rota: Rota): { terreno: string; n: number }[] {
  const contagem = new Map<string, number>()
  for (const h of rota.caminho.slice(1)) {
    const t = leitor.ler(h.q, h.r)?.terreno
    if (t) contagem.set(t, (contagem.get(t) ?? 0) + 1)
  }
  return [...contagem].map(([terreno, n]) => ({ terreno, n })).sort((a, b) => b.n - a.n || a.terreno.localeCompare(b.terreno))
}

export interface ResumoViagem {
  /** Hexágonos andados (passos). */
  passos: number
  /** Distância em linha reta entre o começo e o fim, em hexágonos. */
  retaEmHex: number
  /** Km andados de fato (passos × km por hexágono). */
  km: number
  /** Km "equivalentes de planície", que é o que cansa: custo × km por hexágono. */
  kmEquivalentes: number
  /** Km por dia no ritmo escolhido. */
  kmPorDiaReal: number
  /** Dias de viagem, fracionário. */
  dias: number
  /** Dias inteiros que é preciso levar provisões para (arredonda para cima). */
  diasDeProvisao: number
}

export function resumirViagem(rota: Rota, cfg: ConfigViagem): ResumoViagem {
  const passos = Math.max(0, rota.caminho.length - 1)
  const kmEquivalentes = rota.custo * cfg.kmPorHex
  const kmPorDiaReal = cfg.kmPorDia * MULTIPLICADOR_RITMO[cfg.ritmo]
  const dias = kmPorDiaReal > 0 ? kmEquivalentes / kmPorDiaReal : 0
  const primeiro = rota.caminho[0]
  const ultimo = rota.caminho[rota.caminho.length - 1]
  return {
    passos,
    retaEmHex: primeiro && ultimo ? distancia(primeiro, ultimo) : 0,
    km: passos * cfg.kmPorHex,
    kmEquivalentes,
    kmPorDiaReal,
    dias,
    // O epsilon evita que 2,0000000001 vire 3 por erro de ponto flutuante.
    diasDeProvisao: Math.ceil(dias - 1e-9),
  }
}

export interface Provisoes {
  dias: number
  racoes: number
  agua: number
  /** Peso das rações e da água, em kg. */
  peso: number
  /** O que o grupo consegue carregar, em kg. */
  capacidade: number
  /** Consumo por dia, para saber quanto dura o estoque. */
  racoesPorDia: number
  aguaPorDia: number
  /** Dias que o estoque atual cobre (o menor entre ração e água). Infinity se não se gasta nada. */
  diasDoEstoque: number
  /** O que falta levar (zero se o estoque basta). */
  faltamRacoes: number
  faltamAgua: number
  /** Verdadeiro se o peso passa do que o grupo carrega. */
  sobrecarregado: boolean
}

/** Provisões para `dias` dias. O peso conta o que é preciso ter (o estoque atual mais o que falta) para a viagem. */
export function calcularProvisoes(cfg: ConfigViagem, dias: number): Provisoes {
  const d = Math.max(0, Math.ceil(dias - 1e-9))
  const racoesPorDia = cfg.viajantes * cfg.racaoPorPessoa + cfg.montarias * cfg.racaoPorMontaria
  const aguaPorDia = cfg.viajantes * cfg.aguaPorPessoa + cfg.montarias * cfg.aguaPorMontaria
  const racoes = racoesPorDia * d
  const agua = aguaPorDia * d
  const peso = racoes * cfg.pesoRacao + agua * cfg.pesoAgua
  const capacidade = cfg.viajantes * cfg.cargaPorViajante + cfg.montarias * cfg.cargaPorMontaria
  const diasRacao = racoesPorDia > 0 ? cfg.estoqueRacoes / racoesPorDia : Infinity
  const diasAgua = aguaPorDia > 0 ? cfg.estoqueAgua / aguaPorDia : Infinity
  return {
    dias: d,
    racoes,
    agua,
    peso,
    capacidade,
    racoesPorDia,
    aguaPorDia,
    diasDoEstoque: Math.min(diasRacao, diasAgua),
    faltamRacoes: Math.max(0, racoes - cfg.estoqueRacoes),
    faltamAgua: Math.max(0, agua - cfg.estoqueAgua),
    sobrecarregado: peso > capacidade,
  }
}

/** Texto de duração: "2 dias e 4 h" (dia de 8 horas de marcha). */
export function textoDeDuracao(dias: number): string {
  if (!(dias > 0)) return '0 dia'
  const horasTotais = Math.round(dias * 8)
  const d = Math.floor(horasTotais / 8)
  const h = horasTotais % 8
  const partes: string[] = []
  if (d > 0) partes.push(d === 1 ? '1 dia' : `${d} dias`)
  if (h > 0) partes.push(`${h} h`)
  return partes.length ? partes.join(' e ') : 'menos de 1 h'
}
