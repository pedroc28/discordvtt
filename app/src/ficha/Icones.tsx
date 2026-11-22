import type { ReactNode } from 'react'
import type { TipoCampo } from './tipos'

function Svg({ children, tamanho = 16 }: { children: ReactNode; tamanho?: number }) {
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
      {children}
    </svg>
  )
}

const desenhos: Record<TipoCampo, ReactNode> = {
  texto: (
    <>
      <path d="M2 12.5h12" />
      <path d="M3.5 9.5 5.5 4l2 5.5M4.2 7.8h2.6" />
    </>
  ),
  textoLongo: (
    <>
      <path d="M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h7" />
    </>
  ),
  numero: (
    <>
      <path d="M6.5 2.5 5 13.5M11 2.5 9.5 13.5M3 6h10.5M2.5 10h10.5" />
    </>
  ),
  recurso: (
    <>
      <rect x="1.5" y="5.5" width="13" height="5" rx="1" />
      <path d="M3 8h5.5" strokeWidth="2.6" />
    </>
  ),
  checkbox: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="m5 8.2 2 2 4-4.4" />
    </>
  ),
  marcadores: (
    <>
      <circle cx="3.5" cy="8" r="2" fill="currentColor" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="2" />
    </>
  ),
  lista: (
    <>
      <rect x="1.5" y="4" width="13" height="8" rx="1" />
      <path d="m9.5 7 1.5 1.6L12.5 7" />
    </>
  ),
  tabela: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M1.5 6h13M1.5 9.5h13M6 2.5v11" />
    </>
  ),
  imagem: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="m2 12 4-4.5 3 3 2-2 3 3" />
      <circle cx="11" cy="5.5" r="1" />
    </>
  ),
  titulo: (
    <>
      <path d="M3 3.5h10M8 3.5v9.5" />
    </>
  ),
  relogio: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 8V1.8A6.2 6.2 0 0 1 14.2 8Z" fill="currentColor" fillOpacity=".35" />
      <path d="M8 1.8V14.2M1.8 8h12.4" />
    </>
  ),
  moldura: (
    <>
      <path d="M5 3H2.5v10.5h11V3H11" />
      <path d="M6.5 3h3" strokeDasharray="0.1 1.6" />
    </>
  ),
}

export function IconeCampo({ tipo, tamanho }: { tipo: TipoCampo; tamanho?: number }) {
  return <Svg tamanho={tamanho}>{desenhos[tipo]}</Svg>
}

const extras = {
  desfazer: <path d="M5.5 4 2.5 7l3 3M3 7h6.5a4 4 0 0 1 0 8H8" transform="translate(0 -1.5)" />,
  refazer: <path d="M10.5 4l3 3-3 3M13 7H6.5a4 4 0 0 0 0 8H8" transform="translate(0 -1.5)" />,
  menos: <path d="M3.5 8h9" />,
  mais: <path d="M8 3.5v9M3.5 8h9" />,
  fechar: <path d="m4 4 8 8M12 4l-8 8" />,
  lixeira: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />,
  duplicar: (
    <>
      <rect x="5" y="5" width="8.5" height="8.5" rx="1" />
      <path d="M11 3H3.5a1 1 0 0 0-1 1v7" />
    </>
  ),
  frente: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="currentColor" fillOpacity=".25" />
      <path d="M10.5 2.5h-8v8" />
    </>
  ),
  tras: (
    <>
      <rect x="2.5" y="2.5" width="8" height="8" rx="1" />
      <path d="M13.5 6v7.5H6" />
    </>
  ),
  alinharEsquerda: <path d="M2.5 2v12M5 5h8M5 11h5" />,
  alinharCentroH: <path d="M8 2v12M4 5h8M5.5 11h5" />,
  alinharDireita: <path d="M13.5 2v12M3 5h8M6 11h5" />,
  alinharTopo: <path d="M2 2.5h12M5 5v8M11 5v5" />,
  alinharCentroV: <path d="M2 8h12M5 4v8M11 5.5v5" />,
  alinharBase: <path d="M2 13.5h12M5 3v8M11 6v5" />,
  distribuirH: <path d="M2.5 2v12M13.5 2v12M6.5 5v6M9.5 5v6" />,
  distribuirV: <path d="M2 2.5h12M2 13.5h12M5 6.5h6M5 9.5h6" />,
  larguraIgual: <path d="M2.5 8h11M4.5 6l-2 2 2 2M11.5 6l2 2-2 2" />,
  alturaIgual: <path d="M8 2.5v11M6 4.5l2-2 2 2M6 11.5l2 2 2-2" />,
  campos: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <path d="M11.5 9v5M9 11.5h5" />
    </>
  ),
  ajustes: <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7M10.5 3v3M5.5 10v3" />,
  menu: <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />,
  sol: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.05 1.05M11.55 11.55l1.05 1.05M3.4 12.6l1.05-1.05M11.55 4.45l1.05-1.05" />
    </>
  ),
  lua: <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />,
}

export type NomeIcone = keyof typeof extras

export function Icone({ nome, tamanho }: { nome: NomeIcone; tamanho?: number }) {
  return <Svg tamanho={tamanho}>{extras[nome]}</Svg>
}
