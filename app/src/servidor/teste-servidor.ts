// Ajudantes para testar o app contra um PocketBase de verdade: o do pocketbase/servidor-de-teste.mjs.
// Só testes importam este arquivo. Os testes com servidor rodam quando a variável DISCORDVTT_SERVIDOR_TESTE
// tem o endereço dele, e são pulados quando ela está vazia (como no npm test comum).
//
// Exemplo, para os testes de contrato do mapa:
//
//   describe.skipIf(!ENDERECO_DE_TESTE)('contrato com o servidor', () => {
//     beforeAll(() => instalarEventSource())
//     it('...', async () => {
//       const mestre = await entrarComoTeste('mestre')
//       const jogadora = await entrarComoTeste('jogadora')
//       await campanhaDeTeste(mestre, [jogadora])
//       const repositorio = mestre.abrirRepositorioMapa()
//     })
//   })

import { ConexaoServidor } from './conexao'
import contasDeTeste from './contas-de-teste.json'

export type ContaDeTeste = 'mestre' | 'jogadora' | 'jogador'

const enderecoBruto: unknown = import.meta.env.DISCORDVTT_SERVIDOR_TESTE

/** Endereço do servidor de teste. Vazio: os testes com servidor são pulados. */
export const ENDERECO_DE_TESTE = typeof enderecoBruto === 'string' ? enderecoBruto.trim() : ''

export function dadosDaConta(conta: ContaDeTeste) {
  const dados = contasDeTeste.contas.find((c) => c.id === conta)
  if (!dados) throw new Error(`A conta de teste "${conta}" não existe em contas-de-teste.json.`)
  return dados
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

/** Espera a condição valer, conferindo de pouco em pouco. Devolve se ela valeu antes do prazo. */
export async function esperarAte(condicao: () => boolean, prazo = 5000): Promise<boolean> {
  const inicio = Date.now()
  while (!condicao() && Date.now() - inicio < prazo) await esperar(25)
  return condicao()
}

// O servidor aceita 2 logins a cada 3 segundos por IP, e os testes rodam todos do mesmo IP.
let ultimoLogin = 0

/** Entra no servidor de teste com uma das contas de contas-de-teste.json. */
export async function entrarComoTeste(conta: ContaDeTeste): Promise<ConexaoServidor> {
  if (!ENDERECO_DE_TESTE) throw new Error('Falta o endereço do servidor de teste em DISCORDVTT_SERVIDOR_TESTE.')
  const espera = ultimoLogin + 1600 - Date.now()
  if (espera > 0) await esperar(espera)
  ultimoLogin = Date.now()
  const conexao = new ConexaoServidor()
  const { email, senha } = dadosDaConta(conta)
  await conexao.entrar(ENDERECO_DE_TESTE, email, senha)
  if (conexao.estado.fase !== 'conectado') throw new Error(`Não consegui entrar como ${conta}: ${conexao.estado.erro ?? 'sem resposta'}`)
  return conexao
}

/**
 * Cria uma campanha só para o teste, com quem entrou como mestre, põe os jogadores nela e deixa ela
 * aberta para todos. Cada teste com a própria campanha não depende do que outro teste gravou.
 */
export async function campanhaDeTeste(mestre: ConexaoServidor, jogadores: ConexaoServidor[], nome = `Teste ${Date.now()}`): Promise<string> {
  if (!(await mestre.criarCampanha(nome))) throw new Error(`Não consegui criar a campanha de teste: ${mestre.estado.erro}`)
  const id = mestre.estado.campanhaAtualId
  if (!id) throw new Error('A campanha de teste não ficou aberta.')
  for (const jogador of jogadores) {
    const usuario = jogador.estado.usuario
    if (!usuario || !(await mestre.adicionarParticipante(usuario.id, 'jogador'))) {
      throw new Error(`Não consegui pôr ${usuario?.nome ?? 'o jogador'} na campanha: ${mestre.estado.erro}`)
    }
  }
  for (const jogador of jogadores) {
    // O tempo real avisa da campanha nova. Se demorar, recarrega à mão.
    if (!(await esperarAte(() => jogador.estado.campanhas.some((c) => c.id === id), 2000))) await jogador.tentarDeNovo()
    jogador.escolherCampanha(id)
    if (!(await esperarAte(() => jogador.estado.campanhaAtualId === id))) throw new Error('O jogador não conseguiu abrir a campanha de teste.')
  }
  return id
}

/**
 * O SDK do PocketBase usa EventSource para o tempo real, e o Node só tem EventSource com uma opção
 * experimental. Este substituto mínimo, por fetch, faz o que o SDK usa: conectar, ouvir eventos com
 * nome, avisar erro e fechar. Só para testes: no navegador, vale o EventSource de verdade.
 */
export function instalarEventSource() {
  if (typeof globalThis.EventSource !== 'undefined') return
  globalThis.EventSource = EventSourcePorFetch as unknown as typeof EventSource
}

class EventSourcePorFetch {
  readyState = 0
  onerror: ((evento: Event) => void) | null = null
  readonly url: string
  private ouvintes = new Map<string, Set<EventListenerOrEventListenerObject>>()
  private controle = new AbortController()

  constructor(url: string | URL) {
    this.url = String(url)
    void this.conectar()
  }

  addEventListener(tipo: string, ouvinte: EventListenerOrEventListenerObject) {
    let lista = this.ouvintes.get(tipo)
    if (!lista) this.ouvintes.set(tipo, (lista = new Set()))
    lista.add(ouvinte)
  }

  removeEventListener(tipo: string, ouvinte: EventListenerOrEventListenerObject) {
    this.ouvintes.get(tipo)?.delete(ouvinte)
  }

  close() {
    this.readyState = 2
    this.controle.abort()
  }

  private disparar(tipo: string, evento: Event) {
    for (const ouvinte of [...(this.ouvintes.get(tipo) ?? [])]) {
      if (typeof ouvinte === 'function') ouvinte(evento)
      else ouvinte.handleEvent(evento)
    }
  }

  private async conectar() {
    try {
      const resposta = await fetch(this.url, { headers: { Accept: 'text/event-stream' }, signal: this.controle.signal })
      if (!resposta.ok || !resposta.body) throw new Error(`O tempo real respondeu ${resposta.status}.`)
      this.readyState = 1
      const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader()
      let pendente = ''
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) break
        pendente += value.replace(/\r\n?/g, '\n')
        let fim = pendente.indexOf('\n\n')
        while (fim >= 0) {
          this.interpretar(pendente.slice(0, fim))
          pendente = pendente.slice(fim + 2)
          fim = pendente.indexOf('\n\n')
        }
      }
      throw new Error('O servidor fechou o tempo real.')
    } catch {
      // Fechado pelo próprio close() não é erro. O resto o SDK trata: ele reconecta sozinho.
      if (this.readyState !== 2) {
        this.readyState = 2
        this.onerror?.(new Event('error'))
      }
    }
  }

  /** Um bloco do Server-Sent Events: linhas "id:", "event:" e "data:". */
  private interpretar(bloco: string) {
    let id = ''
    let tipo = 'message'
    const dados: string[] = []
    for (const linha of bloco.split('\n')) {
      const doisPontos = linha.indexOf(':')
      if (doisPontos <= 0) continue
      const campo = linha.slice(0, doisPontos)
      const valor = linha.slice(doisPontos + 1).replace(/^ /, '')
      if (campo === 'id') id = valor
      else if (campo === 'event') tipo = valor
      else if (campo === 'data') dados.push(valor)
    }
    if (dados.length) this.disparar(tipo, new MessageEvent(tipo, { data: dados.join('\n'), lastEventId: id }))
  }
}
