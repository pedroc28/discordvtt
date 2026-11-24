// Ícones do quadro, desenhados à mão no traço dos outros ícones do app (16 px, linha de 1,4).

const props = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Nota de papel com a ponta dobrada. */
export function IconeNota() {
  return (
    <svg {...props}>
      <path d="M3 2.5h10v7.5L10 13H3Z" />
      <path d="M13 10h-3v3M5.5 6h5M5.5 8.5h3" />
    </svg>
  )
}

/** Moldura com montanha e sol: a biblioteca de imagens. */
export function IconeImagens() {
  return (
    <svg {...props}>
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="m2.5 11.5 3.5-3.5 3 3 1.5-1.5 3 3" />
      <circle cx="10.5" cy="6" r="1" />
    </svg>
  )
}

/** Seta para cima saindo da bandeja: enviar. */
export function IconeEnviar() {
  return (
    <svg {...props}>
      <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v3h11v-3" />
    </svg>
  )
}

export function IconeMais() {
  return (
    <svg {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

export function IconeMenos() {
  return (
    <svg {...props}>
      <path d="M3.5 8h9" />
    </svg>
  )
}

/** Quatro cantos: ver o quadro todo. */
export function IconeVerTudo() {
  return (
    <svg {...props}>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </svg>
  )
}

export function IconeFechar() {
  return (
    <svg {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

/**
 * Tachinha vista de cima, em framboesa, com brilho. Fica no topo de cada item, no tamanho do quadro
 * (cresce e encolhe com o zoom).
 */
export function Tachinha() {
  return (
    <svg className="quadro__tachinha" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="13.5" cy="15" rx="7" ry="4.5" fill="rgb(40 20 10 / 0.28)" />
      <circle cx="12" cy="11" r="7.5" fill="#c4155a" />
      <circle cx="12" cy="11" r="7.5" fill="none" stroke="#7d0c37" strokeWidth="1.2" />
      <circle cx="9.5" cy="8.5" r="2.4" fill="rgb(255 255 255 / 0.55)" />
    </svg>
  )
}
