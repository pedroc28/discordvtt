// Estado da aba Quadro, fora do React: a biblioteca, os itens, as imagens já baixadas e os avisos.
// A tela só lê o estado (useSyncExternalStore) e chama as operações.
//
// O quadro cria o repositório ao abrir e o fecha ao fechar, e pode abrir de novo depois: o React, em
// desenvolvimento, monta, desmonta e monta de novo cada tela para achar efeitos mal feitos.

import { aplicarEvento, itemDeImagem, itemDeNota, limparTextoNota, ordenar, type DadosQuadro } from './operacoes'
import type { ImagemPreparada } from './preparar-imagem'
import type { RepositorioQuadro } from './repositorio'
import type { CorNota, EventoQuadro, ImagemQuadro, ItemQuadro, Posicao } from './tipos'

export interface EstadoQuadro extends DadosQuadro {
  carregando: boolean
  ehMestre: boolean
  /** Endereço da miniatura de cada imagem já baixada, pelo id da imagem. */
  miniaturas: Readonly<Record<string, string>>
  /** Endereço da imagem inteira, baixada ao abrir ou ao dar muito zoom. */
  inteiras: Readonly<Record<string, string>>
  /** Imagens sendo preparadas ou enviadas agora. */
  enviando: number
  /** Mensagem pronta para mostrar, dizendo o que aconteceu e o que fazer. */
  erro: string | null
}

export interface OpcoesQuadro {
  /** Prepara a imagem antes de enviar. Nos testes, uma de mentira. */
  preparar: (arquivo: File) => Promise<ImagemPreparada>
  aleatorio?: () => number
}

const ESTADO_INICIAL: EstadoQuadro = {
  carregando: true,
  ehMestre: false,
  imagens: [],
  itens: [],
  miniaturas: {},
  inteiras: {},
  enviando: 0,
  erro: null,
}

// Miniaturas baixadas ao mesmo tempo. Mais que isso só disputa a conexão do PC que hospeda.
const DOWNLOADS_SIMULTANEOS = 4

const mensagem = (erro: unknown) => (erro instanceof Error && erro.message ? erro.message : 'aconteceu um erro inesperado. Tente de novo.')

export class QuadroEstado {
  private criarRepositorio: () => RepositorioQuadro
  private repositorio: RepositorioQuadro | null = null
  private opcoes: Required<OpcoesQuadro>
  private atual: EstadoQuadro = ESTADO_INICIAL
  private ouvintes = new Set<() => void>()
  private pararDeOuvir: (() => void) | null = null
  // Sobe a cada abrir e fechar. Resposta de uma abertura antiga não muda mais nada.
  private sessao = 0
  // Imagens cuja miniatura ou imagem inteira já foi pedida, para não pedir de novo.
  private pedidas = new Set<string>()
  private fila: Array<() => Promise<void>> = []
  private baixando = 0

  constructor(criarRepositorio: () => RepositorioQuadro, opcoes: OpcoesQuadro) {
    this.criarRepositorio = criarRepositorio
    this.opcoes = { aleatorio: Math.random, ...opcoes }
  }

  get estado(): EstadoQuadro {
    return this.atual
  }

  assinar = (ouvinte: () => void) => {
    this.ouvintes.add(ouvinte)
    return () => {
      this.ouvintes.delete(ouvinte)
    }
  }

  private mudar(patch: Partial<EstadoQuadro>) {
    this.atual = { ...this.atual, ...patch }
    for (const ouvinte of [...this.ouvintes]) ouvinte()
  }

  private receber(evento: EventoQuadro) {
    this.mudar(aplicarEvento(this.atual, evento))
    if (evento.tipo === 'imagem') this.pedirMiniatura(evento.imagem)
    if (evento.tipo === 'tudo') for (const imagem of evento.imagens) this.pedirMiniatura(imagem)
  }

  private falhou(oQue: string, erro: unknown) {
    this.mudar({ erro: `Não consegui ${oQue}: ${mensagem(erro)}` })
  }

  /** Cria o repositório, começa a ouvir e busca o quadro. */
  async abrir() {
    if (this.repositorio) return
    const sessao = ++this.sessao
    let repositorio: RepositorioQuadro
    try {
      repositorio = this.criarRepositorio()
    } catch (erro) {
      this.mudar({ ...ESTADO_INICIAL, carregando: false })
      this.falhou('abrir o quadro', erro)
      return
    }
    this.repositorio = repositorio
    this.pedidas.clear()
    this.fila = []
    this.mudar({ ...ESTADO_INICIAL, ehMestre: repositorio.ehMestre })
    // Ouve antes de buscar, para nada cair no meio. O que chega repetido troca pelo mesmo id.
    this.pararDeOuvir = repositorio.assinar((evento) => {
      if (sessao === this.sessao) this.receber(evento)
    })
    try {
      const dados = await repositorio.carregar()
      if (sessao !== this.sessao) return
      // Junta com o que já chegou pelo tempo real enquanto carregava.
      let junto = ordenar(dados)
      for (const imagem of this.atual.imagens) junto = aplicarEvento(junto, { tipo: 'imagem', imagem })
      for (const item of this.atual.itens) junto = aplicarEvento(junto, { tipo: 'item', item })
      this.mudar({ ...junto, carregando: false })
      for (const imagem of junto.imagens) this.pedirMiniatura(imagem)
    } catch (erro) {
      if (sessao !== this.sessao) return
      this.mudar({ carregando: false })
      this.falhou('abrir o quadro', erro)
    }
  }

  /** Para de ouvir e fecha o repositório, que libera as imagens baixadas. */
  async fechar() {
    const repositorio = this.repositorio
    if (!repositorio) return
    this.sessao++
    this.repositorio = null
    this.pararDeOuvir?.()
    this.pararDeOuvir = null
    this.fila = []
    await repositorio.fechar()
  }

  limparErro() {
    if (this.atual.erro) this.mudar({ erro: null })
  }

  // ---------- imagens baixadas ----------

  /** Baixa poucas de cada vez, na ordem pedida. */
  private enfileirar(tarefa: () => Promise<void>) {
    this.fila.push(tarefa)
    void this.andarFila()
  }

  private async andarFila() {
    while (this.baixando < DOWNLOADS_SIMULTANEOS && this.fila.length) {
      const tarefa = this.fila.shift()
      if (!tarefa) break
      this.baixando++
      void tarefa().finally(() => {
        this.baixando--
        void this.andarFila()
      })
    }
  }

  private baixar(imagem: ImagemQuadro, tamanho: 'miniatura' | 'inteira') {
    const repositorio = this.repositorio
    const chave = `${imagem.id}:${tamanho}`
    if (!repositorio || this.pedidas.has(chave)) return
    this.pedidas.add(chave)
    const sessao = this.sessao
    this.enfileirar(async () => {
      try {
        const endereco = await repositorio.urlDaImagem(imagem, tamanho)
        if (sessao !== this.sessao) return
        if (tamanho === 'miniatura') this.mudar({ miniaturas: { ...this.atual.miniaturas, [imagem.id]: endereco } })
        else this.mudar({ inteiras: { ...this.atual.inteiras, [imagem.id]: endereco } })
      } catch {
        // Sem a imagem, o quadro mostra o nome no lugar. Pedir de novo tenta outra vez.
        this.pedidas.delete(chave)
      }
    })
  }

  pedirMiniatura(imagem: ImagemQuadro) {
    this.baixar(imagem, 'miniatura')
  }

  /** A imagem inteira, para abrir ou para um item grande com muito zoom. Função fixa, para a tela passar adiante. */
  pedirInteira = (imagemId: string) => {
    const imagem = this.atual.imagens.find((i) => i.id === imagemId)
    if (imagem) this.baixar(imagem, 'inteira')
  }

  // ---------- biblioteca ----------

  /** Prepara e envia cada arquivo e prende a imagem no quadro, a partir de `ponto`. */
  async enviar(arquivos: readonly File[], ponto: { x: number; y: number }) {
    const repositorio = this.repositorio
    if (!repositorio || !arquivos.length) return
    const sessao = this.sessao
    this.mudar({ enviando: this.atual.enviando + arquivos.length, erro: null })
    for (const [indice, arquivo] of arquivos.entries()) {
      try {
        const preparada = await this.opcoes.preparar(arquivo)
        if (sessao !== this.sessao) return
        const imagem = await repositorio.enviarImagem(preparada.arquivo, preparada)
        if (sessao !== this.sessao) return
        // Várias de uma vez entram em escada, para uma não esconder a outra.
        const deslocado = { x: ponto.x + indice * 40, y: ponto.y + indice * 40 }
        await repositorio.criarItem(itemDeImagem(imagem, deslocado, this.atual.itens, this.opcoes.aleatorio))
      } catch (erro) {
        if (sessao !== this.sessao) return
        this.falhou(`enviar "${arquivo.name}"`, erro)
      } finally {
        if (sessao === this.sessao) this.mudar({ enviando: Math.max(0, this.atual.enviando - 1) })
      }
    }
  }

  async renomear(imagemId: string, nome: string) {
    try {
      await this.repositorio?.renomearImagem(imagemId, nome)
    } catch (erro) {
      this.falhou('renomear a imagem', erro)
    }
  }

  async apagarImagem(imagemId: string) {
    try {
      await this.repositorio?.apagarImagem(imagemId)
    } catch (erro) {
      this.falhou('apagar a imagem', erro)
    }
  }

  // ---------- itens ----------

  async prender(imagemId: string, ponto: { x: number; y: number }) {
    const imagem = this.atual.imagens.find((i) => i.id === imagemId)
    if (!imagem) return
    try {
      await this.repositorio?.criarItem(itemDeImagem(imagem, ponto, this.atual.itens, this.opcoes.aleatorio))
    } catch (erro) {
      this.falhou('prender a imagem', erro)
    }
  }

  async criarNota(texto: string, cor: CorNota, ponto: { x: number; y: number }) {
    try {
      await this.repositorio?.criarItem(itemDeNota(texto, cor, ponto, this.atual.itens, this.opcoes.aleatorio))
    } catch (erro) {
      this.falhou('prender a nota', erro)
    }
  }

  /**
   * Move na hora, sem esperar o servidor, para o arraste não dar um pulo de volta. Se o servidor
   * recusar, o item volta para onde estava.
   */
  async mover(id: string, posicao: Partial<Posicao>) {
    const antes = this.atual.itens.find((i) => i.id === id)
    if (!antes || !this.repositorio) return
    const sessao = this.sessao
    this.mudar(aplicarEvento(this.atual, { tipo: 'item', item: { ...antes, ...posicao } as ItemQuadro }))
    try {
      await this.repositorio.moverItem(id, posicao)
    } catch (erro) {
      if (sessao !== this.sessao) return
      // Só desfaz se ninguém mexeu no item depois (o tempo real pode ter trazido outra posição).
      const agora = this.atual.itens.find((i) => i.id === id)
      if (agora && (Object.keys(posicao) as Array<keyof Posicao>).every((campo) => agora[campo] === posicao[campo])) {
        this.mudar(aplicarEvento(this.atual, { tipo: 'item', item: antes }))
      }
      this.falhou('mover o item', erro)
    }
  }

  async editarNota(id: string, mudanca: { texto?: string; cor?: CorNota }) {
    try {
      await this.repositorio?.editarNota(id, mudanca.texto === undefined ? mudanca : { ...mudanca, texto: limparTextoNota(mudanca.texto) })
    } catch (erro) {
      this.falhou('salvar a nota', erro)
    }
  }

  async tirar(id: string) {
    try {
      await this.repositorio?.tirarItem(id)
    } catch (erro) {
      this.falhou('tirar o item do quadro', erro)
    }
  }
}
