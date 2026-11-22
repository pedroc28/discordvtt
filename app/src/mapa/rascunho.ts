// Hooks da interface do mapa.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ArmazemMapa } from './armazem'

const ESPERA_DIGITACAO = 700

/**
 * Campo de texto que só grava no mapa quando a pessoa para de digitar (ou sai do campo).
 * Enquanto digita, mostra o que está sendo digitado; fora disso, mostra o valor do mapa,
 * então mudanças de outros jogadores aparecem sozinhas. Ao desmontar, grava o que faltava.
 */
export function useRascunho(remoto: string, confirmar: (texto: string) => void) {
  const [editado, setEditado] = useState<string | null>(null)
  const pendente = useRef<string | null>(null)
  const timer = useRef(0)
  const confirmarRef = useRef(confirmar)
  useEffect(() => {
    confirmarRef.current = confirmar
  })

  const descarregar = useCallback(() => {
    window.clearTimeout(timer.current)
    const v = pendente.current
    pendente.current = null
    if (v !== null) confirmarRef.current(v)
    setEditado(null)
  }, [])

  useEffect(() => descarregar, [descarregar])

  const aoMudar = useCallback(
    (texto: string) => {
      setEditado(texto)
      pendente.current = texto
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(descarregar, ESPERA_DIGITACAO)
    },
    [descarregar],
  )

  return { valor: editado ?? remoto, aoMudar, aoDesfocar: descarregar }
}

/** Faz o componente redesenhar quando qualquer hexágono muda. */
export function useVersaoDoMapa(armazem: ArmazemMapa): number {
  return useSyncExternalStore(
    useCallback((cb: () => void) => armazem.ouvir(() => cb()), [armazem]),
    () => armazem.versao,
  )
}

/** Faz o componente redesenhar quando as regiões mudam. */
export function useVersaoDasRegioes(armazem: ArmazemMapa): number {
  return useSyncExternalStore(
    useCallback((cb: () => void) => armazem.ouvirRegioes(cb), [armazem]),
    () => armazem.versaoRegioes,
  )
}
