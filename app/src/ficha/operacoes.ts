// Operações puras sobre o modelo. Recebem um Modelo e devolvem outro, sem alterar o original.
// Isso facilita o desfazer agora e a troca por Yjs na etapa de sincronização.

import type { Elemento, Modelo, Pagina } from './tipos'
import { novoId } from './util'

function mapearElementos(m: Modelo, f: (e: Elemento) => Elemento): Modelo {
  let mudou = false
  const paginas = m.paginas.map((p) => {
    let mudouPagina = false
    const elementos = p.elementos.map((e) => {
      const n = f(e)
      if (n !== e) mudouPagina = true
      return n
    })
    if (!mudouPagina) return p
    mudou = true
    return { ...p, elementos }
  })
  return mudou ? { ...m, paginas } : m
}

function mapearPagina(m: Modelo, paginaId: string, f: (p: Pagina) => Pagina): Modelo {
  return { ...m, paginas: m.paginas.map((p) => (p.id === paginaId ? f(p) : p)) }
}

export function atualizarElementos(
  m: Modelo,
  ids: string[],
  f: (e: Elemento) => Elemento,
): Modelo {
  const alvo = new Set(ids)
  return mapearElementos(m, (e) => (alvo.has(e.id) ? f(e) : e))
}

export function adicionarElementos(
  m: Modelo,
  paginaId: string,
  novos: Elemento[],
  atras = false,
): Modelo {
  return mapearPagina(m, paginaId, (p) => ({
    ...p,
    elementos: atras ? [...novos, ...p.elementos] : [...p.elementos, ...novos],
  }))
}

export function removerElementos(m: Modelo, ids: string[]): Modelo {
  const alvo = new Set(ids)
  return {
    ...m,
    paginas: m.paginas.map((p) => ({ ...p, elementos: p.elementos.filter((e) => !alvo.has(e.id)) })),
  }
}

export function moverElementos(m: Modelo, ids: string[], dx: number, dy: number): Modelo {
  if (!dx && !dy) return m
  return atualizarElementos(m, ids, (e) => ({
    ...e,
    x: Math.max(0, Math.min(m.largura - e.w, e.x + dx)),
    y: Math.max(0, Math.min(m.altura - e.h, e.y + dy)),
  }))
}

export function reordenar(m: Modelo, paginaId: string, ids: string[], destino: 'frente' | 'tras'): Modelo {
  const alvo = new Set(ids)
  return mapearPagina(m, paginaId, (p) => {
    const movidos = p.elementos.filter((e) => alvo.has(e.id))
    const resto = p.elementos.filter((e) => !alvo.has(e.id))
    return { ...p, elementos: destino === 'frente' ? [...resto, ...movidos] : [...movidos, ...resto] }
  })
}

export type ModoAlinhar = 'esquerda' | 'centroH' | 'direita' | 'topo' | 'centroV' | 'base'

export function alinhar(m: Modelo, ids: string[], modo: ModoAlinhar): Modelo {
  const els = ids.map((id) => m.paginas.flatMap((p) => p.elementos).find((e) => e.id === id)).filter(
    (e): e is Elemento => !!e,
  )
  if (els.length < 2) return m
  const esq = Math.min(...els.map((e) => e.x))
  const dir = Math.max(...els.map((e) => e.x + e.w))
  const topo = Math.min(...els.map((e) => e.y))
  const base = Math.max(...els.map((e) => e.y + e.h))
  return atualizarElementos(m, ids, (e) => {
    switch (modo) {
      case 'esquerda':
        return { ...e, x: esq }
      case 'direita':
        return { ...e, x: dir - e.w }
      case 'centroH':
        return { ...e, x: Math.round((esq + dir) / 2 - e.w / 2) }
      case 'topo':
        return { ...e, y: topo }
      case 'base':
        return { ...e, y: base - e.h }
      case 'centroV':
        return { ...e, y: Math.round((topo + base) / 2 - e.h / 2) }
    }
  })
}

export function distribuir(m: Modelo, ids: string[], eixo: 'h' | 'v'): Modelo {
  const todos = m.paginas.flatMap((p) => p.elementos)
  const els = ids.map((id) => todos.find((e) => e.id === id)).filter((e): e is Elemento => !!e)
  if (els.length < 3) return m
  const pos = (e: Elemento) => (eixo === 'h' ? e.x : e.y)
  const tam = (e: Elemento) => (eixo === 'h' ? e.w : e.h)
  const ordenados = [...els].sort((a, b) => pos(a) - pos(b))
  const inicio = pos(ordenados[0])
  const fim = Math.max(...ordenados.map((e) => pos(e) + tam(e)))
  const ocupado = ordenados.reduce((s, e) => s + tam(e), 0)
  const espaco = (fim - inicio - ocupado) / (ordenados.length - 1)
  const novasPos = new Map<string, number>()
  let cursor = inicio
  for (const e of ordenados) {
    novasPos.set(e.id, Math.round(cursor))
    cursor += tam(e) + espaco
  }
  return atualizarElementos(m, ids, (e) =>
    eixo === 'h' ? { ...e, x: novasPos.get(e.id)! } : { ...e, y: novasPos.get(e.id)! },
  )
}

export function igualarTamanho(m: Modelo, ids: string[], referenciaId: string, eixo: 'w' | 'h'): Modelo {
  const ref = m.paginas.flatMap((p) => p.elementos).find((e) => e.id === referenciaId)
  if (!ref) return m
  return atualizarElementos(m, ids, (e) => ({ ...e, [eixo]: ref[eixo] }))
}

export function adicionarPagina(m: Modelo, nome: string): { modelo: Modelo; id: string } {
  const id = novoId('p')
  return { modelo: { ...m, paginas: [...m.paginas, { id, nome, elementos: [] }] }, id }
}

export function renomearPagina(m: Modelo, id: string, nome: string): Modelo {
  return mapearPagina(m, id, (p) => ({ ...p, nome }))
}

export function removerPagina(m: Modelo, id: string): Modelo {
  if (m.paginas.length <= 1) return m
  return { ...m, paginas: m.paginas.filter((p) => p.id !== id) }
}

export function duplicarElementos(els: Elemento[], deslocamento: number): Elemento[] {
  return els.map((e) => ({ ...structuredClone(e), id: novoId(), x: e.x + deslocamento, y: e.y + deslocamento }))
}
