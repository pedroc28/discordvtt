// A viagem da campanha: regras do mundo e estoque do grupo que o mestre edita e todos leem.
// Só decide o que vai ao servidor e quando. Quem desenha é o PainelViagem e quem monta é o MapaHex.
//
// Da campanha: grupo, mundo, consumo, peso, carga e estoque (CAMPOS_DA_CAMPANHA).
// Ficam locais, de cada pessoa: ritmo, dias sem rota, os pontos da rota e "começar no token".

import { normalizarConfig, type ConfigViagem } from './viagem'
import type { RepositorioComViagem } from './repositorio'

export const CAMPOS_DA_CAMPANHA = [
  'viajantes',
  'montarias',
  'kmPorHex',
  'kmPorDia',
  'racaoPorPessoa',
  'aguaPorPessoa',
  'racaoPorMontaria',
  'aguaPorMontaria',
  'pesoRacao',
  'pesoAgua',
  'cargaPorViajante',
  'cargaPorMontaria',
  'estoqueRacoes',
  'estoqueAgua',
] as const satisfies readonly (keyof ConfigViagem)[]

export type CamposDaCampanha = Pick<ConfigViagem, (typeof CAMPOS_DA_CAMPANHA)[number]>

/** O que vai para o servidor: só os campos da campanha, todos números. */
export function paraServidor(config: ConfigViagem): CamposDaCampanha {
  const saida: Record<string, number> = {}
  for (const k of CAMPOS_DA_CAMPANHA) saida[k] = config[k]
  return saida as unknown as CamposDaCampanha
}

/** O que veio do servidor, validado e completo: campo que falta ou está ruim vira o padrão. */
export function daCampanha(bruto: unknown): CamposDaCampanha {
  return paraServidor(normalizarConfig(bruto))
}

/** Os valores da campanha por cima da configuração local, que mantém ritmo e dias sem rota. */
export function aplicarCampanha(local: ConfigViagem, campanha: CamposDaCampanha): ConfigViagem {
  return { ...local, ...campanha }
}

/** A configuração difere da campanha em algum campo da campanha? (Simulação de quem não é mestre.) */
export function difereDaCampanha(config: ConfigViagem, campanha: CamposDaCampanha): boolean {
  return CAMPOS_DA_CAMPANHA.some((k) => config[k] !== campanha[k])
}

export type EstadoDaGravacao = 'ocioso' | 'salvando' | 'salvo' | 'erro'

/**
 * Liga a configuração da campanha ao servidor. O mestre grava com espera (uma gravação depois da última
 * mudança, não uma por tecla); quem não é mestre só lê.
 */
export class ViagemDaCampanha {
  readonly podeGravar: boolean
  private espera: number
  private timer: ReturnType<typeof setTimeout> | undefined
  private proxima: CamposDaCampanha | null = null
  private gravando = false
  private cancelarAssinatura: (() => void) | null = null
  private ouvintesEstado = new Set<() => void>()
  private destruido = false
  /** O que o servidor tem, até onde este cliente sabe. */
  private conhecido: CamposDaCampanha | null = null
  estado: EstadoDaGravacao = 'ocioso'
  /** Mensagem da última gravação que falhou. */
  erro = ''
  /** Sobe a cada mudança de estado, para quem lê por useSyncExternalStore. */
  versao = 0

  private repo: RepositorioComViagem

  constructor(repo: RepositorioComViagem, podeGravar: boolean, espera = 700) {
    this.repo = repo
    this.podeGravar = podeGravar
    this.espera = espera
  }

  /** Lê a configuração da campanha. Null quando o mestre nunca gravou. */
  async carregar(): Promise<CamposDaCampanha | null> {
    const bruto = await this.repo.carregarViagem()
    if (bruto === null || bruto === undefined) return null
    this.conhecido = daCampanha(bruto)
    return this.conhecido
  }

  /** Recebe o que o mestre mudar. Enquanto este cliente tem gravação no ar, ignora (a dele vale). */
  ouvir(aoMudar: (campos: CamposDaCampanha) => void): void {
    this.cancelarAssinatura?.()
    this.cancelarAssinatura = this.repo.assinarViagem((bruto) => {
      if (this.destruido || this.pendente || bruto === null || bruto === undefined) return
      this.conhecido = daCampanha(bruto)
      aoMudar(this.conhecido)
    })
  }

  /** Há gravação esperando ou em andamento. */
  get pendente(): boolean {
    return this.proxima !== null || this.gravando
  }

  ouvirEstado(fn: () => void): () => void {
    this.ouvintesEstado.add(fn)
    return () => this.ouvintesEstado.delete(fn)
  }

  private mudarEstado(estado: EstadoDaGravacao, erro = '') {
    this.estado = estado
    this.erro = erro
    this.versao++
    for (const f of [...this.ouvintesEstado]) f()
  }

  /** Pede para gravar. Só o mestre grava; as mudanças seguidas viram uma gravação só. */
  gravar(config: ConfigViagem): void {
    if (!this.podeGravar || this.destruido) return
    const campos = paraServidor(config)
    // Mudou só o que é local (ritmo, dias sem rota), ou voltou ao que já estava salvo: nada a gravar.
    if (!this.pendente && this.conhecido && !difereDaCampanha(config, this.conhecido)) return
    this.proxima = campos
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.descarregar(), this.espera)
  }

  /** Grava já o que está esperando. */
  async descarregar(): Promise<void> {
    clearTimeout(this.timer)
    if (this.gravando || !this.proxima) return
    const campos = this.proxima
    this.proxima = null
    this.gravando = true
    this.mudarEstado('salvando')
    try {
      await this.repo.gravarViagem(campos)
      this.conhecido = campos
      this.gravando = false
      // Se o mestre mexeu de novo enquanto gravava, a próxima gravação já está agendada.
      if (!this.proxima) this.mudarEstado('salvo')
    } catch (e) {
      this.gravando = false
      // A edição fica na tela. A próxima mudança (ou "Tentar de novo") tenta outra vez.
      if (!this.proxima) this.proxima = campos
      this.mudarEstado('erro', e instanceof Error ? e.message : String(e))
    }
  }

  /** Tenta de novo depois de um erro. */
  tentarDeNovo(): void {
    void this.descarregar()
  }

  /** Ao sair: o que está esperando é gravado na hora, para não se perder. */
  destruir(): void {
    if (this.destruido) return
    void this.descarregar()
    this.destruido = true
    clearTimeout(this.timer)
    this.cancelarAssinatura?.()
    this.cancelarAssinatura = null
    this.ouvintesEstado.clear()
  }
}
