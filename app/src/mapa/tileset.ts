// Tileset: o conjunto de imagens dos terrenos. É só dados (uma pasta com tileset.json e imagens),
// então trocar a arte não mexe no código. Veja o README do mapa para o formato das imagens.

export interface DefTerreno {
  id: string
  nome: string
  /** Cor de reserva: pinta o hexágono antes da imagem chegar e esconde frestas entre tiles. */
  cor: string
  /** Pixels extras no topo da imagem, para o que passa por cima do hexágono de cima. */
  extra: number
  /** Variantes. Cada hexágono sempre usa a mesma, escolhida pela posição. */
  arquivos: string[]
}

/** Ícone de marcador (cidade, masmorra...). Qualquer tamanho, de preferência quadrado e com fundo transparente. */
export interface DefMarcador {
  id: string
  nome: string
  /** Caminho da imagem, relativo à pasta do tileset.json. */
  arquivo: string
}

export interface DefTileset {
  id: string
  nome: string
  orientacao: 'pointy'
  /** Largura da imagem do hexágono, em px. Define a proporção: R = largura / √3. */
  largura: number
  /** Altura do hexágono sem o extra, em px. */
  altura: number
  /** Arte em pixel art: as imagens são ampliadas sem suavizar, para os pixels ficarem nítidos. */
  pixelart: boolean
  terrenos: DefTerreno[]
  marcadores: DefMarcador[]
}

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown, p: string) => (typeof v === 'string' && v ? v : p)
const positivo = (v: unknown, p: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : p)

export function normalizarTileset(bruto: unknown): DefTileset | null {
  if (!ehObj(bruto) || !Array.isArray(bruto.terrenos)) return null
  if (bruto.orientacao !== 'pointy') return null
  const vistos = new Set<string>()
  const terrenos: DefTerreno[] = []
  for (const t of bruto.terrenos) {
    if (!ehObj(t) || typeof t.id !== 'string' || !t.id || vistos.has(t.id)) continue
    const arquivos = Array.isArray(t.arquivos) ? t.arquivos.filter((a): a is string => typeof a === 'string' && !!a) : []
    vistos.add(t.id)
    terrenos.push({
      id: t.id,
      nome: texto(t.nome, t.id),
      cor: texto(t.cor, '#888888'),
      extra: typeof t.extra === 'number' && t.extra >= 0 ? t.extra : 0,
      arquivos,
    })
  }
  if (!terrenos.length) return null
  const marcadores: DefMarcador[] = []
  const marcadoresVistos = new Set<string>()
  for (const m of Array.isArray(bruto.marcadores) ? bruto.marcadores : []) {
    if (!ehObj(m) || typeof m.id !== 'string' || !m.id || marcadoresVistos.has(m.id)) continue
    if (typeof m.arquivo !== 'string' || !m.arquivo) continue
    marcadoresVistos.add(m.id)
    marcadores.push({ id: m.id, nome: texto(m.nome, m.id), arquivo: m.arquivo })
  }
  return {
    id: texto(bruto.id, 'tileset'),
    nome: texto(bruto.nome, 'Tileset'),
    orientacao: 'pointy',
    largura: positivo(bruto.largura, 256),
    altura: positivo(bruto.altura, 296),
    pixelart: bruto.pixelart === true,
    terrenos,
    marcadores,
  }
}

/** Escolhe a variante de um hexágono de forma estável: a mesma posição sempre dá a mesma. */
export function variantePara(q: number, r: number, quantidade: number): number {
  if (quantidade <= 1) return 0
  let h = Math.imul(q, 0x9e3779b1) ^ Math.imul(r, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) % quantidade
}

export class Tileset {
  private fontes = new Map<string, CanvasImageSource[]>()
  private porId = new Map<string, DefTerreno>()
  private fontesMarcadores = new Map<string, CanvasImageSource>()
  private marcadoresPorId = new Map<string, DefMarcador>()

  readonly def: DefTileset
  private base: string

  private constructor(def: DefTileset, base: string) {
    this.def = def
    this.base = base
    for (const t of def.terrenos) this.porId.set(t.id, t)
    for (const m of def.marcadores) this.marcadoresPorId.set(m.id, m)
  }

  static async carregar(urlManifesto: string): Promise<Tileset> {
    const resposta = await fetch(urlManifesto)
    if (!resposta.ok) throw new Error(`tileset.json não encontrado (${resposta.status})`)
    const def = normalizarTileset(await resposta.json())
    if (!def) throw new Error('tileset.json inválido')
    const ts = new Tileset(def, urlManifesto.slice(0, urlManifesto.lastIndexOf('/') + 1))
    await ts.carregarImagens()
    return ts
  }

  terreno(id: string): DefTerreno | undefined {
    return this.porId.get(id)
  }

  urlArquivo(id: string, indice = 0): string | null {
    const t = this.porId.get(id)
    return t && t.arquivos.length ? this.base + t.arquivos[indice % t.arquivos.length] : null
  }

  marcador(id: string): DefMarcador | undefined {
    return this.marcadoresPorId.get(id)
  }

  urlMarcador(id: string): string | null {
    const m = this.marcadoresPorId.get(id)
    return m ? this.base + m.arquivo : null
  }

  imagemMarcador(id: string): CanvasImageSource | null {
    return this.fontesMarcadores.get(id) ?? null
  }

  imagem(id: string, q: number, r: number): CanvasImageSource | null {
    const lista = this.fontes.get(id)
    return lista?.length ? lista[variantePara(q, r, lista.length)] : null
  }

  /** Imagem que falha ao carregar é ignorada: o hexágono aparece só com a cor de reserva. */
  private async carregarImagens() {
    await Promise.all([
      ...this.def.marcadores.map(async (m) => {
        try {
          const img = new Image()
          img.src = this.base + m.arquivo
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.naturalWidth || 128
          c.height = img.naturalHeight || 128
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
          this.fontesMarcadores.set(m.id, c)
        } catch {
          // ícone ausente: o marcador aparece como um círculo simples
        }
      }),
      this.carregarTerrenos(),
    ])
  }

  private async carregarTerrenos() {
    await Promise.all(
      this.def.terrenos.map(async (t) => {
        const prontas: CanvasImageSource[] = []
        for (const arquivo of t.arquivos) {
          try {
            prontas.push(await this.rasterizar(this.base + arquivo, t.extra))
          } catch {
            // arquivo ausente ou corrompido
          }
        }
        this.fontes.set(t.id, prontas)
      }),
    )
  }

  /** Desenha a imagem uma vez num canvas do tamanho nativo. SVG redesenhado a cada quadro seria lento. */
  private async rasterizar(url: string, extra: number): Promise<CanvasImageSource> {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = this.def.largura
    c.height = this.def.altura + extra
    const ctx = c.getContext('2d')!
    // Pixel art ampliada com suavização vira borrão. A imagem pode ter outro tamanho (ex.: 128 x 128
    // para um hexágono de 256 x 296): ela é esticada para o tamanho do tile e os pixels ficam um pouco mais altos.
    ctx.imageSmoothingEnabled = !this.def.pixelart
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c
  }
}
