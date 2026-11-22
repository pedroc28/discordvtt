// Gera o tileset padrão do mapa hexagonal: SVGs procedurais, 13 terrenos com 3 variantes.
// Rode com `npm run tileset`. A saída vai para public/tilesets/padrao/.
//
// É arte provisória. Para trocar por arte própria, veja o README do mapa: basta pôr as imagens
// numa pasta nova em public/tilesets/ com um tileset.json no mesmo formato.
//
// Formato de cada imagem: 256 px de largura e 296 px de altura (hexágono pointy-top encaixado),
// mais `extra` px no topo para o que passa por cima do hexágono de cima (montanhas, por exemplo).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const L = 256
const A = 296
const R = A / 2 // 148
const RAIZ3 = Math.sqrt(3)
const VARIANTES = 3
const saida = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tilesets', 'padrao')

// ---------- utilidades ----------

function sorteio(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n = (v) => Math.round(v * 10) / 10

function misturar(hex, alvo, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = p(hex)
  const b = p(alvo)
  return '#' + a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0')).join('')
}
const clarear = (h, t) => misturar(h, '#ffffff', t)
const escurecer = (h, t) => misturar(h, '#000000', t)

/** Vértices do hexágono pointy-top, com `e` px de folga em cima. */
function pontosHex(e) {
  return [
    [L / 2, e],
    [L, e + A / 4],
    [L, e + (A * 3) / 4],
    [L / 2, e + A],
    [0, e + (A * 3) / 4],
    [0, e + A / 4],
  ]
    .map((p) => p.join(','))
    .join(' ')
}

/** Está dentro do hexágono, com a margem m (1 = borda exata, 0,8 = encolhido)? */
function dentro(x, y, e, m) {
  const dx = Math.abs(x - L / 2)
  const dy = Math.abs(y - (e + R))
  return dx <= (L / 2) * m && dy + dx / RAIZ3 <= R * m
}

/** Espalha pontos dentro do hexágono, afastados entre si, ordenados de cima para baixo. */
function espalhar(rand, quantidade, e, { margem = 0.8, distMin = 30 } = {}) {
  const pts = []
  for (let tentativa = 0; tentativa < quantidade * 60 && pts.length < quantidade; tentativa++) {
    const x = rand() * L
    const y = e + rand() * A
    if (!dentro(x, y, e, margem)) continue
    if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < distMin)) continue
    pts.push({ x, y })
  }
  return pts.sort((a, b) => a.y - b.y)
}

// ---------- peças de desenho ----------

const sombra = (x, y, rx, ry = rx * 0.35) =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="#000" opacity="0.22"/>`

function arvore(x, y, s, cores) {
  return [
    sombra(x, y + s * 0.38, s * 0.42),
    `<rect x="${n(x - s * 0.07)}" y="${n(y + s * 0.05)}" width="${n(s * 0.14)}" height="${n(s * 0.34)}" fill="#5a3d26"/>`,
    `<circle cx="${n(x)}" cy="${n(y - s * 0.1)}" r="${n(s * 0.42)}" fill="${cores[0]}"/>`,
    `<circle cx="${n(x - s * 0.1)}" cy="${n(y - s * 0.2)}" r="${n(s * 0.3)}" fill="${cores[1]}"/>`,
    `<circle cx="${n(x - s * 0.16)}" cy="${n(y - s * 0.28)}" r="${n(s * 0.12)}" fill="${cores[2]}" opacity="0.7"/>`,
  ].join('')
}

function pinheiro(x, y, s, cores) {
  const camada = (cy, w, h, cor) =>
    `<polygon points="${n(x)},${n(cy - h)} ${n(x + w / 2)},${n(cy)} ${n(x - w / 2)},${n(cy)}" fill="${cor}"/>`
  return [
    sombra(x, y + s * 0.4, s * 0.38),
    `<rect x="${n(x - s * 0.05)}" y="${n(y + s * 0.2)}" width="${n(s * 0.1)}" height="${n(s * 0.22)}" fill="#4a3322"/>`,
    camada(y + s * 0.28, s * 0.8, s * 0.5, cores[0]),
    camada(y + s * 0.02, s * 0.64, s * 0.46, cores[1]),
    camada(y - s * 0.2, s * 0.46, s * 0.42, cores[2]),
  ].join('')
}

/** Pico de montanha. A luz vem da esquerda. */
function pico(rand, x, base, w, h, cores, neve) {
  const apice = { x: x + (rand() - 0.5) * w * 0.12, y: base - h }
  const crista = { x: x + w * (0.02 + rand() * 0.1), y: base }
  const meioE = { x: x - w * 0.16, y: base - h * 0.45 }
  const meioD = { x: x + w * 0.2, y: base - h * 0.5 }
  const partes = [
    sombra(x + w * 0.05, base + 4, w * 0.5, w * 0.1),
    // face clara (esquerda)
    `<polygon points="${n(x - w / 2)},${n(base)} ${n(meioE.x)},${n(meioE.y)} ${n(apice.x)},${n(apice.y)} ${n(crista.x)},${n(crista.y)}" fill="${cores[0]}"/>`,
    // face escura (direita)
    `<polygon points="${n(apice.x)},${n(apice.y)} ${n(meioD.x)},${n(meioD.y)} ${n(x + w / 2)},${n(base)} ${n(crista.x)},${n(crista.y)}" fill="${cores[1]}"/>`,
    // fio de luz na crista
    `<polyline points="${n(apice.x)},${n(apice.y)} ${n(crista.x)},${n(crista.y)}" stroke="${cores[2]}" stroke-width="2" fill="none" opacity="0.5"/>`,
  ]
  if (neve) {
    const t = 0.34
    const yN = apice.y + h * t
    const xE = apice.x - (apice.x - (x - w / 2)) * t * 1.08
    const xD = apice.x + (x + w / 2 - apice.x) * t * 1.08
    partes.push(
      `<polygon points="${n(apice.x)},${n(apice.y)} ${n(xD)},${n(yN)} ${n(apice.x + w * 0.1)},${n(yN - h * 0.06)} ${n(apice.x)},${n(yN + h * 0.05)} ${n(apice.x - w * 0.1)},${n(yN - h * 0.05)} ${n(xE)},${n(yN)}" fill="#f4f8fb"/>`,
      `<polygon points="${n(apice.x)},${n(apice.y)} ${n(xD)},${n(yN)} ${n(apice.x + w * 0.1)},${n(yN - h * 0.06)} ${n(apice.x)},${n(yN + h * 0.05)}" fill="#c9d8e4" opacity="0.8"/>`,
    )
  }
  return partes.join('')
}

const onda = (x, y, w, cor, op) =>
  `<path d="M${n(x)} ${n(y)} q${n(w / 4)} ${n(-w / 4)} ${n(w / 2)} 0 t${n(w / 2)} 0" stroke="${cor}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="${op}"/>`

function rocha(x, y, s, cor) {
  return [
    sombra(x, y + s * 0.3, s * 0.6, s * 0.18),
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.55)}" ry="${n(s * 0.38)}" fill="${cor}"/>`,
    `<ellipse cx="${n(x - s * 0.12)}" cy="${n(y - s * 0.1)}" rx="${n(s * 0.3)}" ry="${n(s * 0.18)}" fill="${clarear(cor, 0.3)}" opacity="0.8"/>`,
  ].join('')
}

// ---------- terrenos ----------
// Cada terreno devolve { chao, topo }. `chao` é cortado pelo hexágono; `topo` pode passar para fora.

const TERRENOS = [
  {
    id: 'planicie',
    nome: 'Planície',
    cor: '#9fc062',
    extra: 0,
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 26, e, { margem: 0.92, distMin: 18 })) {
        const c = rand() > 0.5 ? '#7da34a' : '#bcd883'
        chao += `<path d="M${n(p.x)} ${n(p.y)} l-3 -9 M${n(p.x)} ${n(p.y)} l1 -11 M${n(p.x)} ${n(p.y)} l4 -8" stroke="${c}" stroke-width="2" stroke-linecap="round" fill="none"/>`
      }
      for (const p of espalhar(rand, 5, e, { margem: 0.8, distMin: 40 })) {
        chao += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="2.6" fill="${['#f3e58a', '#ffffff', '#f0a8c0'][Math.floor(rand() * 3)]}"/>`
      }
      return { chao, topo: '' }
    },
    base: ['#b4d072', '#8db255'],
  },
  {
    id: 'campo',
    nome: 'Campos de cultivo',
    cor: '#c0b963',
    extra: 0,
    base: ['#cfc774', '#a9a24c'],
    desenhar(rand, e) {
      let chao = ''
      const paleta = ['#d9cf7a', '#8fae55', '#c4a95a', '#a8bf62']
      for (let i = 0; i < 6; i++) {
        const cx = 40 + rand() * 176
        const cy = e + 40 + rand() * 216
        const w = 70 + rand() * 50
        const h = 50 + rand() * 40
        const rot = (rand() - 0.5) * 30
        const cor = paleta[i % paleta.length]
        let sulcos = ''
        for (let k = -h / 2 + 5; k < h / 2; k += 7) {
          sulcos += `<line x1="${n(-w / 2)}" y1="${n(k)}" x2="${n(w / 2)}" y2="${n(k)}" stroke="${escurecer(cor, 0.22)}" stroke-width="1.6"/>`
        }
        chao += `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(rot)})"><rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" fill="${cor}" stroke="${escurecer(cor, 0.35)}" stroke-width="2"/>${sulcos}</g>`
      }
      return { chao, topo: '' }
    },
  },
  {
    id: 'floresta',
    nome: 'Floresta',
    cor: '#5f8f45',
    extra: 0,
    base: ['#78a252', '#5c8741'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 9, e, { margem: 0.8, distMin: 46 })) {
        chao += arvore(p.x, p.y, 54 + rand() * 14, ['#2f6d36', '#438f44', '#7bc56a'])
      }
      return { chao, topo: '' }
    },
  },
  {
    id: 'floresta-densa',
    nome: 'Floresta densa',
    cor: '#3c6232',
    extra: 0,
    base: ['#4e7c3d', '#375d2f'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 16, e, { margem: 0.84, distMin: 34 })) {
        chao += pinheiro(p.x, p.y, 58 + rand() * 14, ['#1d4a2c', '#2a6137', '#3a7a46'])
      }
      return { chao, topo: '' }
    },
  },
  {
    id: 'colina',
    nome: 'Colinas',
    cor: '#98b95c',
    extra: 0,
    base: ['#aac96a', '#86a74f'],
    desenhar(rand, e) {
      let chao = ''
      const montes = espalhar(rand, 4, e, { margem: 0.7, distMin: 70 })
      for (const p of montes) {
        const w = 52 + rand() * 22
        const h = 34 + rand() * 14
        chao += sombra(p.x + 6, p.y + 6, w * 0.95, h * 0.28)
        chao += `<path d="M${n(p.x - w)} ${n(p.y)} Q${n(p.x)} ${n(p.y - h * 2)} ${n(p.x + w)} ${n(p.y)} Z" fill="#8cb352"/>`
        chao += `<path d="M${n(p.x - w * 0.8)} ${n(p.y - 4)} Q${n(p.x - w * 0.3)} ${n(p.y - h * 1.6)} ${n(p.x + w * 0.1)} ${n(p.y - h * 1.35)}" stroke="#c8e08f" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/>`
        chao += `<path d="M${n(p.x + w * 0.15)} ${n(p.y)} Q${n(p.x + w * 0.45)} ${n(p.y - h * 0.9)} ${n(p.x + w)} ${n(p.y)} Z" fill="#6f9540" opacity="0.7"/>`
      }
      return { chao, topo: '' }
    },
  },
  {
    id: 'montanha',
    nome: 'Montanhas',
    cor: '#8c8273',
    extra: 56,
    base: ['#a69b88', '#827868'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 7, e, { margem: 0.82, distMin: 34 })) chao += rocha(p.x, p.y, 16 + rand() * 12, '#8d8272')
      const cores = ['#a89d8a', '#7a7064', '#d8cfbe']
      const cy = e + R
      const topo = [
        pico(rand, 78 + rand() * 8, cy + 48, 96, 96 + rand() * 14, cores, false),
        pico(rand, 182 - rand() * 8, cy + 56, 92, 88 + rand() * 14, cores, false),
        pico(rand, 128 + (rand() - 0.5) * 12, cy + 30, 124, 148 + rand() * 12, cores, false),
      ].join('')
      return { chao, topo }
    },
  },
  {
    id: 'pico-nevado',
    nome: 'Picos nevados',
    cor: '#9aa6b0',
    extra: 84,
    base: ['#b4bdc6', '#8d98a3'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 12, e, { margem: 0.85, distMin: 26 })) {
        chao += `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${n(10 + rand() * 8)}" ry="${n(4 + rand() * 3)}" fill="#f3f7fa" opacity="0.8"/>`
      }
      const cores = ['#aab5c0', '#6f7a86', '#e8f0f6']
      const cy = e + R
      const topo = [
        pico(rand, 74 + rand() * 8, cy + 50, 100, 112 + rand() * 12, cores, true),
        pico(rand, 184 - rand() * 8, cy + 58, 96, 104 + rand() * 12, cores, true),
        pico(rand, 128 + (rand() - 0.5) * 10, cy + 34, 132, 184 + rand() * 12, cores, true),
      ].join('')
      return { chao, topo }
    },
  },
  {
    id: 'deserto',
    nome: 'Deserto',
    cor: '#dcc17c',
    extra: 0,
    base: ['#ecd698', '#d2b468'],
    desenhar(rand, e) {
      let chao = ''
      for (let i = 0; i < 6; i++) {
        const y = e + 46 + i * 38 + rand() * 12
        const x = -10 + rand() * 60
        chao += `<path d="M${n(x)} ${n(y)} q40 -28 80 0 t90 4 t60 -6" stroke="#bd9a4f" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>`
        chao += `<path d="M${n(x + 10)} ${n(y + 6)} q40 -28 80 0 t90 4 t60 -6" stroke="#f6e9bd" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.6"/>`
      }
      for (const p of espalhar(rand, 14, e, { margem: 0.9, distMin: 20 })) chao += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="1.8" fill="#b58f48" opacity="0.8"/>`
      return { chao, topo: '' }
    },
  },
  {
    id: 'pantano',
    nome: 'Pântano',
    cor: '#5f7143',
    extra: 0,
    base: ['#728450', '#55663b'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 5, e, { margem: 0.72, distMin: 52 })) {
        const rx = 24 + rand() * 18
        chao += `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${n(rx)}" ry="${n(rx * 0.45)}" fill="#46766f"/><ellipse cx="${n(p.x - 4)}" cy="${n(p.y - 2)}" rx="${n(rx * 0.6)}" ry="${n(rx * 0.22)}" fill="#6fa59b" opacity="0.7"/>`
      }
      for (const p of espalhar(rand, 11, e, { margem: 0.85, distMin: 28 })) {
        chao += `<g stroke="#3b4a27" stroke-width="2.2" stroke-linecap="round"><line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(p.x - 3)}" y2="${n(p.y - 18)}"/><line x1="${n(p.x + 5)}" y1="${n(p.y + 2)}" x2="${n(p.x + 7)}" y2="${n(p.y - 15)}"/></g><ellipse cx="${n(p.x - 3)}" cy="${n(p.y - 20)}" rx="2.4" ry="5" fill="#6b4a2c"/>`
      }
      return { chao, topo: '' }
    },
  },
  {
    id: 'agua-rasa',
    nome: 'Água rasa',
    cor: '#62c0cb',
    extra: 0,
    base: ['#86d6da', '#4eb0c0'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 13, e, { margem: 0.82, distMin: 38 })) chao += onda(p.x - 14, p.y, 28, '#ffffff', 0.6)
      for (const p of espalhar(rand, 6, e, { margem: 0.9, distMin: 40 })) chao += `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="14" ry="5" fill="#e6d8a4" opacity="0.45"/>`
      return { chao, topo: '' }
    },
  },
  {
    id: 'oceano',
    nome: 'Oceano',
    cor: '#2a5f98',
    extra: 0,
    base: ['#3a79b0', '#1d4a80'],
    desenhar(rand, e) {
      let chao = ''
      for (const p of espalhar(rand, 11, e, { margem: 0.86, distMin: 42 })) chao += onda(p.x - 18, p.y, 36, '#8fc3ea', 0.55)
      return { chao, topo: '' }
    },
  },
  {
    id: 'tundra',
    nome: 'Tundra',
    cor: '#cddae0',
    extra: 0,
    base: ['#e5edf0', '#bccdd6'],
    desenhar(rand, e) {
      let chao = ''
      for (let i = 0; i < 4; i++) {
        const p = espalhar(rand, 1, e, { margem: 0.75 })[0]
        if (p) chao += `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${n(36 + rand() * 20)}" ry="${n(14 + rand() * 8)}" fill="#f8fbfc" opacity="0.9"/>`
      }
      for (const p of espalhar(rand, 6, e, { margem: 0.8, distMin: 40 })) chao += rocha(p.x, p.y, 15 + rand() * 9, '#8f9ba3')
      for (const p of espalhar(rand, 8, e, { margem: 0.85, distMin: 26 })) chao += `<path d="M${n(p.x)} ${n(p.y)} l-2 -6 M${n(p.x)} ${n(p.y)} l2 -7" stroke="#7c9a86" stroke-width="2" stroke-linecap="round"/>`
      return { chao, topo: '' }
    },
  },
  {
    id: 'terra-arrasada',
    nome: 'Terra arrasada',
    cor: '#4d423d',
    extra: 0,
    base: ['#5f524b', '#3a312d'],
    desenhar(rand, e) {
      let chao = ''
      for (let i = 0; i < 6; i++) {
        let x = 30 + rand() * 196
        let y = e + 30 + rand() * 236
        let pts = `${n(x)},${n(y)}`
        for (let k = 0; k < 5; k++) {
          x += (rand() - 0.5) * 60
          y += (rand() - 0.2) * 40
          pts += ` ${n(x)},${n(y)}`
        }
        chao += `<polyline points="${pts}" stroke="#15100e" stroke-width="3" fill="none" stroke-linejoin="round"/><polyline points="${pts}" stroke="#e8742c" stroke-width="1.2" fill="none" stroke-linejoin="round" opacity="0.8"/>`
      }
      for (const p of espalhar(rand, 8, e, { margem: 0.85, distMin: 30 })) {
        chao += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="5" fill="#e8742c" opacity="0.25"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="1.8" fill="#ffb15c"/>`
      }
      for (const p of espalhar(rand, 5, e, { margem: 0.8, distMin: 42 })) chao += rocha(p.x, p.y, 14 + rand() * 8, '#2c2522')
      return { chao, topo: '' }
    },
  },
]

// ---------- montagem do SVG ----------

function montarSvg(terreno, variante) {
  const e = terreno.extra
  const rand = sorteio(TERRENOS.indexOf(terreno) * 1000 + variante * 7919 + 13)
  const { chao, topo } = terreno.desenhar(rand, e)
  const [c1, c2] = terreno.base
  const pontos = pontosHex(e)
  const altura = A + e
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${altura}" width="${L}" height="${altura}">
<defs>
<clipPath id="h"><polygon points="${pontos}"/></clipPath>
<linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
</defs>
<g clip-path="url(#h)"><rect x="0" y="${e}" width="${L}" height="${A}" fill="url(#g)"/>${chao}</g>
<polygon points="${pontos}" fill="none" stroke="#14120f" stroke-opacity="0.38" stroke-width="4" clip-path="url(#h)"/>
${topo}
</svg>
`
}

rmSync(saida, { recursive: true, force: true })
mkdirSync(saida, { recursive: true })

const manifesto = {
  id: 'padrao',
  nome: 'Padrão (gerado por script)',
  orientacao: 'pointy',
  largura: L,
  altura: A,
  terrenos: [],
}

for (const t of TERRENOS) {
  const arquivos = []
  for (let v = 1; v <= VARIANTES; v++) {
    const nome = `${t.id}-${v}.svg`
    writeFileSync(join(saida, nome), montarSvg(t, v - 1))
    arquivos.push(nome)
  }
  manifesto.terrenos.push({ id: t.id, nome: t.nome, cor: t.cor, extra: t.extra, arquivos })
}

writeFileSync(join(saida, 'tileset.json'), JSON.stringify(manifesto, null, 2) + '\n')
console.log(`Tileset gerado: ${TERRENOS.length} terrenos, ${TERRENOS.length * VARIANTES} imagens em ${saida}`)
