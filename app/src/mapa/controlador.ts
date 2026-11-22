// Junta armazém, repositório e histórico. É o único lugar que escreve no mapa.
//
// Fluxo de uma edição: o Traço aplica na hora no armazém (otimista), e ao terminar a
// pincelada o lote vai para o repositório. Lotes de outros clientes chegam por `receber`.
// O desfazer é seletivo: só reverte o que ainda está como o lote deixou (ver operacoes.ts).

import { ArmazemMapa } from './armazem'
import { chaveChunk, type Hex } from './hex'
import { fundirMudancas, mudancasApagar, mudancasPintar, reverterLote } from './operacoes'
import type { RepositorioMapa } from './repositorio'
import type { Lote, Mudanca } from './tipos'

const LIMITE_HISTORICO = 200
const LIMITE_ECOS = 300

export const novoIdLote = () => crypto.randomUUID()

/** Uma pincelada em andamento. Termina com `confirmar` (grava) ou `cancelar` (volta atrás). */
export class Traco {
  private mudancas: Mudanca[] = []
  private encerrado = false
  private ctrl: ControladorMapa

  constructor(ctrl: ControladorMapa) {
    this.ctrl = ctrl
  }

  pintar(hexes: readonly Hex[], terreno: string) {
    this.aplicar(mudancasPintar(this.ctrl.armazem, this.carregados(hexes), terreno))
  }

  apagar(hexes: readonly Hex[]) {
    this.aplicar(mudancasApagar(this.ctrl.armazem, this.carregados(hexes)))
  }

  get vazio() {
    return this.mudancas.length === 0
  }

  confirmar(): Lote | null {
    if (this.encerrado) return null
    this.encerrado = true
    const mudancas = fundirMudancas(this.mudancas)
    if (!mudancas.length) return null
    return this.ctrl.registrar(mudancas)
  }

  cancelar() {
    if (this.encerrado) return
    this.encerrado = true
    const inversas = fundirMudancas(this.mudancas).map((m) => ({ ...m, antes: m.depois, depois: m.antes }))
    this.ctrl.armazem.aplicarMudancas(inversas)
  }

  /** Só edita chunk já carregado, senão a edição se perderia quando o chunk chegar. */
  private carregados(hexes: readonly Hex[]) {
    return hexes.filter((h) => this.ctrl.armazem.temChunk(chaveChunk(h)))
  }

  private aplicar(mudancas: Mudanca[]) {
    if (this.encerrado || !mudancas.length) return
    this.ctrl.armazem.aplicarMudancas(mudancas)
    this.mudancas.push(...mudancas)
  }
}

export class ControladorMapa {
  readonly armazem = new ArmazemMapa()
  /** Chamado quando gravar falha (disco cheio, servidor fora). */
  aoErro: (mensagem: string) => void = () => {}

  private feitos: Lote[] = []
  private desfeitos: Lote[] = []
  private ecos = new Set<string>()
  private carregamentos = new Map<string, Promise<void>>()
  /** Lotes que chegaram enquanto o chunk ainda carregava. Entram assim que ele chegar. */
  private pendentes = new Map<string, Mudanca[]>()
  private ouvintesHistorico = new Set<() => void>()
  private cancelarAssinatura: () => void
  /** Sobe a cada mudança no histórico. Serve de "versão" para a interface. */
  versaoHistorico = 0

  readonly repo: RepositorioMapa
  readonly autor: string

  constructor(repo: RepositorioMapa, autor: string) {
    this.repo = repo
    this.autor = autor
    this.cancelarAssinatura = repo.assinar((lote) => this.receber(lote))
  }

  get podeDesfazer() {
    return this.feitos.length > 0
  }
  get podeRefazer() {
    return this.desfeitos.length > 0
  }

  ouvirHistorico(ouvinte: () => void): () => void {
    this.ouvintesHistorico.add(ouvinte)
    return () => this.ouvintesHistorico.delete(ouvinte)
  }

  /** Carrega o chunk se ainda não estiver. Pode ser chamado à vontade. */
  garantirChunk(chaveDoChunk: string): Promise<void> {
    if (this.armazem.temChunk(chaveDoChunk)) return Promise.resolve()
    let p = this.carregamentos.get(chaveDoChunk)
    if (!p) {
      this.pendentes.set(chaveDoChunk, [])
      p = this.repo
        .carregarChunk(chaveDoChunk)
        .then((hexagonos) => {
          this.armazem.definirChunk(chaveDoChunk, hexagonos)
          const atrasadas = this.pendentes.get(chaveDoChunk) ?? []
          if (atrasadas.length) this.armazem.aplicarMudancas(atrasadas)
        })
        .catch((e) => {
          // Sem isto o chunk seria pedido de novo a cada quadro. Fica vazio e o mapa segue
          // funcionando só na memória. (Com servidor, esta política precisa mudar: um chunk
          // vazio por falha de rede não pode ser gravado por cima do verdadeiro.)
          this.aoErro(`Não consegui carregar o mapa, o que você fizer aqui não será salvo: ${mensagemDe(e)}`)
          this.armazem.definirChunk(chaveDoChunk, [])
        })
        .finally(() => {
          this.pendentes.delete(chaveDoChunk)
          this.carregamentos.delete(chaveDoChunk)
        })
      this.carregamentos.set(chaveDoChunk, p)
    }
    return p
  }

  iniciarTraco(): Traco {
    return new Traco(this)
  }

  /** Desfaz o último lote seu. Retorna quantos hexágonos foram pulados por conflito. */
  desfazer(): number {
    return this.reverter('desfazer')
  }

  refazer(): number {
    return this.reverter('refazer')
  }

  /** Aplica, guarda no histórico e envia um lote próprio cujas mudanças já estão no armazém. */
  registrar(mudancas: Mudanca[]): Lote {
    const lote: Lote = { id: novoIdLote(), autor: this.autor, ts: Date.now(), mudancas }
    this.feitos.push(lote)
    if (this.feitos.length > LIMITE_HISTORICO) this.feitos.shift()
    this.desfeitos = []
    this.enviar(lote)
    this.mudouHistorico()
    return lote
  }

  /** Lote de outro cliente (ou eco do próprio, que é ignorado). */
  receber(lote: Lote) {
    if (this.ecos.delete(lote.id)) return
    const porChunk = new Map<string, Mudanca[]>()
    for (const m of lote.mudancas) {
      const ck = chaveChunk(m)
      const lista = porChunk.get(ck)
      if (lista) lista.push(m)
      else porChunk.set(ck, [m])
    }
    for (const [ck, mudancas] of porChunk) {
      const espera = this.pendentes.get(ck)
      if (espera) espera.push(...mudancas)
      else this.armazem.aplicarMudancas(mudancas)
    }
  }

  destruir() {
    this.cancelarAssinatura()
  }

  private reverter(sentido: 'desfazer' | 'refazer'): number {
    const origem = sentido === 'desfazer' ? this.feitos : this.desfeitos
    const destino = sentido === 'desfazer' ? this.desfeitos : this.feitos
    const original = origem.pop()
    if (!original) return 0
    const { lote, conflitos } = reverterLote(this.armazem, original, {
      id: novoIdLote(),
      autor: this.autor,
      ts: Date.now(),
    })
    if (lote) {
      this.armazem.aplicarMudancas(lote.mudancas)
      // Vai para a outra pilha o lote que acabou de ser aplicado: desfazê-lo é o oposto.
      // (As revisões mudam a cada aplicação, então não dá para guardar o original.)
      destino.push(lote)
      this.enviar(lote)
    }
    this.mudouHistorico()
    return conflitos
  }

  private enviar(lote: Lote) {
    this.ecos.add(lote.id)
    if (this.ecos.size > LIMITE_ECOS) this.ecos.delete(this.ecos.values().next().value as string)
    this.repo.aplicar(lote).catch((e) => this.aoErro(`Não consegui salvar: ${mensagemDe(e)}`))
  }

  private mudouHistorico() {
    this.versaoHistorico++
    for (const o of [...this.ouvintesHistorico]) o()
  }
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
