import type { ReactNode } from 'react'

export type NomeIcone =
  | 'navegar'
  | 'pincel'
  | 'borracha'
  | 'desfazer'
  | 'refazer'
  | 'grade'
  | 'centro'
  | 'mais'
  | 'menos'

const desenhos: Record<NomeIcone, ReactNode> = {
  navegar: <path d="M8 2v12M2 8h12M8 2 6.3 3.7M8 2l1.7 1.7M8 14l-1.7-1.7M8 14l1.7-1.7M2 8l1.7-1.7M2 8l1.7 1.7M14 8l-1.7-1.7M14 8l-1.7 1.7" />,
  pincel: <path d="M10.5 3 13 5.5 6 12.5 3 13l.5-3zM9 4.5 11.5 7" />,
  borracha: <path d="M6 13.5h7M3 9.5l5.5-5.5 4 4-4.5 4.5H5.5zM6.5 7l4 4" />,
  desfazer: <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h6a3.5 3.5 0 0 1 0 7H6" />,
  refazer: <path d="m10.5 3.5 3 3-3 3M13.5 6.5h-6a3.5 3.5 0 0 0 0 7H10" />,
  grade: <path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9zM8 8v6.2M8 8l5.4-3.1M8 8 2.6 4.9" />,
  centro: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
    </>
  ),
  mais: <path d="M3 8h10M8 3v10" />,
  menos: <path d="M3 8h10" />,
}

export function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {desenhos[nome]}
    </svg>
  )
}
