// O quadro de cortiça da campanha guardado no servidor: a implementação da RepositorioQuadro (contrato
// do quadro, app/src/quadro/repositorio.ts) que fala com o PocketBase.
//
// Como funciona (detalhes em docs/servidor/README.md, seção "Quadro"):
// - Cada mudança é um pedido simples: criar, mudar ou apagar um registro. O servidor confere quem
//   pode o quê e preenche autor e tamanho.
// - As mudanças de todos chegam pelo tempo real, inclusive as próprias. Quando a conexão volta depois
//   de cair, o repositório busca o quadro inteiro de novo e avisa com um evento "tudo".
// - As imagens são protegidas: o link direto não abre. O repositório baixa cada imagem uma vez, com o
//   token de arquivo, e entrega um endereço local (blob:) que vale até fechar.
//
// O repositório não usa o SDK do PocketBase direto: recebe um ClienteQuadro, que o conexao.ts cria
// para a sessão atual.

import type { InfoImagem, RepositorioQuadro } from '../quadro/repositorio'
import type { CorNota, EventoQuadro, ImagemQuadro, ItemQuadro, NovoItem, Posicao } from '../quadro/tipos'
import { mensagemDeErroQuadro, QUADRO_FECHADO, QUADRO_INVALIDO, type AcaoQuadro } from './erros'
import type { Cancelar, EventoTempoReal, FiltroServidor } from './repositorio-mapa'
import type { Papel } from './tipos'
import { normalizarImagemQuadroDoServidor, normalizarItemQuadroDoServidor } from './validacao'

export type ColecaoQuadro = 'quadro_imagens' | 'quadro_itens'

/** O que o repositório precisa do servidor. O conexao.ts implementa com o SDK, para a sessão atual. */
export interface ClienteQuadro {
  /** Endereço do servidor, para as mensagens de erro. */
  readonly endereco: string
  listar(colecao: ColecaoQuadro, filtro: FiltroServidor): Promise<unknown[]>
  criar(colecao: ColecaoQuadro, dados: Record<string, unknown> | FormData): Promise<unknown>
  atualizar(colecao: ColecaoQuadro, id: string, dados: Record<string, unknown>): Promise<unknown>
  apagar(colecao: ColecaoQuadro, id: string): Promise<void>
  /** Baixa o arquivo protegido de uma imagem, inteiro ou a miniatura de 320 px. */
  baixarImagem(id: string, arquivo: string, miniatura: boolean): Promise<Blob>
  assinar(colecao: ColecaoQuadro, filtro: FiltroServidor, ouvinte: (evento: EventoTempoReal) => void): Promise<Cancelar>
  aoReconectar(ouvinte: () => void): Promise<Cancelar>
}

/** Como transformar um arquivo baixado num endereço para o <img>. Trocável nos testes. */
export interface Enderecos {
  criar(arquivo: Blob): string
  liberar(endereco: string): void
}

const ENDERECOS_DO_NAVEGADOR: Enderecos = {
  criar: (arquivo) => URL.createObjectURL(arquivo),
  liberar: (endereco) => URL.revokeObjectURL(endereco),
}

export class RepositorioQuadroPocketBase implements RepositorioQuadro {
  readonly campanhaId: string
  readonly papel: Papel
  private cliente: ClienteQuadro
  private enderecos: Enderecos
  private ouvintes = new Set<(evento: EventoQuadro) => void>()
  private cancelamentos: Cancelar[] = []
  private inicio: Promise<void> | null = null
  private estaFechado = false
  // Uma promessa por imagem e tamanho: pedidos ao mesmo tempo esperam o mesmo download.
  private baixadas = new Map<string, Promise<string>>()

  constructor(cliente: ClienteQuadro, campanhaId: string, opcoes: { papel?: Papel; enderecos?: Enderecos } = {}) {
    this.cliente = cliente
    this.campanhaId = campanhaId
    this.papel = opcoes.papel ?? 'jogador'
    this.enderecos = opcoes.enderecos ?? ENDERECOS_DO_NAVEGADOR
  }

  get ehMestre(): boolean {
    return this.papel === 'mestre'
  }

  get fechado(): boolean {
    return this.estaFechado
  }

  private get filtro(): FiltroServidor {
    return { expressao: 'campanha = {:campanha}', valores: { campanha: this.campanhaId } }
  }

  /** Faz o pedido e traduz qualquer falha numa mensagem que diz o que fazer. */
  private async pedir<T>(acao: AcaoQuadro, pedido: () => Promise<T>): Promise<T> {
    if (this.estaFechado) throw new Error(QUADRO_FECHADO)
    try {
      const resposta = await pedido()
      if (this.estaFechado) throw new Error(QUADRO_FECHADO)
      return resposta
    } catch (erro) {
      throw new Error(this.estaFechado ? QUADRO_FECHADO : mensagemDeErroQuadro(erro, this.cliente.endereco, acao))
    }
  }

  private imagemOuErro(bruto: unknown): ImagemQuadro {
    const imagem = normalizarImagemQuadroDoServidor(bruto)
    if (!imagem) throw new Error(QUADRO_INVALIDO)
    return imagem
  }

  private itemOuErro(bruto: unknown): ItemQuadro {
    const item = normalizarItemQuadroDoServidor(bruto)
    if (!item) throw new Error(QUADRO_INVALIDO)
    return item
  }

  async carregar(): Promise<{ imagens: ImagemQuadro[]; itens: ItemQuadro[] }> {
    const [imagens, itens] = await this.pedir('carregar', () =>
      Promise.all([this.cliente.listar('quadro_imagens', this.filtro), this.cliente.listar('quadro_itens', this.filtro)]),
    )
    return {
      imagens: imagens.flatMap((bruto) => normalizarImagemQuadroDoServidor(bruto) ?? []),
      itens: itens.flatMap((bruto) => normalizarItemQuadroDoServidor(bruto) ?? []),
    }
  }

  assinar(ouvinte: (evento: EventoQuadro) => void): () => void {
    this.ouvintes.add(ouvinte)
    if (!this.inicio && !this.estaFechado) this.inicio = this.comecarTempoReal()
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  private avisar(evento: EventoQuadro) {
    if (this.estaFechado) return
    for (const ouvinte of [...this.ouvintes]) ouvinte(evento)
  }

  private guardarCancelamento(cancelar: Cancelar) {
    if (this.estaFechado) void cancelar().catch(() => undefined)
    else this.cancelamentos.push(cancelar)
  }

  private async comecarTempoReal() {
    try {
      this.guardarCancelamento(
        await this.cliente.assinar('quadro_imagens', this.filtro, (evento) => {
          const id = idDoRegistro(evento.registro)
          if (evento.acao === 'delete') {
            if (id) this.esquecerImagem(id)
            if (id) this.avisar({ tipo: 'imagemApagada', id })
            return
          }
          const imagem = normalizarImagemQuadroDoServidor(evento.registro)
          if (imagem) this.avisar({ tipo: 'imagem', imagem })
        }),
      )
      this.guardarCancelamento(
        await this.cliente.assinar('quadro_itens', this.filtro, (evento) => {
          const id = idDoRegistro(evento.registro)
          if (evento.acao === 'delete') {
            if (id) this.avisar({ tipo: 'itemApagado', id })
            return
          }
          const item = normalizarItemQuadroDoServidor(evento.registro)
          if (item) this.avisar({ tipo: 'item', item })
        }),
      )
      this.guardarCancelamento(await this.cliente.aoReconectar(() => void this.buscarDepoisDeCair()))
    } catch {
      // Sem tempo real, as próprias mudanças continuam aparecendo. As dos outros, ao reabrir a aba.
    }
  }

  /** A conexão caiu e voltou: o quadro inteiro de novo, para nada perdido no meio-tempo ficar faltando. */
  private async buscarDepoisDeCair() {
    try {
      const { imagens, itens } = await this.carregar()
      this.avisar({ tipo: 'tudo', imagens, itens })
    } catch {
      // Na próxima reconexão tenta de novo.
    }
  }

  // ---------- biblioteca ----------

  async enviarImagem(arquivo: Blob, info: InfoImagem): Promise<ImagemQuadro> {
    const formulario = new FormData()
    formulario.append('campanha', this.campanhaId)
    formulario.append('nome', info.nome.trim())
    formulario.append('largura', String(info.largura))
    formulario.append('altura', String(info.altura))
    formulario.append('arquivo', arquivo, info.nomeArquivo)
    const imagem = this.imagemOuErro(await this.pedir('enviar', () => this.cliente.criar('quadro_imagens', formulario)))
    this.avisar({ tipo: 'imagem', imagem })
    return imagem
  }

  async renomearImagem(id: string, nome: string): Promise<ImagemQuadro> {
    const imagem = this.imagemOuErro(await this.pedir('renomear', () => this.cliente.atualizar('quadro_imagens', id, { nome: nome.trim() })))
    this.avisar({ tipo: 'imagem', imagem })
    return imagem
  }

  async apagarImagem(id: string): Promise<void> {
    await this.pedir('apagar imagem', () => this.cliente.apagar('quadro_imagens', id))
    this.esquecerImagem(id)
    this.avisar({ tipo: 'imagemApagada', id })
  }

  urlDaImagem(imagem: ImagemQuadro, tamanho: 'miniatura' | 'inteira'): Promise<string> {
    const chave = `${imagem.id}:${imagem.arquivo}:${tamanho}`
    const pronta = this.baixadas.get(chave)
    if (pronta) return pronta
    const baixando = this.pedir('abrir', () => this.cliente.baixarImagem(imagem.id, imagem.arquivo, tamanho === 'miniatura')).then((arquivo) => {
      if (this.estaFechado) throw new Error(QUADRO_FECHADO)
      return this.enderecos.criar(arquivo)
    })
    this.baixadas.set(chave, baixando)
    // Falhou: esquece, para a próxima tentativa baixar de novo.
    baixando.catch(() => {
      if (this.baixadas.get(chave) === baixando) this.baixadas.delete(chave)
    })
    return baixando
  }

  /** Libera os endereços de uma imagem apagada. */
  private esquecerImagem(id: string) {
    for (const [chave, endereco] of this.baixadas) {
      if (!chave.startsWith(`${id}:`)) continue
      this.baixadas.delete(chave)
      void endereco.then((e) => this.enderecos.liberar(e)).catch(() => undefined)
    }
  }

  // ---------- itens ----------

  async criarItem(novo: NovoItem): Promise<ItemQuadro> {
    const comum = { campanha: this.campanhaId, x: novo.x, y: novo.y, largura: novo.largura, rotacao: novo.rotacao, z: novo.z }
    const dados = novo.tipo === 'imagem' ? { ...comum, tipo: 'imagem', imagem: novo.imagemId } : { ...comum, tipo: 'nota', texto: novo.texto, cor: novo.cor }
    const item = this.itemOuErro(await this.pedir('prender', () => this.cliente.criar('quadro_itens', dados)))
    this.avisar({ tipo: 'item', item })
    return item
  }

  async moverItem(id: string, posicao: Partial<Posicao>): Promise<ItemQuadro> {
    // Só os campos de posição: o resto, a regra recusaria.
    const dados: Record<string, number> = {}
    for (const campo of ['x', 'y', 'largura', 'rotacao', 'z'] as const) {
      const valor = posicao[campo]
      if (typeof valor === 'number' && Number.isFinite(valor)) dados[campo] = valor
    }
    const item = this.itemOuErro(await this.pedir('mover', () => this.cliente.atualizar('quadro_itens', id, dados)))
    this.avisar({ tipo: 'item', item })
    return item
  }

  async editarNota(id: string, mudanca: { texto?: string; cor?: CorNota }): Promise<ItemQuadro> {
    const dados: Record<string, string> = {}
    if (mudanca.texto !== undefined) dados.texto = mudanca.texto
    if (mudanca.cor !== undefined) dados.cor = mudanca.cor
    const item = this.itemOuErro(await this.pedir('editar', () => this.cliente.atualizar('quadro_itens', id, dados)))
    this.avisar({ tipo: 'item', item })
    return item
  }

  async tirarItem(id: string): Promise<void> {
    await this.pedir('tirar', () => this.cliente.apagar('quadro_itens', id))
    this.avisar({ tipo: 'itemApagado', id })
  }

  async fechar(): Promise<void> {
    if (this.estaFechado) return
    this.estaFechado = true
    this.ouvintes.clear()
    const baixadas = [...this.baixadas.values()]
    this.baixadas.clear()
    for (const endereco of baixadas) void endereco.then((e) => this.enderecos.liberar(e)).catch(() => undefined)
    await Promise.all(this.cancelamentos.splice(0).map((cancelar) => cancelar().catch(() => undefined)))
  }
}

function idDoRegistro(bruto: unknown): string {
  return typeof bruto === 'object' && bruto !== null && 'id' in bruto && typeof bruto.id === 'string' ? bruto.id : ''
}
