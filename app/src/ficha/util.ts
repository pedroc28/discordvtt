import type { Elemento, Modelo } from './tipos'

export function novoId(prefixo = 'e'): string {
  return `${prefixo}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

/** "Força de Vontade" → "forca_de_vontade" */
export function slug(texto: string): string {
  const s = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!s) return 'campo'
  return /^[0-9]/.test(s) ? `_${s}` : s
}

export const chaveValida = (c: string) => /^[a-z_][a-z0-9_]*$/.test(c)

export function limitar(v: number, min?: number | null, max?: number | null): number {
  let r = v
  if (min != null && r < min) r = min
  if (max != null && r > max) r = max
  return r
}

export function arredondarGrade(v: number, grade: number): number {
  return grade > 1 ? Math.round(v / grade) * grade : Math.round(v)
}

export function todosElementos(m: Modelo): Elemento[] {
  return m.paginas.flatMap((p) => p.elementos)
}

/** Mapa chave → elementos que usam essa chave (em todas as páginas). */
export function usosDeChaves(m: Modelo, ignorarId?: string): Map<string, Elemento[]> {
  const mapa = new Map<string, Elemento[]>()
  for (const e of todosElementos(m)) {
    if (!e.chave || e.id === ignorarId) continue
    const lista = mapa.get(e.chave) ?? []
    lista.push(e)
    mapa.set(e.chave, lista)
  }
  return mapa
}

export function chaveUnica(base: string, m: Modelo, ignorarId?: string, extras: string[] = []): string {
  const usadas = new Set([...usosDeChaves(m, ignorarId).keys(), ...extras])
  if (!usadas.has(base)) return base
  let i = 2
  while (usadas.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

/** A chave ainda é a gerada automaticamente a partir do rótulo? */
export function chaveEhAutomatica(chave: string, rotulo: string): boolean {
  const base = slug(rotulo)
  return chave === base || new RegExp(`^${base}_\\d+$`).test(chave)
}

export function baixarArquivo(nome: string, conteudo: string, tipo = 'application/json') {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function lerArquivoTexto(arquivo: File): Promise<string> {
  return arquivo.text()
}

/** Reduz a imagem para no máximo `lado` px e devolve um data URL leve. */
export function reduzirImagem(arquivo: File, lado = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas indisponível'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/webp', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem'))
    }
    img.src = url
  })
}
