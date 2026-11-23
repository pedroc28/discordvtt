// Testa as regras de acesso do servidor num PocketBase temporário.
//
// Uso, na raiz do repositório: node pocketbase/testar-regras.mjs [caminho-do-pocketbase]
// Sem caminho, usa o pocketbase.exe (Windows) ou o pocketbase desta pasta.
//
// O teste cria pastas de dados temporárias com as migrações e os hooks do repositório e as
// apaga no fim. Ele nunca toca no pb_data de verdade. Não precisa de nenhuma dependência:
// só do Node.js 18 ou mais novo.
//
// São duas rodadas: a principal, com todas as regras, e outra que simula um servidor antigo
// recebendo a migração do mapa e testa a limpeza dos lotes e das rolagens.

import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pasta = dirname(fileURLToPath(import.meta.url))
const executavel = process.argv[2] ?? join(pasta, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase')
const versaoFixada = readFileSync(join(pasta, 'VERSAO'), 'utf8').trim()
const SENHA = 'senha-de-teste-123'
const ADMIN = { email: 'admin@teste.local', senha: 'senha-do-admin-123' }
// A primeira migração do mapa. A rodada da migração sobe o servidor sem ela e depois com ela.
const MIGRACAO_DO_MAPA = '1795321003'
// Casos de chunk conferidos também pelo teste do app (app/src/servidor/mapa-chunk.test.ts).
const CASOS_CHUNK = JSON.parse(readFileSync(join(pasta, '..', 'app', 'src', 'servidor', 'casos-chunk.json'), 'utf8'))

let base = ''
let pastaCopias = ''
const falhas = []
let total = 0

function confere(descricao, ok, detalhe) {
  total++
  if (ok) {
    console.log(`  ok    ${descricao}`)
  } else {
    falhas.push(descricao)
    console.log(`  FALHA ${descricao}${detalhe === undefined ? '' : `\n        ${JSON.stringify(detalhe)}`}`)
  }
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

function portaLivre() {
  return new Promise((resolver, rejeitar) => {
    const servidor = createServer()
    servidor.once('error', rejeitar)
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      servidor.close(() => resolver(port))
    })
  })
}

// `ip` simula um acesso vindo pelo Tailscale Funnel, que informa o IP de quem acessou no X-Forwarded-For.
async function api(metodo, caminho, { token, corpo, ip } = {}) {
  const cabecalhos = {}
  if (token) cabecalhos.Authorization = token
  if (ip) cabecalhos['X-Forwarded-For'] = ip
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const texto = await resposta.text()
  let dados = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  return { status: resposta.status, ok: resposta.ok, dados }
}

// O limite de tentativas do servidor aceita 2 logins a cada 3 segundos por IP,
// e o teste inteiro roda do mesmo IP. Por isso os logins são espaçados.
let ultimoLogin = 0
async function login(colecao, email, senha) {
  const espera = ultimoLogin + 1600 - Date.now()
  if (espera > 0) await esperar(espera)
  ultimoLogin = Date.now()
  const r = await api('POST', `/api/collections/${colecao}/auth-with-password`, {
    corpo: { identity: email, password: senha },
  })
  if (!r.ok) throw new Error(`Login de ${email} falhou: ${JSON.stringify(r.dados)}`)
  return r.dados.token
}

const registros = (colecao, filtro = '') =>
  `/api/collections/${colecao}/records?perPage=200${filtro ? `&filter=${encodeURIComponent(filtro)}` : ''}`

async function contarParticipacoes(admin, filtro) {
  const r = await api('GET', registros('participantes', filtro), { token: admin })
  return r.dados.totalItems
}

async function testar() {
  const admin = await login('_superusers', ADMIN.email, ADMIN.senha)

  console.log('\nContas')
  const semNome = await api('POST', '/api/collections/users/records', {
    token: admin,
    corpo: { email: 'sem-nome@teste.local', password: SENHA, passwordConfirm: SENHA },
  })
  confere('conta sem nome é recusada', !semNome.ok)

  const contas = {}
  for (const nome of ['Ana', 'Bruno', 'Carla', 'Davi']) {
    const email = `${nome.toLowerCase()}@teste.local`
    const r = await api('POST', '/api/collections/users/records', {
      token: admin,
      corpo: { email, password: SENHA, passwordConfirm: SENHA, name: nome },
    })
    if (!r.ok) throw new Error(`Não consegui criar a conta de ${nome}: ${JSON.stringify(r.dados)}`)
    contas[nome] = { id: r.dados.id, email }
  }
  const token = {}
  for (const nome of Object.keys(contas)) token[nome] = await login('users', contas[nome].email, SENHA)
  const { Ana, Bruno, Carla, Davi } = token

  const cadastro = await api('POST', '/api/collections/users/records', {
    corpo: { email: 'intruso@teste.local', password: SENHA, passwordConfirm: SENHA, name: 'Intruso' },
  })
  confere('visitante não cria conta (cadastro fechado)', !cadastro.ok, cadastro)

  const listaVisitante = await api('GET', registros('users'))
  confere('visitante não vê nenhuma conta', listaVisitante.ok && listaVisitante.dados.items.length === 0, listaVisitante.dados)

  const listaAna = await api('GET', registros('users'), { token: Ana })
  const brunoVisto = listaAna.dados.items.find((u) => u.id === contas.Bruno.id)
  confere('quem está logado vê o nome dos outros', brunoVisto?.name === 'Bruno', listaAna.dados)
  confere('quem está logado não vê o e-mail dos outros', brunoVisto !== undefined && !brunoVisto.email, brunoVisto)

  const renomeiaOutro = await api('PATCH', `/api/collections/users/records/${contas.Bruno.id}`, {
    token: Ana,
    corpo: { name: 'Bruno da Ana' },
  })
  confere('ninguém muda a conta de outra pessoa', !renomeiaOutro.ok, renomeiaOutro)

  const renomeiaPropria = await api('PATCH', `/api/collections/users/records/${contas.Ana.id}`, {
    token: Ana,
    corpo: { name: 'Ana Clara' },
  })
  confere('cada um muda o próprio nome', renomeiaPropria.ok && renomeiaPropria.dados.name === 'Ana Clara', renomeiaPropria)

  await api('PATCH', `/api/collections/users/records/${contas.Ana.id}`, { token: Ana, corpo: { verified: true } })
  const anaNoAdmin = await api('GET', `/api/collections/users/records/${contas.Ana.id}`, { token: admin })
  confere('ninguém se marca como verificado sozinho', anaNoAdmin.dados.verified === false, anaNoAdmin.dados)

  const apagaPropria = await api('DELETE', `/api/collections/users/records/${contas.Davi.id}`, { token: Davi })
  confere('ninguém apaga a própria conta pelo app', !apagaPropria.ok, apagaPropria)

  console.log('\nCriar campanha')
  const campanhaVisitante = await api('POST', '/api/collections/campanhas/records', { corpo: { nome: 'Sem dono' } })
  confere('visitante não cria campanha', !campanhaVisitante.ok, campanhaVisitante)

  const antesDoErro = await contarParticipacoes(admin, '')
  const semNomeCampanha = await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: '' } })
  confere('campanha sem nome é recusada', !semNomeCampanha.ok, semNomeCampanha)
  confere('campanha recusada não deixa participação solta', (await contarParticipacoes(admin, '')) === antesDoErro)

  const mesaAna = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa da Ana' } })).dados
  const mesaBruno = (await api('POST', '/api/collections/campanhas/records', { token: Bruno, corpo: { nome: 'Mesa do Bruno' } })).dados
  const segundaAna = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Segunda mesa' } })).dados
  confere('quem está logado cria campanha', Boolean(mesaAna?.id && mesaBruno?.id && segundaAna?.id))

  const participacoesAna = await api('GET', registros('participantes', `campanha = "${mesaAna.id}"`), { token: Ana })
  const anaMestre = participacoesAna.dados.items.find((p) => p.usuario === contas.Ana.id)
  confere('quem cria a campanha vira mestre dela', participacoesAna.dados.items.length === 1 && anaMestre?.papel === 'mestre', participacoesAna.dados)

  console.log('\nAdicionar pessoas')
  const brunoNaAna = await api('POST', '/api/collections/participantes/records', {
    token: Ana,
    corpo: { campanha: mesaAna.id, usuario: contas.Bruno.id, papel: 'jogador' },
  })
  confere('mestre adiciona jogador', brunoNaAna.ok, brunoNaAna)

  const repetido = await api('POST', '/api/collections/participantes/records', {
    token: Ana,
    corpo: { campanha: mesaAna.id, usuario: contas.Bruno.id, papel: 'mestre' },
  })
  confere('a mesma pessoa não entra duas vezes na campanha', !repetido.ok, repetido)

  // Bruno é mestre da própria mesa e jogador na da Ana. As regras precisam olhar o papel
  // dele na campanha certa, e não "é mestre em alguma campanha".
  const brunoAdicionaCarla = await api('POST', '/api/collections/participantes/records', {
    token: Bruno,
    corpo: { campanha: mesaAna.id, usuario: contas.Carla.id, papel: 'jogador' },
  })
  confere('jogador não adiciona ninguém, mesmo sendo mestre em outra campanha', !brunoAdicionaCarla.ok, brunoAdicionaCarla)

  const daviEntra = await api('POST', '/api/collections/participantes/records', {
    token: Davi,
    corpo: { campanha: mesaAna.id, usuario: contas.Davi.id, papel: 'jogador' },
  })
  confere('quem está fora não entra sozinho como jogador', !daviEntra.ok, daviEntra)

  const daviMestre = await api('POST', '/api/collections/participantes/records', {
    token: Davi,
    corpo: { campanha: mesaAna.id, usuario: contas.Davi.id, papel: 'mestre' },
  })
  confere('quem está fora não entra sozinho como mestre', !daviMestre.ok, daviMestre)

  console.log('\nVer campanhas')
  const vistaBruno = await api('GET', `/api/collections/campanhas/records/${mesaAna.id}`, { token: Bruno })
  confere('jogador vê a campanha', vistaBruno.ok, vistaBruno)
  const listaBruno = await api('GET', registros('participantes', `campanha = "${mesaAna.id}"`), { token: Bruno })
  confere('jogador vê quem participa', listaBruno.dados.items.length === 2, listaBruno.dados)

  const vistaDavi = await api('GET', `/api/collections/campanhas/records/${mesaAna.id}`, { token: Davi })
  confere('quem está fora não vê a campanha', !vistaDavi.ok, vistaDavi)
  const listaDavi = await api('GET', registros('campanhas'), { token: Davi })
  confere('quem está fora não vê campanha nenhuma na lista', listaDavi.dados.items.length === 0, listaDavi.dados)
  const participacoesDavi = await api('GET', registros('participantes'), { token: Davi })
  confere('quem está fora não vê participações', participacoesDavi.dados.items.length === 0, participacoesDavi.dados)
  const listaVisitanteCampanhas = await api('GET', registros('campanhas'))
  confere('visitante não vê campanha nenhuma', listaVisitanteCampanhas.dados.items.length === 0, listaVisitanteCampanhas.dados)

  const listaAnaCampanhas = await api('GET', registros('campanhas'), { token: Ana })
  confere('cada um vê só as próprias campanhas', listaAnaCampanhas.dados.items.length === 2, listaAnaCampanhas.dados)

  console.log('\nO que jogador não pode')
  const brunoRenomeia = await api('PATCH', `/api/collections/campanhas/records/${mesaAna.id}`, {
    token: Bruno,
    corpo: { nome: 'Mesa do Bruno agora' },
  })
  confere('jogador não renomeia a campanha', !brunoRenomeia.ok, brunoRenomeia)

  const brunoApaga = await api('DELETE', `/api/collections/campanhas/records/${mesaAna.id}`, { token: Bruno })
  confere('jogador não apaga a campanha', !brunoApaga.ok, brunoApaga)

  const brunoSePromove = await api('PATCH', `/api/collections/participantes/records/${brunoNaAna.dados.id}`, {
    token: Bruno,
    corpo: { papel: 'mestre' },
  })
  confere('jogador não se promove a mestre', !brunoSePromove.ok, brunoSePromove)

  const brunoTiraAna = await api('DELETE', `/api/collections/participantes/records/${anaMestre.id}`, { token: Bruno })
  confere('jogador não tira outra pessoa', !brunoTiraAna.ok, brunoTiraAna)

  console.log('\nO que mestre pode e não pode')
  const move = await api('PATCH', `/api/collections/participantes/records/${brunoNaAna.dados.id}`, {
    token: Ana,
    corpo: { campanha: segundaAna.id },
  })
  confere('mestre não muda a participação de campanha', !move.ok, move)

  const trocaPessoa = await api('PATCH', `/api/collections/participantes/records/${brunoNaAna.dados.id}`, {
    token: Ana,
    corpo: { usuario: contas.Carla.id },
  })
  confere('mestre não troca a pessoa de uma participação', !trocaPessoa.ok, trocaPessoa)

  const anaSeRebaixa = await api('PATCH', `/api/collections/participantes/records/${anaMestre.id}`, {
    token: Ana,
    corpo: { papel: 'jogador' },
  })
  confere('o último mestre não deixa de ser mestre', !anaSeRebaixa.ok, anaSeRebaixa)
  confere('a mensagem explica o que fazer', String(anaSeRebaixa.dados?.message).includes('pelo menos um mestre'), anaSeRebaixa.dados)

  const anaSai = await api('DELETE', `/api/collections/participantes/records/${anaMestre.id}`, { token: Ana })
  confere('o último mestre não sai da campanha', !anaSai.ok, anaSai)

  const promove = await api('PATCH', `/api/collections/participantes/records/${brunoNaAna.dados.id}`, {
    token: Ana,
    corpo: { papel: 'mestre' },
  })
  confere('mestre promove jogador a mestre', promove.ok && promove.dados.papel === 'mestre', promove)

  const brunoRenomeiaAgora = await api('PATCH', `/api/collections/campanhas/records/${mesaAna.id}`, {
    token: Bruno,
    corpo: { nome: 'Mesa da Ana e do Bruno' },
  })
  confere('o novo mestre renomeia a campanha', brunoRenomeiaAgora.ok, brunoRenomeiaAgora)

  const anaSaiAgora = await api('DELETE', `/api/collections/participantes/records/${anaMestre.id}`, { token: Ana })
  confere('mestre sai quando há outro mestre', anaSaiAgora.ok, anaSaiAgora)

  const anaNaoVe = await api('GET', `/api/collections/campanhas/records/${mesaAna.id}`, { token: Ana })
  confere('quem saiu não vê mais a campanha', !anaNaoVe.ok, anaNaoVe)

  const brunoSai = await api('DELETE', `/api/collections/participantes/records/${brunoNaAna.dados.id}`, { token: Bruno })
  confere('o último mestre continua sem poder sair', !brunoSai.ok, brunoSai)

  const carlaEntra = await api('POST', '/api/collections/participantes/records', {
    token: Bruno,
    corpo: { campanha: mesaAna.id, usuario: contas.Carla.id, papel: 'jogador' },
  })
  confere('o novo mestre adiciona jogadora', carlaEntra.ok, carlaEntra)

  const carlaSai = await api('DELETE', `/api/collections/participantes/records/${carlaEntra.dados.id}`, { token: Carla })
  confere('jogadora sai sozinha da campanha', carlaSai.ok, carlaSai)

  console.log('\nApagar campanha')
  const apaga = await api('DELETE', `/api/collections/campanhas/records/${mesaAna.id}`, { token: Bruno })
  confere('mestre apaga a campanha', apaga.ok, apaga)
  confere('apagar a campanha apaga as participações', (await contarParticipacoes(admin, `campanha = "${mesaAna.id}"`)) === 0)

  await testarMapa({ admin, contas, Ana, Bruno, Carla, mesaBruno })
  await testarDados({ admin, contas, Ana, Bruno, Carla, Davi })

  console.log('\nTrocar senha')
  const NOVA = 'nova-senha-123'
  const semAtual = await api('PATCH', `/api/collections/users/records/${contas.Davi.id}`, {
    token: Davi,
    corpo: { oldPassword: 'errada-123', password: NOVA, passwordConfirm: NOVA },
  })
  confere('sem a senha atual certa, ninguém troca a senha', !semAtual.ok, semAtual.status)

  const troca = await api('PATCH', `/api/collections/users/records/${contas.Davi.id}`, {
    token: Davi,
    corpo: { oldPassword: SENHA, password: NOVA, passwordConfirm: NOVA },
  })
  confere('cada um troca a própria senha informando a atual', troca.ok, troca)

  const sessaoAntiga = await api('GET', registros('users'), { token: Davi })
  confere('trocar a senha encerra as sessões antigas', !sessaoAntiga.ok || sessaoAntiga.dados.items.length === 0, sessaoAntiga.status)

  let novaSessao = ''
  try {
    novaSessao = await login('users', contas.Davi.email, NOVA)
  } catch {
    novaSessao = ''
  }
  confere('a senha nova funciona no login', Boolean(novaSessao))

  const trocaDeOutro = await api('PATCH', `/api/collections/users/records/${contas.Bruno.id}`, {
    token: novaSessao,
    corpo: { oldPassword: SENHA, password: 'invasao-1234', passwordConfirm: 'invasao-1234' },
  })
  confere('ninguém troca a senha de outra pessoa, mesmo sabendo a senha dela', !trocaDeOutro.ok, trocaDeOutro.status)

  console.log('\nLimite de tentativas')
  await esperar(3200)
  const tentativas = []
  for (let i = 0; i < 4; i++) {
    tentativas.push(
      (await api('POST', '/api/collections/users/auth-with-password', {
        corpo: { identity: contas.Ana.email, password: 'senha-errada' },
      })).status,
    )
  }
  confere('logins seguidos demais são barrados', tentativas.includes(429), tentativas)

  const outraPessoa = await api('POST', '/api/collections/users/auth-with-password', {
    corpo: { identity: contas.Ana.email, password: 'senha-errada' },
    ip: '198.51.100.4',
  })
  confere('o limite vale por pessoa, e não para o grupo todo atrás do Funnel', outraPessoa.status === 400, outraPessoa.status)

  console.log('\nServidor na internet')
  const config = await api('GET', '/api/settings', { token: admin })
  confere('administrador no próprio PC usa o painel', config.ok, config.dados)
  confere('o IP de quem acessa vem do X-Forwarded-For, pela direita', config.dados?.trustedProxy?.headers?.includes('X-Forwarded-For') && config.dados?.trustedProxy?.useLeftmostIP === false, config.dados?.trustedProxy)
  confere('backup automático a cada hora', config.dados?.backups?.cron === '0 * * * *', config.dados?.backups)

  const adminDeFora = await api('GET', '/api/settings', { token: admin, ip: '203.0.113.9' })
  confere('sessão de administrador não funciona vinda de fora do PC', !adminDeFora.ok, adminDeFora.status)

  const loginAdminDeFora = await api('POST', '/api/collections/_superusers/auth-with-password', {
    corpo: { identity: ADMIN.email, password: ADMIN.senha },
    ip: '203.0.113.9',
  })
  confere('login de administrador vindo de fora do PC é recusado', !loginAdminDeFora.ok, loginAdminDeFora.status)

  const backup = await api('POST', '/api/backups', { token: admin, corpo: { name: 'teste_copia.zip' } })
  confere('administrador cria backup', backup.ok, backup)
  let copiado = false
  for (let i = 0; i < 20 && !copiado; i++) {
    copiado = existsSync(join(pastaCopias, 'teste_copia.zip'))
    if (!copiado) await esperar(250)
  }
  confere('o backup é copiado para a pasta de fora', copiado)
}

// ---------- mapa ----------

const hexagono = (q, r, terreno = 'planicie', extra = {}) => ({
  q,
  r,
  terreno,
  regiaoId: null,
  nome: '',
  nota: '',
  marcadores: [],
  rios: [],
  estradas: [],
  rev: 1,
  ...extra,
})
const pintar = (q, r, terreno, extra) => ({ q, r, antes: null, depois: hexagono(q, r, terreno, extra) })
let lotesCriados = 0
const novoLote = (mapa, mudancas, regioes = [], extra = {}) => ({
  mapa,
  loteId: `lote-de-teste-${++lotesCriados}`,
  ts: Date.now(),
  mudancas,
  regioes,
  ...extra,
})
const gravarLote = (token, lote) => api('POST', '/api/collections/lotes/records', { token, corpo: lote })

async function mapaDa(token, campanha) {
  const r = await api('GET', registros('mapas', `campanha = "${campanha}"`), { token })
  return r.dados?.items ?? []
}

async function hexagonosDo(token, mapa) {
  const r = await api('GET', registros('hexagonos', `mapa = "${mapa}"`), { token })
  return r.dados?.items ?? []
}

async function contar(token, colecao, filtro) {
  const r = await api('GET', `/api/collections/${colecao}/records?perPage=1&filter=${encodeURIComponent(filtro)}`, { token })
  return r.dados?.totalItems ?? -1
}

/**
 * Abre o tempo real do PocketBase como o app faz (Server-Sent Events) e assina os tópicos.
 * Devolve a lista de eventos recebidos, que cresce sozinha, e a função que fecha a conexão.
 */
async function abrirTempoReal(token, topicos) {
  const controle = new AbortController()
  const resposta = await fetch(`${base}/api/realtime`, { signal: controle.signal })
  const leitor = resposta.body.getReader()
  const texto = new TextDecoder()
  const eventos = []
  let pendente = ''
  const lendo = (async () => {
    try {
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) return
        pendente += texto.decode(value, { stream: true })
        let fim
        while ((fim = pendente.indexOf('\n\n')) >= 0) {
          const evento = {}
          for (const linha of pendente.slice(0, fim).split('\n')) {
            const doisPontos = linha.indexOf(':')
            if (doisPontos > 0) evento[linha.slice(0, doisPontos)] = linha.slice(doisPontos + 1).trim()
          }
          pendente = pendente.slice(fim + 2)
          eventos.push(evento)
        }
      }
    } catch {
      // conexão fechada pelo teste
    }
  })()
  let conectado
  for (let i = 0; i < 40 && !conectado; i++) {
    conectado = eventos.find((e) => e.event === 'PB_CONNECT')
    if (!conectado) await esperar(50)
  }
  if (!conectado) throw new Error('O tempo real não conectou.')
  const { clientId } = JSON.parse(conectado.data)
  const inscricao = await api('POST', '/api/realtime', { token, corpo: { clientId, subscriptions: topicos } })
  if (!inscricao.ok) throw new Error(`Não consegui assinar o tempo real: ${JSON.stringify(inscricao.dados)}`)
  return {
    eventos,
    fechar: async () => {
      controle.abort()
      await lendo
    },
  }
}

async function testarCamadaMestre({ admin, contas, Ana, Bruno, Carla, mapa, tokenGrupo }) {
  console.log('\nCamada do mestre: quem vê')
  const ordemPublica = async () => (await api('GET', `/api/collections/mapas/records/${mapa.id}`, { token: Ana })).dados?.ultimaOrdem
  const lerMapa = async (token) => (await api('GET', `/api/collections/mapas/records/${mapa.id}`, { token })).dados
  confere('o mapa nasce com a trava aberta', (await lerMapa(Ana))?.permissao === 'todos', (await lerMapa(Ana))?.permissao)
  confere('o mestre lê a camada do mestre', (await contar(Ana, 'mapas_mestre', `mapa = "${mapa.id}"`)) === 1)

  const tempoRealAna = await abrirTempoReal(Ana, ['lotes_mestre/*'])
  const tempoRealBruno = await abrirTempoReal(Bruno, ['lotes_mestre/*'])

  const oculto = (q, r) => pintar(q, r, 'ruinas', { marcadores: [{ id: `m${q}`, tipo: 'masmorra', nome: 'Cripta' }] })
  const nota = (q, r, texto) => ({ q, r, antes: null, depois: { q, r, texto, rev: 1 } })
  const ordemAntes = await ordemPublica()
  const esconde = await gravarLote(Ana, novoLote(mapa.id, [], [], { privado: { ocultos: [oculto(60, 60), oculto(61, 61)], notas: [nota(60, 60, 'A cripta guarda o anel.')] } }))
  confere(
    'o mestre esconde hexágonos e escreve nota privada num lote só da camada dele',
    esconde.ok && esconde.dados?.collectionName === 'lotes_mestre' && esconde.dados?.ordem === 1,
    esconde.dados,
  )
  confere('esse lote não gasta número de ordem público', (await ordemPublica()) === ordemAntes)
  confere('nem aparece entre os lotes públicos', (await contar(Ana, 'lotes', `loteId = "${esconde.dados?.loteId}"`)) === 0)
  confere(
    'o mestre vê os ocultos e a nota',
    (await contar(Ana, 'hexagonos_ocultos', `mapa = "${mapa.id}"`)) === 2 && (await contar(Ana, 'notas_mestre', `mapa = "${mapa.id}"`)) === 1,
  )
  // Bruno é mestre na própria mesa: ele vê a camada do mestre de lá, mas nada da camada deste mapa.
  const vistoBruno = await Promise.all(['mapas_mestre', 'hexagonos_ocultos', 'notas_mestre', 'lotes_mestre'].map((c) => contar(Bruno, c, `mapa = "${mapa.id}"`)))
  confere('jogador não vê nada da camada do mestre, mesmo sendo mestre em outra campanha', vistoBruno.every((n) => n === 0), vistoBruno)
  const vistoFora = await Promise.all(['mapas_mestre', 'hexagonos_ocultos', 'notas_mestre', 'lotes_mestre'].map((c) => contar(Carla, c, '')))
  const vistoVisitante = await Promise.all(['mapas_mestre', 'hexagonos_ocultos', 'notas_mestre', 'lotes_mestre'].map((c) => contar(undefined, c, '')))
  confere('quem está fora e visitante também não', [...vistoFora, ...vistoVisitante].every((n) => n === 0), [vistoFora, vistoVisitante])
  const umOculto = (await api('GET', registros('hexagonos_ocultos', `mapa = "${mapa.id}"`), { token: Ana })).dados.items[0]
  const abreOculto = await api('GET', `/api/collections/hexagonos_ocultos/records/${umOculto.id}`, { token: Bruno })
  confere('jogador não abre um oculto nem pelo id', !abreOculto.ok, abreOculto.status)

  let avisou = false
  for (let i = 0; i < 40 && !avisou; i++) {
    avisou = tempoRealAna.eventos.some((e) => e.event === 'lotes_mestre/*' && e.data.includes(esconde.dados.loteId))
    if (!avisou) await esperar(50)
  }
  confere('o mestre recebe o lote da camada dele pelo tempo real', avisou)
  await esperar(300)
  confere('o jogador não recebe', !tempoRealBruno.eventos.some((e) => e.event === 'lotes_mestre/*'), tempoRealBruno.eventos)
  await tempoRealAna.fechar()
  await tempoRealBruno.fechar()

  console.log('\nCamada do mestre: escrever')
  const brunoEsconde = await gravarLote(Bruno, novoLote(mapa.id, [pintar(70, 70, 'floresta')], [], { privado: { ocultos: [oculto(71, 71)], notas: [] } }))
  confere('jogador não manda parte privada', !brunoEsconde.ok && String(brunoEsconde.dados?.message).includes('só o mestre'), brunoEsconde.dados)
  confere('e nada do lote dele entra', (await contar(admin, 'hexagonos', `mapa = "${mapa.id}" && q = 70`)) === 0)

  const brunoPinta = await gravarLote(Bruno, novoLote(mapa.id, [pintar(60, 60, 'campo')]))
  confere('jogador pinta onde há um oculto sem perceber nada', brunoPinta.ok, brunoPinta.dados)
  confere('e o oculto continua lá', (await contar(Ana, 'hexagonos_ocultos', `mapa = "${mapa.id}" && q = 60`)) === 1)

  const revelar = await gravarLote(
    Ana,
    novoLote(mapa.id, [pintar(61, 61, 'ruinas')], [], { privado: { ocultos: [{ q: 61, r: 61, antes: null, depois: null }], notas: [] } }),
  )
  const revelado = (await api('GET', registros('hexagonos', `mapa = "${mapa.id}" && q = 61 && r = 61`), { token: Bruno })).dados?.items?.[0]
  confere('revelar põe o hexágono no público e tira do oculto num lote só', revelar.ok && revelado?.dados?.terreno === 'ruinas' && (await contar(Ana, 'hexagonos_ocultos', `mapa = "${mapa.id}" && q = 61`)) === 0, revelar.dados)
  const publico = (await api('GET', registros('lotes', `loteId = "${revelar.dados?.loteId}"`), { token: Bruno })).dados?.items?.[0]
  confere('o lote público que o jogador lê não tem a parte privada', publico && !JSON.stringify(publico).includes('ocultos') && !('privado' in publico), publico)
  const parteDoMestre = (await api('GET', registros('lotes_mestre', `loteId = "${revelar.dados?.loteId}"`), { token: Ana })).dados?.items?.[0]
  confere('a parte privada fica no histórico do mestre, com o "antes" do servidor', parteDoMestre?.ocultos?.[0]?.antes?.terreno === 'ruinas', parteDoMestre)

  const ordens = { publica: await ordemPublica(), mestre: (await api('GET', registros('mapas_mestre', `mapa = "${mapa.id}"`), { token: Ana })).dados.items[0].ultimaOrdem }
  const misturadoErrado = await gravarLote(Ana, novoLote(mapa.id, [pintar(80, 80, 'floresta')], [], { privado: { ocultos: [], notas: [nota(80, 80, 'x'.repeat(20001))] } }))
  const ordensDepois = { publica: await ordemPublica(), mestre: (await api('GET', registros('mapas_mestre', `mapa = "${mapa.id}"`), { token: Ana })).dados.items[0].ultimaOrdem }
  confere(
    'lote com erro na parte privada é recusado inteiro, sem gastar número de nenhuma camada',
    !misturadoErrado.ok && (await contar(admin, 'hexagonos', `mapa = "${mapa.id}" && q = 80`)) === 0 && JSON.stringify(ordens) === JSON.stringify(ordensDepois),
    { status: misturadoErrado.status, ordens, ordensDepois },
  )

  const repetido = await gravarLote(Ana, { ...novoLote(mapa.id, [], [], { privado: { ocultos: [oculto(90, 90)], notas: [] } }), loteId: esconde.dados.loteId })
  confere('lote só privado repetido responde o que já estava gravado', repetido.ok && repetido.dados?.id === esconde.dados?.id, repetido.dados)

  console.log('\nCamada do mestre: importar e desfazer')
  const brunoImporta = await gravarLote(Bruno, novoLote(mapa.id, [pintar(100, 100, 'floresta')], [], { tipo: 'importacao' }))
  confere('jogador não importa', !brunoImporta.ok && String(brunoImporta.dados?.message).includes('só o mestre importa'), brunoImporta.dados)
  const anaImporta = await gravarLote(Ana, novoLote(mapa.id, [pintar(100, 100, 'floresta')], [], { tipo: 'importacao' }))
  confere('o mestre importa', anaImporta.ok && anaImporta.dados?.tipo === 'importacao', anaImporta.dados)

  const doBruno = await gravarLote(Bruno, novoLote(mapa.id, [pintar(101, 101, 'deserto')]))
  const desfazProprio = await gravarLote(Bruno, novoLote(mapa.id, [{ q: 101, r: 101, antes: null, depois: null }], [], { tipo: 'reversao', alvoId: doBruno.dados?.loteId }))
  confere('jogador desfaz a própria edição', desfazProprio.ok && desfazProprio.dados?.alvoId === doBruno.dados?.loteId, desfazProprio.dados)
  const desfazAna = await gravarLote(Bruno, novoLote(mapa.id, [{ q: 100, r: 100, antes: null, depois: null }], [], { tipo: 'reversao', alvoId: anaImporta.dados?.loteId }))
  confere('jogador não desfaz a edição de outra pessoa', !desfazAna.ok && String(desfazAna.dados?.message).includes('só o mestre desfaz'), desfazAna.dados)
  const anaDesfaz = await gravarLote(Ana, novoLote(mapa.id, [{ q: 101, r: 101, antes: null, depois: hexagono(101, 101, 'deserto') }], [], { tipo: 'reversao', alvoId: desfazProprio.dados?.loteId }))
  confere('o mestre desfaz a edição de qualquer um', anaDesfaz.ok, anaDesfaz.dados)
  const semAlvo = await gravarLote(Ana, novoLote(mapa.id, [pintar(102, 102, 'campo')], [], { tipo: 'reversao' }))
  confere('reversão sem dizer o que desfaz é recusada', !semAlvo.ok, semAlvo.dados)
  const alvoVelho = await gravarLote(Bruno, novoLote(mapa.id, [pintar(103, 103, 'campo')], [], { tipo: 'reversao', alvoId: 'lote-que-ja-saiu' }))
  confere('jogador não desfaz o que já saiu do histórico', !alvoVelho.ok && String(alvoVelho.dados?.message).includes('7 dias'), alvoVelho.dados)

  console.log('\nCamada do mestre: travar o mapa')
  const brunoTrava = await api('PATCH', `/api/collections/mapas/records/${mapa.id}`, { token: Bruno, corpo: { permissao: 'mestre' } })
  confere('jogador não trava o mapa', !brunoTrava.ok, brunoTrava.status)
  const anaContador = await api('PATCH', `/api/collections/mapas/records/${mapa.id}`, { token: Ana, corpo: { ultimaOrdem: 1 } })
  confere('nem o mestre mexe no contador de lotes', !anaContador.ok, anaContador.status)
  const anaTrava = await api('PATCH', `/api/collections/mapas/records/${mapa.id}`, { token: Ana, corpo: { permissao: 'mestre' } })
  confere('o mestre trava o mapa', anaTrava.ok && anaTrava.dados?.permissao === 'mestre', anaTrava.dados)
  const travado = await gravarLote(Bruno, novoLote(mapa.id, [pintar(110, 110, 'floresta')]))
  confere('com o mapa travado, jogador não edita', !travado.ok && String(travado.dados?.message).includes('só o mestre edita'), travado.dados)
  const mestreEdita = await gravarLote(Ana, novoLote(mapa.id, [pintar(110, 110, 'floresta')]))
  confere('e o mestre edita', mestreEdita.ok, mestreEdita.dados)
  const tokenTravado = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Bruno,
    corpo: { q: 7, r: 7, ts: Date.now() + 10000, presente: true },
  })
  confere('o jogador ainda move o token com o mapa travado', tokenTravado.ok && tokenTravado.dados?.q === 7, tokenTravado.dados)
  const destrava = await api('PATCH', `/api/collections/mapas/records/${mapa.id}`, { token: Ana, corpo: { permissao: 'todos' } })
  const brunoVolta = await gravarLote(Bruno, novoLote(mapa.id, [pintar(111, 111, 'floresta')]))
  confere('destravado, o jogador volta a editar', destrava.ok && brunoVolta.ok, brunoVolta.dados)
  void contas
}

async function testarMapa({ admin, contas, Ana, Bruno, Carla, mesaBruno }) {
  console.log('\nMapa: nasce com a campanha')
  const mesa = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa do mapa' } })).dados
  await api('POST', '/api/collections/participantes/records', {
    token: Ana,
    corpo: { campanha: mesa.id, usuario: contas.Bruno.id, papel: 'jogador' },
  })
  const mapas = await mapaDa(Ana, mesa.id)
  confere('cada campanha nasce com um mapa', mapas.length === 1 && mapas[0].ultimaOrdem === 0, mapas)
  const mapa = mapas[0]
  const tokens = await api('GET', registros('tokens_grupo', `mapa = "${mapa.id}"`), { token: Ana })
  const tokenGrupo = tokens.dados?.items?.[0]
  confere('e com o token do grupo, ainda fora do mapa', tokens.dados?.items?.length === 1 && tokenGrupo.presente === false, tokens.dados)

  const doPainel = (await api('POST', '/api/collections/campanhas/records', { token: admin, corpo: { nome: 'Feita no painel' } })).dados
  confere('campanha criada pelo painel também ganha mapa', (await mapaDa(admin, doPainel.id)).length === 1)
  await api('DELETE', `/api/collections/campanhas/records/${doPainel.id}`, { token: admin })

  const outroMapa = await api('POST', '/api/collections/mapas/records', { token: Ana, corpo: { campanha: mesa.id, nome: 'Outro' } })
  confere('ninguém cria mapa pelo app', !outroMapa.ok, outroMapa.status)
  const contador = await api('PATCH', `/api/collections/mapas/records/${mapa.id}`, { token: Ana, corpo: { ultimaOrdem: 50 } })
  confere('ninguém mexe no contador de lotes do mapa', !contador.ok, contador.status)
  const apagaMapa = await api('DELETE', `/api/collections/mapas/records/${mapa.id}`, { token: Ana })
  confere('ninguém apaga o mapa pelo app', !apagaMapa.ok, apagaMapa.status)

  console.log('\nMapa: lotes')
  const tempoRealBruno = await abrirTempoReal(Bruno, ['lotes/*'])
  const tempoRealCarla = await abrirTempoReal(Carla, ['lotes/*'])

  const primeiro = await gravarLote(
    Bruno,
    novoLote(mapa.id, [pintar(2, 3, 'floresta'), pintar(-1, -17, 'deserto')], [], { ordem: 99, autor: 'outra-pessoa' }),
  )
  confere('quem participa grava um lote, e ele recebe o número 1', primeiro.ok && primeiro.dados.ordem === 1, primeiro)
  confere('o autor é quem está logado, e não o que o app manda', primeiro.dados?.autor === contas.Bruno.id, primeiro.dados?.autor)
  const hexs = await hexagonosDo(Bruno, mapa.id)
  const floresta = hexs.find((h) => h.q === 2 && h.r === 3)
  confere('o servidor aplica o lote nos hexágonos', hexs.length === 2 && floresta?.dados?.terreno === 'floresta', hexs)

  let recebido = false
  for (let i = 0; i < 40 && !recebido; i++) {
    recebido = tempoRealBruno.eventos.some((e) => e.event === 'lotes/*' && e.data.includes(primeiro.dados.loteId))
    if (!recebido) await esperar(50)
  }
  confere('quem participa recebe o lote pelo tempo real', recebido)
  await esperar(300)
  confere('quem está fora não recebe o lote pelo tempo real', !tempoRealCarla.eventos.some((e) => e.event === 'lotes/*'), tempoRealCarla.eventos)
  await tempoRealBruno.fechar()
  await tempoRealCarla.fechar()

  const segundo = await gravarLote(Ana, novoLote(mapa.id, [{ q: 2, r: 3, antes: hexagono(2, 3, 'inventado'), depois: hexagono(2, 3, 'colina', { rev: 2 }) }]))
  confere('o número de ordem é do servidor e segue em frente', segundo.dados?.ordem === 2, segundo.dados?.ordem)
  confere('o "antes" gravado no lote é o que o servidor tinha', segundo.dados?.mudancas?.[0]?.antes?.terreno === 'floresta', segundo.dados?.mudancas)
  const mapaDepois = (await mapaDa(Bruno, mesa.id))[0]
  confere('o mapa guarda o número do último lote', mapaDepois?.ultimaOrdem === 2, mapaDepois)

  const casos = await gravarLote(Bruno, novoLote(mapa.id, CASOS_CHUNK.map((c) => pintar(c.q, c.r, 'campo', { chunk: 'inventado' }))))
  const porPosicao = new Map((await hexagonosDo(Bruno, mapa.id)).map((h) => [`${h.q},${h.r}`, h.chunk]))
  const errados = CASOS_CHUNK.filter((c) => porPosicao.get(`${c.q},${c.r}`) !== c.chunk)
  confere('o chunk calculado pelo servidor bate com o do mapa, inclusive com negativos', casos.ok && errados.length === 0, errados)

  const apagar = await gravarLote(Bruno, novoLote(mapa.id, [{ q: -1, r: -17, antes: null, depois: null }]))
  const semDeserto = (await hexagonosDo(Bruno, mapa.id)).every((h) => !(h.q === -1 && h.r === -17))
  confere('apagar um hexágono pelo lote tira o registro', apagar.ok && semDeserto, apagar.status)

  const regiao = { id: 'reino-1', nome: 'Reino', cor: '#aa3355', descricao: '', paiId: null, rev: 1 }
  const criaRegiao = await gravarLote(Ana, novoLote(mapa.id, [], [{ id: 'reino-1', antes: null, depois: regiao }]))
  const mudaRegiao = await gravarLote(Ana, novoLote(mapa.id, [], [{ id: 'reino-1', antes: regiao, depois: { ...regiao, nome: 'Reino Velho', rev: 2 } }]))
  const regioesAgora = await api('GET', registros('regioes', `mapa = "${mapa.id}"`), { token: Bruno })
  confere(
    'regiões entram e mudam pelo lote',
    criaRegiao.ok && mudaRegiao.ok && regioesAgora.dados?.items?.length === 1 && regioesAgora.dados.items[0].dados.nome === 'Reino Velho',
    regioesAgora.dados,
  )
  const tiraRegiao = await gravarLote(Ana, novoLote(mapa.id, [], [{ id: 'reino-1', antes: regiao, depois: null }]))
  confere('e saem pelo lote', tiraRegiao.ok && (await contar(Bruno, 'regioes', `mapa = "${mapa.id}"`)) === 0)

  const ordemAntes = (await mapaDa(Ana, mesa.id))[0].ultimaOrdem
  const original = novoLote(mapa.id, [pintar(7, 7, 'pantano')])
  const gravado = await gravarLote(Bruno, original)
  const repetido = await gravarLote(Bruno, { ...original, mudancas: [pintar(7, 7, 'geleira')] })
  const hex77 = (await hexagonosDo(Bruno, mapa.id)).find((h) => h.q === 7 && h.r === 7)
  confere(
    'lote repetido responde sucesso, com o lote que já estava gravado',
    repetido.ok && repetido.dados?.ordem === gravado.dados?.ordem && repetido.dados?.id === gravado.dados?.id,
    repetido,
  )
  confere(
    'e não é aplicado de novo',
    hex77?.dados?.terreno === 'pantano' && (await mapaDa(Ana, mesa.id))[0].ultimaOrdem === ordemAntes + 1,
    hex77?.dados,
  )

  console.log('\nMapa: lotes recusados')
  const ordemAntesDoErro = (await mapaDa(Ana, mesa.id))[0].ultimaOrdem
  const comErro = await gravarLote(Bruno, novoLote(mapa.id, [pintar(30, 30, 'floresta'), pintar(31, 30, '')]))
  const nadaAplicado = (await hexagonosDo(Bruno, mapa.id)).every((h) => h.q !== 30)
  confere('lote com um item errado é recusado inteiro', !comErro.ok && nadaAplicado, comErro.status)
  confere('a mensagem diz o que está errado', String(comErro.dados?.message).includes('(31, 30) não tem terreno'), comErro.dados)
  confere('lote recusado não gasta número de ordem', (await mapaDa(Ana, mesa.id))[0].ultimaOrdem === ordemAntesDoErro)

  const fora = await gravarLote(Bruno, novoLote(mapa.id, [{ q: 1, r: 1, antes: null, depois: hexagono(2, 1, 'floresta') }]))
  confere('hexágono que diz estar em outra posição é recusado', !fora.ok, fora.dados)
  const rios = await gravarLote(Bruno, novoLote(mapa.id, [pintar(1, 1, 'floresta', { rios: [5] })]))
  confere('rio numa direção que não existe é recusado', !rios.ok, rios.dados)
  const cor = await gravarLote(Bruno, novoLote(mapa.id, [], [{ id: 'r2', antes: null, depois: { ...regiao, id: 'r2', cor: 'vermelho' } }]))
  confere('região com cor inválida é recusada', !cor.ok, cor.dados)
  const vazio = await gravarLote(Bruno, novoLote(mapa.id, []))
  confere('lote vazio é recusado', !vazio.ok, vazio.dados)
  const apagarMuitos = (n) => Array.from({ length: n }, (_, i) => ({ q: i, r: 0, antes: null, depois: null }))
  const edicaoGrande = await gravarLote(Bruno, novoLote(mapa.id, apagarMuitos(2001)))
  confere('edição comum acima de 2.000 mudanças é recusada e aponta a importação', !edicaoGrande.ok && String(edicaoGrande.dados?.message).includes('importação'), edicaoGrande.dados)
  const importacaoDemais = await gravarLote(Ana, novoLote(mapa.id, apagarMuitos(20001), [], { tipo: 'importacao' }))
  confere('importação acima de 20.000 é recusada e pede para dividir', !importacaoDemais.ok && String(importacaoDemais.dados?.message).includes('Divida'), importacaoDemais.dados)
  const tipoInventado = await gravarLote(Bruno, novoLote(mapa.id, [pintar(1, 1, 'floresta')], [], { tipo: 'tudo-liberado' }))
  confere('tipo de lote que não existe é recusado', !tipoInventado.ok, tipoInventado.dados)

  const carlaGrava = await gravarLote(Carla, novoLote(mapa.id, [pintar(40, 40, 'floresta')]))
  confere('quem está fora não grava lote no mapa', !carlaGrava.ok && (await contar(admin, 'hexagonos', `mapa = "${mapa.id}" && q = 40`)) === 0, carlaGrava.status)
  const mapaDoBruno = (await mapaDa(Bruno, mesaBruno.id))[0]
  const anaNoBruno = await gravarLote(Ana, novoLote(mapaDoBruno.id, [pintar(0, 0, 'floresta')]))
  confere('mestre de uma campanha não grava no mapa de outra', !anaNoBruno.ok, anaNoBruno.status)
  const visitante = await gravarLote(undefined, novoLote(mapa.id, [pintar(41, 41, 'floresta')]))
  confere('visitante não grava lote', !visitante.ok, visitante.status)

  console.log('\nMapa: só o servidor grava hexágonos e regiões')
  const hexDireto = await api('POST', '/api/collections/hexagonos/records', {
    token: Ana,
    corpo: { mapa: mapa.id, q: 50, r: 50, chunk: '3,3', dados: hexagono(50, 50, 'floresta') },
  })
  confere('ninguém cria hexágono direto, nem o mestre', !hexDireto.ok, hexDireto.status)
  const umHex = (await hexagonosDo(Ana, mapa.id))[0]
  const mudaHex = await api('PATCH', `/api/collections/hexagonos/records/${umHex.id}`, { token: Ana, corpo: { dados: hexagono(umHex.q, umHex.r, 'lava') } })
  confere('ninguém altera hexágono direto', !mudaHex.ok, mudaHex.status)
  const apagaHex = await api('DELETE', `/api/collections/hexagonos/records/${umHex.id}`, { token: Ana })
  confere('ninguém apaga hexágono direto', !apagaHex.ok, apagaHex.status)
  const regiaoDireta = await api('POST', '/api/collections/regioes/records', { token: Ana, corpo: { mapa: mapa.id, regiaoId: 'x', dados: regiao } })
  confere('ninguém cria região direto', !regiaoDireta.ok, regiaoDireta.status)
  const mudaLote = await api('PATCH', `/api/collections/lotes/records/${primeiro.dados.id}`, { token: Ana, corpo: { autor: 'eu' } })
  const apagaLote = await api('DELETE', `/api/collections/lotes/records/${primeiro.dados.id}`, { token: Ana })
  confere('lote gravado não muda nem é apagado pelo app', !mudaLote.ok && !apagaLote.ok, [mudaLote.status, apagaLote.status])

  console.log('\nMapa: limpeza com o prazo padrão')
  const lotesAntes = await contar(admin, 'lotes', `mapa = "${mapa.id}"`)
  await api('POST', '/api/crons/limpar_lotes', { token: admin })
  await esperar(500)
  confere('com o prazo padrão, a limpeza não apaga lotes recentes', lotesAntes > 0 && (await contar(admin, 'lotes', `mapa = "${mapa.id}"`)) === lotesAntes, lotesAntes)

  console.log('\nMapa: quem vê')
  const visto = await Promise.all([
    contar(Bruno, 'mapas', `id = "${mapa.id}"`),
    contar(Bruno, 'hexagonos', `mapa = "${mapa.id}"`),
    contar(Bruno, 'lotes', `mapa = "${mapa.id}"`),
    contar(Bruno, 'tokens_grupo', `mapa = "${mapa.id}"`),
  ])
  confere('jogador vê o mapa, os hexágonos, os lotes e o token', visto.every((n) => n > 0), visto)
  const vistoCarla = await Promise.all([
    contar(Carla, 'mapas', ''),
    contar(Carla, 'hexagonos', ''),
    contar(Carla, 'regioes', ''),
    contar(Carla, 'lotes', ''),
    contar(Carla, 'tokens_grupo', ''),
  ])
  confere('quem está fora não vê nada do mapa', vistoCarla.every((n) => n === 0), vistoCarla)
  const vistoVisitante = await Promise.all(['mapas', 'hexagonos', 'regioes', 'lotes', 'tokens_grupo'].map((c) => contar(undefined, c, '')))
  confere('visitante não vê nada do mapa', vistoVisitante.every((n) => n === 0), vistoVisitante)
  const verMapa = await api('GET', `/api/collections/mapas/records/${mapa.id}`, { token: Carla })
  confere('quem está fora não abre o mapa pelo id', !verMapa.ok, verMapa.status)

  console.log('\nMapa: lotes ao mesmo tempo')
  const ordemInicial = (await mapaDa(Ana, mesa.id))[0].ultimaOrdem
  const simultaneos = await Promise.all(
    Array.from({ length: 20 }, (_, i) => gravarLote(i % 2 ? Ana : Bruno, novoLote(mapa.id, [pintar(9, -9, `terreno-${i}`)]))),
  )
  const ordens = simultaneos.map((r) => r.dados?.ordem).sort((a, b) => a - b)
  const esperadas = Array.from({ length: 20 }, (_, i) => ordemInicial + i + 1)
  confere('lotes ao mesmo tempo recebem números seguidos, sem repetir', simultaneos.every((r) => r.ok) && ordens.join() === esperadas.join(), ordens)
  const ultimo = simultaneos.find((r) => r.dados?.ordem === ordemInicial + 20)
  const hexFinal = (await hexagonosDo(Ana, mapa.id)).find((h) => h.q === 9 && h.r === -9)
  confere('o hexágono fica como o lote de maior número deixou', hexFinal?.dados?.terreno === ultimo?.dados?.mudancas?.[0]?.depois?.terreno, hexFinal?.dados)

  console.log('\nMapa: lote do tamanho de um mapa inteiro')
  const grande = []
  for (let q = -40; q < 40 && grande.length < 5000; q++) {
    for (let r = -40; r < 40 && grande.length < 5000; r++) {
      grande.push(pintar(q, r, 'planicie', { nome: `Hexágono ${q},${r}`, nota: 'Uma nota curta para pesar como num mapa de verdade.', marcadores: [{ id: `m${q}${r}`, tipo: 'cidade', nome: 'Vila' }] }))
    }
  }
  const jaExistiam = new Set((await hexagonosDo(admin, mapa.id)).map((h) => `${h.q},${h.r}`))
  const esperados = (await contar(admin, 'hexagonos', `mapa = "${mapa.id}"`)) + grande.filter((m) => !jaExistiam.has(`${m.q},${m.r}`)).length
  const loteGrande = novoLote(mapa.id, grande, [], { tipo: 'importacao' })
  const tamanho = Buffer.byteLength(JSON.stringify(loteGrande))
  const inicio = Date.now()
  const gravouGrande = await gravarLote(Ana, loteGrande)
  const duracao = Date.now() - inicio
  console.log(`  info  ${grande.length} hexágonos, ${(tamanho / 1024 / 1024).toFixed(1)} MB enviados, ${duracao} ms até a resposta`)
  confere('uma importação de 5000 hexágonos do mestre entra num lote só', gravouGrande.ok, gravouGrande.dados?.message ?? gravouGrande.status)
  const guardados = await contar(admin, 'hexagonos', `mapa = "${mapa.id}"`)
  confere('e o servidor guarda todos', guardados === esperados, { guardados, esperados })

  console.log('\nMapa: token do grupo')
  const agora = Date.now()
  const move = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Bruno,
    corpo: { q: 3, r: -2, ts: agora, presente: true, autor: 'outra-pessoa' },
  })
  confere('quem participa move o token', move.ok && move.dados.q === 3 && move.dados.r === -2 && move.dados.presente === true, move)
  confere('o autor do token é quem está logado', move.dados?.autor === contas.Bruno.id, move.dados?.autor)
  const atrasado = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Ana,
    corpo: { q: 8, r: 8, ts: agora - 5000, presente: true },
  })
  const tokenAgora = (await api('GET', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, { token: Ana })).dados
  confere('pedido atrasado não desfaz o token mais novo', atrasado.ok && tokenAgora.q === 3 && tokenAgora.r === -2, tokenAgora)
  const adiantado = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Ana,
    corpo: { q: 4, r: 4, ts: Date.now() + 24 * 60 * 60 * 1000, presente: true },
  })
  confere('relógio adiantado é trazido para a hora do servidor', adiantado.ok && adiantado.dados.ts <= Date.now() + 5000, adiantado.dados)
  const depoisDoAdiantado = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Bruno,
    corpo: { q: 5, r: 5, ts: Date.now() + 1000, presente: true },
  })
  confere('e não prende o token para os outros', depoisDoAdiantado.ok && depoisDoAdiantado.dados.q === 5, depoisDoAdiantado.dados)
  const tira = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Bruno,
    corpo: { presente: false, ts: Date.now() + 2000 },
  })
  confere('quem participa tira o token do mapa', tira.ok && tira.dados.presente === false, tira.dados)
  const trocaMapa = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Ana,
    corpo: { mapa: mapaDoBruno.id, ts: Date.now() + 3000 },
  })
  confere('o token não muda de mapa', !trocaMapa.ok, trocaMapa.status)
  const carlaMove = await api('PATCH', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, {
    token: Carla,
    corpo: { q: 1, r: 1, ts: Date.now() + 4000, presente: true },
  })
  confere('quem está fora não mexe no token', !carlaMove.ok, carlaMove.status)
  const outroToken = await api('POST', '/api/collections/tokens_grupo/records', { token: Ana, corpo: { mapa: mapa.id, q: 0, r: 0 } })
  const apagaToken = await api('DELETE', `/api/collections/tokens_grupo/records/${tokenGrupo.id}`, { token: Ana })
  confere('ninguém cria outro token nem apaga o do mapa', !outroToken.ok && !apagaToken.ok, [outroToken.status, apagaToken.status])

  await testarCamadaMestre({ admin, contas, Ana, Bruno, Carla, mapa, tokenGrupo })

  console.log('\nMapa: apagar a campanha')
  const hexagonosNoMapa = await contar(admin, 'hexagonos', `mapa = "${mapa.id}"`)
  const inicioApagar = Date.now()
  const apagou = await api('DELETE', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana })
  console.log(`  info  campanha com ${hexagonosNoMapa} hexágonos apagada em ${Date.now() - inicioApagar} ms`)
  const restos = await Promise.all(
    [['mapas', `id = "${mapa.id}"`], ['hexagonos', `mapa = "${mapa.id}"`], ['regioes', `mapa = "${mapa.id}"`], ['lotes', `mapa = "${mapa.id}"`], ['tokens_grupo', `mapa = "${mapa.id}"`], ['mapas_mestre', `mapa = "${mapa.id}"`], ['hexagonos_ocultos', `mapa = "${mapa.id}"`], ['notas_mestre', `mapa = "${mapa.id}"`], ['lotes_mestre', `mapa = "${mapa.id}"`]].map(
      ([colecao, filtro]) => contar(admin, colecao, filtro),
    ),
  )
  confere('apagar a campanha apaga o mapa e tudo o que é dele', apagou.ok && restos.every((n) => n === 0), restos)
}

// ---------- dados ----------

const LADOS = [2, 4, 6, 8, 10, 12, 20]

/**
 * Faz uma rolagem como o app faz: só a campanha e o dado. `extra` acrescenta campos ao pedido,
 * para testar o que o servidor recusa. Cada pessoa usa um IP próprio (como atrás do Funnel), para o
 * limite de pedidos de uma não atrapalhar os testes das outras.
 */
function rolar(token, campanha, lados, { secreta = false, extra = {}, ip } = {}) {
  const colecao = secreta ? 'rolagens_secretas' : 'rolagens'
  return api('POST', `/api/collections/${colecao}/records`, { token, ip, corpo: { campanha, lados, ...extra } })
}

const resultadoValido = (r, lados) => Number.isInteger(r?.resultado) && r.resultado >= 1 && r.resultado <= lados && r.lados === lados

async function esperarEvento(tempoReal, topico, trecho) {
  for (let i = 0; i < 40; i++) {
    if (tempoReal.eventos.some((e) => e.event === topico && e.data.includes(trecho))) return true
    await esperar(50)
  }
  return false
}

async function testarDados({ admin, contas, Ana, Bruno, Carla, Davi }) {
  console.log('\nDados: rolar')
  const mesa = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa dos dados' } })).dados
  for (const [nome, papel] of [['Bruno', 'jogador'], ['Davi', 'mestre']]) {
    await api('POST', '/api/collections/participantes/records', { token: Ana, corpo: { campanha: mesa.id, usuario: contas[nome].id, papel } })
  }
  const ip = { Ana: '198.51.100.21', Bruno: '198.51.100.22', Carla: '198.51.100.23', Davi: '198.51.100.24' }
  const tempoRealBruno = await abrirTempoReal(Bruno, ['rolagens/*', 'rolagens_secretas/*'])
  const tempoRealCarla = await abrirTempoReal(Carla, ['rolagens/*'])
  const tempoRealDavi = await abrirTempoReal(Davi, ['rolagens_secretas/*'])

  const d20 = await rolar(Bruno, mesa.id, 20, { ip: ip.Bruno })
  confere('quem participa rola um d20, e o servidor sorteia de 1 a 20', d20.ok && resultadoValido(d20.dados, 20), d20)
  confere('quem rolou é quem está logado', d20.dados?.autor === contas.Bruno.id, d20.dados?.autor)

  const escolheResultado = await rolar(Bruno, mesa.id, 20, { ip: ip.Bruno, extra: { resultado: 20 } })
  confere('ninguém escolhe o próprio resultado', !escolheResultado.ok, escolheResultado.status)
  const finge = await rolar(Bruno, mesa.id, 20, { ip: ip.Bruno, extra: { autor: contas.Ana.id } })
  confere('ninguém rola em nome de outra pessoa', !finge.ok, finge.status)
  const d7 = await rolar(Bruno, mesa.id, 7, { ip: ip.Bruno })
  confere('dado fora dos clássicos é recusado, com o motivo', !d7.ok && String(d7.dados?.message).startsWith('Rolagem recusada:'), d7.dados)
  const d100 = await rolar(Bruno, mesa.id, 100, { ip: ip.Bruno })
  confere('dado de 100 lados é recusado', !d100.ok, d100.status)
  const semDado = await api('POST', '/api/collections/rolagens/records', { token: Bruno, ip: ip.Bruno, corpo: { campanha: mesa.id } })
  confere('rolagem sem dado é recusada', !semDado.ok, semDado.status)

  const deFora = await rolar(Carla, mesa.id, 20, { ip: ip.Carla })
  confere('quem está fora não rola na campanha', !deFora.ok, deFora.status)
  const visitante = await rolar('', mesa.id, 20, { ip: '198.51.100.25' })
  confere('visitante não rola', !visitante.ok, visitante.status)
  const doPainel = await rolar(admin, mesa.id, 20)
  confere('o administrador do painel não rola: ele não participa de campanhas', !doPainel.ok, doPainel.dados)

  const todos = []
  for (const lados of LADOS) todos.push([lados, await rolar(Ana, mesa.id, lados, { ip: ip.Ana })])
  confere('cada dado clássico, do d2 ao d20, sorteia dentro dos próprios lados', todos.every(([lados, r]) => r.ok && resultadoValido(r.dados, lados)), todos.map(([l, r]) => [l, r.dados?.resultado ?? r.status]))

  // 16 rolagens de d2 saírem iguais tem chance de 1 em 32 mil: se só aparece uma face, o sorteio está preso.
  const faces = new Set()
  for (let i = 0; i < 16; i++) faces.add((await rolar(Davi, mesa.id, 2, { ip: ip.Davi })).dados?.resultado)
  confere('as duas faces do d2 aparecem', faces.has(1) && faces.has(2) && faces.size === 2, [...faces])

  const vistasBruno = await api('GET', registros('rolagens', `campanha = "${mesa.id}"`), { token: Bruno })
  confere('quem participa vê as rolagens de todos da campanha', vistasBruno.dados?.items?.length === 1 + LADOS.length + 16, vistasBruno.dados?.items?.length)
  const vistasCarla = await api('GET', registros('rolagens', `campanha = "${mesa.id}"`), { token: Carla })
  confere('quem está fora não vê as rolagens', vistasCarla.ok && vistasCarla.dados.items.length === 0, vistasCarla.dados)
  const vistaDireta = await api('GET', `/api/collections/rolagens/records/${d20.dados.id}`, { token: Carla })
  confere('nem pelo id', !vistaDireta.ok, vistaDireta.status)

  confere('quem participa recebe as rolagens pelo tempo real', await esperarEvento(tempoRealBruno, 'rolagens/*', todos[0][1].dados.id))
  await esperar(300)
  confere('quem está fora não recebe nada pelo tempo real', !tempoRealCarla.eventos.some((e) => e.event === 'rolagens/*'), tempoRealCarla.eventos)

  const muda = await api('PATCH', `/api/collections/rolagens/records/${d20.dados.id}`, { token: Bruno, ip: ip.Bruno, corpo: { resultado: 20 } })
  confere('ninguém muda uma rolagem feita', !muda.ok, muda.status)
  const mudaMestre = await api('PATCH', `/api/collections/rolagens/records/${d20.dados.id}`, { token: Ana, ip: ip.Ana, corpo: { resultado: 20 } })
  confere('nem o mestre', !mudaMestre.ok, mudaMestre.status)
  const apaga = await api('DELETE', `/api/collections/rolagens/records/${d20.dados.id}`, { token: Ana, ip: ip.Ana })
  confere('ninguém apaga uma rolagem pelo app', !apaga.ok, apaga.status)

  console.log('\nDados: rolagem secreta do mestre')
  const secreta = await rolar(Ana, mesa.id, 20, { secreta: true, ip: ip.Ana })
  confere('mestre rola em segredo', secreta.ok && resultadoValido(secreta.dados, 20) && secreta.dados.autor === contas.Ana.id, secreta)
  // Bruno é mestre da própria mesa e jogador nesta: a regra precisa olhar o papel nesta campanha.
  const jogadorSecreta = await rolar(Bruno, mesa.id, 20, { secreta: true, ip: ip.Bruno })
  confere('jogador não rola em segredo, mesmo sendo mestre em outra campanha', !jogadorSecreta.ok, jogadorSecreta.status)
  const secretaEscolhida = await rolar(Ana, mesa.id, 20, { secreta: true, ip: ip.Ana, extra: { resultado: 20 } })
  confere('nem o mestre escolhe o resultado em segredo', !secretaEscolhida.ok, secretaEscolhida.status)

  const secretasBruno = await api('GET', registros('rolagens_secretas', `campanha = "${mesa.id}"`), { token: Bruno })
  confere('jogador não vê as rolagens secretas', secretasBruno.ok && secretasBruno.dados.items.length === 0, secretasBruno.dados)
  const secretaDireta = await api('GET', `/api/collections/rolagens_secretas/records/${secreta.dados.id}`, { token: Bruno })
  confere('nem pelo id', !secretaDireta.ok, secretaDireta.status)
  const secretasDavi = await api('GET', registros('rolagens_secretas', `campanha = "${mesa.id}"`), { token: Davi })
  confere('os outros mestres da campanha veem as rolagens secretas', secretasDavi.dados?.items?.length === 1, secretasDavi.dados)
  const abertasSemSecreta = await api('GET', registros('rolagens', `id = "${secreta.dados.id}"`), { token: Bruno })
  confere('a rolagem secreta não aparece entre as abertas', abertasSemSecreta.dados?.items?.length === 0, abertasSemSecreta.dados)

  confere('os outros mestres recebem a rolagem secreta pelo tempo real', await esperarEvento(tempoRealDavi, 'rolagens_secretas/*', secreta.dados.id))
  await esperar(300)
  confere('jogador não recebe a rolagem secreta pelo tempo real', !tempoRealBruno.eventos.some((e) => e.event === 'rolagens_secretas/*'), tempoRealBruno.eventos.map((e) => e.event))
  await Promise.all([tempoRealBruno.fechar(), tempoRealCarla.fechar(), tempoRealDavi.fechar()])

  const mudaSecreta = await api('PATCH', `/api/collections/rolagens_secretas/records/${secreta.dados.id}`, { token: Ana, ip: ip.Ana, corpo: { resultado: 20 } })
  confere('ninguém muda uma rolagem secreta feita', !mudaSecreta.ok, mudaSecreta.status)

  console.log('\nDados: limite de pedidos')
  const seguidas = []
  for (let i = 0; i < 25; i++) seguidas.push((await rolar(Bruno, mesa.id, 6, { ip: '198.51.100.26' })).status)
  confere('rolagens seguidas demais são barradas (limite padrão de 20 a cada 5 segundos por pessoa)', seguidas.includes(429) && seguidas.slice(0, 20).every((s) => s === 200), seguidas)

  const apagou = await api('DELETE', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana })
  const restos = [await contar(admin, 'rolagens', `campanha = "${mesa.id}"`), await contar(admin, 'rolagens_secretas', `campanha = "${mesa.id}"`)]
  confere('apagar a campanha apaga as rolagens dela, abertas e secretas', apagou.ok && restos.every((n) => n === 0), restos)
}

/**
 * Rodada da migração e da limpeza: sobe um servidor como os de antes do mapa, com campanhas,
 * aplica a migração do mapa e confere que as campanhas antigas ganharam mapa. Depois testa a
 * limpeza dos lotes, com o prazo zerado só nesta rodada.
 */
async function testarMigracaoELimpeza(dados) {
  console.log('\nMapa: migração num servidor que já tinha campanhas')
  const antigas = join(dados, 'migracoes-antigas')
  const semHooks = join(dados, 'sem-hooks')
  mkdirSync(antigas)
  mkdirSync(semHooks)
  for (const arquivo of readdirSync(join(pasta, 'pb_migrations'))) {
    if (arquivo < MIGRACAO_DO_MAPA) copyFileSync(join(pasta, 'pb_migrations', arquivo), join(antigas, arquivo))
  }

  let servidor = await subirServidor(dados, { migracoes: antigas, hooks: semHooks })
  let admin = await login('_superusers', ADMIN.email, ADMIN.senha)
  const campanhas = []
  for (const nome of ['Mesa antiga', 'Outra mesa antiga']) {
    const r = await api('POST', '/api/collections/campanhas/records', { token: admin, corpo: { nome } })
    if (!r.ok) throw new Error(`Não consegui criar a campanha antiga: ${JSON.stringify(r.dados)}`)
    campanhas.push(r.dados.id)
  }
  await servidor.parar()

  servidor = await subirServidor(dados, { env: { DISCORDVTT_DIAS_LOTES: '0', DISCORDVTT_DIAS_ROLAGENS: '0' } })
  try {
    admin = await login('_superusers', ADMIN.email, ADMIN.senha)
    const mapas = []
    for (const campanha of campanhas) mapas.push(...(await mapaDa(admin, campanha)))
    confere('cada campanha que já existia ganha um mapa', mapas.length === campanhas.length, mapas)
    const tokens = await Promise.all(mapas.map((m) => contar(admin, 'tokens_grupo', `mapa = "${m.id}" && presente = false`)))
    confere('e o token do grupo dele', tokens.every((n) => n === 1), tokens)
    const camadas = await Promise.all(mapas.map((m) => contar(admin, 'mapas_mestre', `mapa = "${m.id}"`)))
    confere('e a camada do mestre, vazia', camadas.every((n) => n === 1), camadas)
    confere('e a trava aberta', mapas.every((m) => m.permissao === 'todos'), mapas.map((m) => m.permissao))

    console.log('\nMapa: limpeza dos lotes antigos')
    const mapa = mapas[0].id
    const lotes = [await gravarLote(admin, novoLote(mapa, [pintar(0, 0, 'floresta')])), await gravarLote(admin, novoLote(mapa, [pintar(-1, 0, 'deserto')]))]
    const privado = await gravarLote(admin, novoLote(mapa, [], [], { privado: { ocultos: [pintar(5, 5, 'ruinas')], notas: [] } }))
    confere('lotes gravados antes da limpeza', lotes.every((r) => r.ok) && lotes[1].dados.ordem === 2 && privado.ok, lotes.map((r) => r.status))
    const limpeza = await api('POST', '/api/crons/limpar_lotes', { token: admin })
    let restantes = -1
    for (let i = 0; i < 40 && restantes !== 0; i++) {
      await esperar(100)
      restantes = (await contar(admin, 'lotes', `mapa = "${mapa}"`)) + (await contar(admin, 'lotes_mestre', `mapa = "${mapa}"`))
    }
    confere('a limpeza apaga os lotes mais velhos que o prazo, inclusive os do mestre', limpeza.ok && restantes === 0, { status: limpeza.status, restantes })
    confere('e o mapa continua igual, porque o estado fica nos hexágonos', (await contar(admin, 'hexagonos', `mapa = "${mapa}"`)) === 2)
    const depois = await gravarLote(admin, novoLote(mapa, [pintar(1, 0, 'colina')]))
    confere('a numeração continua de onde parou, sem recomeçar', depois.dados?.ordem === 3, depois.dados?.ordem)

    console.log('\nDados: limpeza das rolagens antigas')
    const conta = await api('POST', '/api/collections/users/records', {
      token: admin,
      corpo: { email: 'mestra@teste.local', password: SENHA, passwordConfirm: SENHA, name: 'Mestra' },
    })
    if (!conta.ok) throw new Error(`Não consegui criar a conta da limpeza: ${JSON.stringify(conta.dados)}`)
    const mestra = await login('users', 'mestra@teste.local', SENHA)
    const mesa = (await api('POST', '/api/collections/campanhas/records', { token: mestra, corpo: { nome: 'Mesa da limpeza' } })).dados
    const rolagens = [await rolar(mestra, mesa.id, 20), await rolar(mestra, mesa.id, 6, { secreta: true })]
    confere('rolagens feitas antes da limpeza', rolagens.every((r) => r.ok), rolagens.map((r) => r.status))
    const limpezaRolagens = await api('POST', '/api/crons/limpar_rolagens', { token: admin })
    let sobraram = -1
    for (let i = 0; i < 40 && sobraram !== 0; i++) {
      await esperar(100)
      sobraram = (await contar(admin, 'rolagens', `campanha = "${mesa.id}"`)) + (await contar(admin, 'rolagens_secretas', `campanha = "${mesa.id}"`))
    }
    confere('a limpeza apaga as rolagens mais velhas que o prazo, inclusive as secretas', limpezaRolagens.ok && sobraram === 0, { status: limpezaRolagens.status, sobraram })
  } finally {
    await servidor.parar()
  }
}

/** Sobe um PocketBase com os dados da pasta indicada e espera ele responder. */
async function subirServidor(dados, { migracoes = join(pasta, 'pb_migrations'), hooks = join(pasta, 'pb_hooks'), env = {} } = {}) {
  const argumentos = [`--dir=${join(dados, 'pb_data')}`, `--migrationsDir=${migracoes}`, `--hooksDir=${hooks}`]
  execFileSync(executavel, ['superuser', 'upsert', ADMIN.email, ADMIN.senha, ...argumentos], { stdio: 'ignore' })

  const porta = await portaLivre()
  base = `http://127.0.0.1:${porta}`
  let log = ''
  const servidor = spawn(executavel, ['serve', `--http=127.0.0.1:${porta}`, '--hooksWatch=false', ...argumentos], {
    // Os prazos da limpeza ficam vazios (o padrão, 7 dias) a não ser que a rodada peça outro.
    env: { ...process.env, DISCORDVTT_DIAS_LOTES: '', DISCORDVTT_DIAS_ROLAGENS: '', ...env },
  })
  servidor.stdout.on('data', (parte) => (log += parte))
  servidor.stderr.on('data', (parte) => (log += parte))
  const terminou = new Promise((resolver) => servidor.once('exit', resolver))
  const parar = async () => {
    servidor.kill()
    await terminou
  }

  let pronto = false
  for (let i = 0; i < 60 && !pronto; i++) {
    await esperar(250)
    pronto = await fetch(`${base}/api/health`).then((r) => r.ok, () => false)
  }
  if (!pronto) {
    await parar()
    throw new Error(`O PocketBase não respondeu. Saída dele:\n${log}`)
  }
  return { parar }
}

async function main() {
  let versao = ''
  try {
    versao = execFileSync(executavel, ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    console.error(`Não achei o PocketBase em ${executavel}. Baixe a versão ${versaoFixada} (veja docs/servidor/README.md) ou passe o caminho do executável.`)
    process.exit(1)
  }
  if (!versao.endsWith(versaoFixada)) {
    console.warn(`Atenção: o projeto usa o PocketBase ${versaoFixada}, mas este é "${versao}". O resultado pode ser diferente.`)
  }

  const dados = mkdtempSync(join(tmpdir(), 'discordvtt-pb-'))
  const dadosMigracao = mkdtempSync(join(tmpdir(), 'discordvtt-pb-'))
  pastaCopias = join(dados, 'copias')

  let erro = null
  try {
    const servidor = await subirServidor(dados, { env: { DISCORDVTT_COPIA_BACKUP: pastaCopias } })
    try {
      console.log(`PocketBase ${versao.replace(/^pocketbase version /, '')} em ${base}, com dados temporários.`)
      await testar()
    } finally {
      await servidor.parar()
    }
    await testarMigracaoELimpeza(dadosMigracao)
  } catch (e) {
    erro = e
  } finally {
    rmSync(dados, { recursive: true, force: true })
    rmSync(dadosMigracao, { recursive: true, force: true })
  }

  if (erro) {
    console.error(`\nO teste parou antes do fim: ${erro.message}`)
    process.exit(1)
  }
  if (falhas.length > 0) {
    console.error(`\n${falhas.length} de ${total} verificações falharam.`)
    process.exit(1)
  }
  console.log(`\nTudo certo: ${total} verificações passaram.`)
}

main()
