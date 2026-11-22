import type { ReactNode } from 'react'

export type NomeIcone =
  | 'navegar'
  | 'pincel'
  | 'borracha'
  | 'regiao'
  | 'marcador'
  | 'rio'
  | 'estrada'
  | 'token'
  | 'regua'
  | 'rota'
  | 'lateral'
  | 'baixar'
  | 'subir'
  | 'olho'
  | 'fechar'
  | 'lixeira'
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
  regiao: <path d="M2.5 5.5 6.5 2.5l5.5 1.5 2 4-2.5 4.5-5.5.5-3.5-3z" />,
  marcador: (
    <>
      <path d="M8 14.5S3.5 10.2 3.5 6.5a4.5 4.5 0 0 1 9 0C12.5 10.2 8 14.5 8 14.5z" />
      <circle cx="8" cy="6.5" r="1.6" />
    </>
  ),
  rio: <path d="M2 6c2-2.5 3.5 2.5 6 0s4 2.5 6 0M2 11c2-2.5 3.5 2.5 6 0s4 2.5 6 0" />,
  estrada: <path d="M5.2 14.5 6.6 1.5M10.8 14.5 9.4 1.5M8 3v1.8M8 7.1v1.8M8 11.2v1.8" />,
  token: (
    <>
      <circle cx="8" cy="4.6" r="2.2" />
      <path d="M5.6 13.5 6.9 8h2.2l1.3 5.5zM4.5 13.5h7" />
    </>
  ),
  regua: <path d="M2 10.5 10.5 2l3.5 3.5L5.5 14zM5 8.5l1.6 1.6M7.4 6.1 9 7.7M9.8 3.7l1.6 1.6" />,
  rota: (
    <>
      <circle cx="3.5" cy="12.5" r="1.6" />
      <circle cx="12.5" cy="3.5" r="1.6" />
      <path d="M5 11.8C8 10.5 5.5 7 8 6.2s3-1.2 3.2-1.4" strokeDasharray="1.6 1.6" />
    </>
  ),
  lateral: <path d="M2.5 3h11v10h-11zM10 3v10" />,
  baixar: <path d="M8 2.5v8M4.8 7.6 8 10.8l3.2-3.2M3 13h10" />,
  subir: <path d="M8 10.8v-8M4.8 5.7 8 2.5l3.2 3.2M3 13h10" />,
  olho: (
    <>
      <path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  fechar: <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />,
  lixeira: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />,
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
