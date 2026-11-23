// Desenho de cada dado, à mão, no traço dos outros ícones do app. O d2 é uma moeda.

import type { Lados } from './tipos'

// Contorno de cada dado e as arestas da frente, separados: o dado grande pinta o contorno por dentro.
const DESENHOS: Record<Lados, { contorno: string; arestas: string }> = {
  // Moeda: borda e aro.
  2: { contorno: 'M5 16a11 11 0 1 0 22 0a11 11 0 1 0-22 0Z', arestas: 'M8.5 16a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0Z' },
  // Tetraedro: triângulo com o vértice da frente.
  4: { contorno: 'M16 4 28 26H4Z', arestas: 'M16 4v15M4 26l12-7 12 7' },
  // Cubo visto de quina.
  6: { contorno: 'M16 3 27 9.5v13L16 29 5 22.5v-13Z', arestas: 'M5 9.5 16 16l11-6.5M16 16v13' },
  // Octaedro: losango com a aresta do meio.
  8: { contorno: 'M16 3 27 16 16 29 5 16Z', arestas: 'M5 16h22M16 3l4 13-4 13' },
  // Dez faces: pipa com as arestas de cima.
  10: { contorno: 'M16 3 28 14.5 16 29 4 14.5Z', arestas: 'M4 14.5l12 5 12-5M16 3v16.5' },
  // Doze faces: pentágono por fora e por dentro.
  12: {
    contorno: 'M16 3 28.4 12 23.7 26.5H8.3L3.6 12Z',
    arestas: 'M16 9l6 4.4-2.3 7.1h-7.4L10 13.4ZM16 3v6M28.4 12 22 13.4M23.7 26.5l-4-6M8.3 26.5l4-6M3.6 12l6.4 1.4',
  },
  // Vinte faces: hexágono com o triângulo da frente.
  20: {
    contorno: 'M16 3 27 9.5v13L16 29 5 22.5v-13Z',
    arestas: 'M16 10l7 11H9ZM5 9.5 16 10l11-.5M27 9.5 23 21l4 1.5M23 21l-7 8M9 21l7 8M9 21l-4 1.5M5 9.5 9 21',
  },
}

/**
 * Um dado. Pequeno, é só o traço (botões). `cheio` separa o corpo e as arestas em duas classes,
 * para o dado grande ser pintado como um dado de verdade e o número ficar legível por cima.
 */
export function FormaDado({ lados, tamanho = 32, className, cheio = false }: { lados: Lados; tamanho?: number; className?: string; cheio?: boolean }) {
  const { contorno, arestas } = DESENHOS[lados]
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {cheio ? (
        <>
          <path className="dados__corpo" d={contorno} />
          <path className="dados__arestas" d={arestas} />
        </>
      ) : (
        <path d={`${contorno}${arestas}`} />
      )}
    </svg>
  )
}

/** Cadeado, para a rolagem secreta. */
export function IconeSegredo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}
