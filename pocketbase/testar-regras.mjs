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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

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
let pastaHd = ''
let dadosDoServidor = ''
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
  // Formulário (envio de arquivo) vai como está: o fetch monta o cabeçalho multipart sozinho.
  const formulario = corpo instanceof FormData
  if (corpo !== undefined && !formulario) cabecalhos['Content-Type'] = 'application/json'
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
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
  await testarQuadro({ admin, contas, Ana, Bruno, Carla, Davi })
  await testarViagem({ admin, contas, Ana, Bruno, Carla, Davi })
  await testarBatalha({ admin, contas, Ana, Bruno, Carla, Davi })

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
  confere('o agendamento de backup do próprio PocketBase fica desligado (o do hook só copia quando algo mudou)', config.dados?.backups?.cron === '', config.dados?.backups)

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

  await testarBackup({ admin, Ana })
}

// ---------- backup ----------

/** Nome de backup automático com o carimbo em UTC, como os do PocketBase. */
function nomeAutomatico(ms) {
  return `@auto_pb_backup_teste_${new Date(ms).toISOString().replace(/\D/g, '').slice(0, 14)}.zip`
}

/** Uma hora do dia, no fuso deste PC, de k dias atrás. O servidor agrupa os backups pelo dia nesse mesmo fuso. */
function diaAtras(k, hora = 12) {
  const hoje = new Date()
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - k, hora).getTime()
}

const zipsEm = (dir) => readdirSync(dir).filter((n) => n.endsWith('.zip')).sort()

async function testarBackup({ admin, Ana }) {
  console.log('\nBackup')
  const crons = await api('GET', '/api/crons', { token: admin })
  const expressao = (id) => (Array.isArray(crons.dados) ? crons.dados.find((c) => c.id === id)?.expression : undefined)
  confere('backup a cada hora e cópia para o HD a cada 5 minutos, pelo hook', expressao('backup') === '0 * * * *' && expressao('copiar_hd') === '*/5 * * * *', crons.dados)

  const listar = async () => ((await api('GET', '/api/backups', { token: admin })).dados ?? []).map((b) => b.key).sort()
  const automaticos = async () => (await listar()).filter((k) => k.startsWith('@auto_'))
  // O job roda em segundo plano: espera a lista de backups automáticos mudar, ou o tempo acabar.
  const rodarBackup = async (espera = 3000) => {
    const antes = await automaticos()
    const pedido = await api('POST', '/api/crons/backup', { token: admin })
    let depois = antes
    for (let t = 0; t < espera && depois.join() === antes.join(); t += 100) {
      await esperar(100)
      depois = await automaticos()
    }
    return { ok: pedido.ok, novos: depois.filter((k) => !antes.includes(k)), depois }
  }
  const mudarAlgo = (nome) => api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome } })

  // Uma mudança antes: se o backup de cada hora rodou sozinho há pouco (o teste passou por uma hora cheia),
  // ainda há o que copiar.
  await mudarAlgo('Mesa do backup 0')
  const primeiro = await rodarBackup()
  confere('com mudanças desde o último, o backup automático sai', primeiro.ok && primeiro.novos.length === 1, primeiro)
  const parado = await rodarBackup(1500)
  confere('sem nenhuma mudança, a hora seguinte não faz outro backup', parado.ok && parado.novos.length === 0, parado)

  // Pasta da nuvem com cópias de 9 dias atrás, duas por dia, e um arquivo que não é backup.
  for (let k = 1; k <= 9; k++) {
    for (const hora of [12, 15]) writeFileSync(join(pastaCopias, nomeAutomatico(diaAtras(k, hora))), 'backup antigo')
  }
  writeFileSync(join(pastaCopias, 'leia-me.txt'), 'não é backup')

  await mudarAlgo('Mesa do backup 1')
  const mudou = await rodarBackup()
  confere('qualquer mudança faz a hora seguinte ter backup', mudou.ok && mudou.novos.length === 1, mudou)
  const esperadoNuvem = [mudou.novos[0], ...[1, 2, 3, 4, 5, 6].map((k) => nomeAutomatico(diaAtras(k, 15)))].sort()
  confere('na nuvem fica a cópia mais nova de cada dia, nos 7 dias mais recentes', zipsEm(pastaCopias).join() === esperadoNuvem.join(), zipsEm(pastaCopias))
  confere('o que não é backup na pasta da nuvem não é tocado', existsSync(join(pastaCopias, 'leia-me.txt')) && !readdirSync(pastaCopias).some((n) => n.endsWith('.parcial')))

  for (let i = 2; i <= 4; i++) {
    await mudarAlgo(`Mesa do backup ${i}`)
    await rodarBackup()
  }
  const finais = await automaticos()
  confere('no PC ficam só os automáticos mais novos', finais.length === 3 && finais.includes(mudou.novos[0]) === false, finais)
  confere('e os manuais ficam', (await listar()).includes('teste_copia.zip'))

  // HD desconectado: a pasta não existe e não é criada.
  await api('POST', '/api/crons/copiar_hd', { token: admin })
  await esperar(1000)
  confere('sem o HD, a cópia não cria a pasta', !existsSync(pastaHd))

  mkdirSync(pastaHd)
  const noHdAntes = []
  for (let k = 1; k <= 9; k++) for (const hora of [12, 15]) noHdAntes.push(nomeAutomatico(diaAtras(k, hora)))
  noHdAntes.push(nomeAutomatico(diaAtras(30, 12)), nomeAutomatico(diaAtras(30, 15)), nomeAutomatico(diaAtras(200, 12)))
  for (const nome of noHdAntes) writeFileSync(join(pastaHd, nome), 'backup antigo')
  writeFileSync(join(pastaHd, 'leia-me.txt'), 'não é backup')
  writeFileSync(join(pastaHd, 'velho.zip.parcial'), 'cópia interrompida')
  const duasHoras = new Date(Date.now() - 2 * 60 * 60 * 1000)
  utimesSync(join(pastaHd, 'velho.zip.parcial'), duasHoras, duasHoras)
  writeFileSync(join(pastaHd, 'novo.zip.parcial'), 'cópia em andamento')

  const noPc = (await listar()).filter((k) => k.endsWith('.zip'))
  await api('POST', '/api/crons/copiar_hd', { token: admin })
  for (let t = 0; t < 5000 && !noPc.every((n) => existsSync(join(pastaHd, n))); t += 100) await esperar(100)
  await esperar(300)
  const esperadoHd = [
    ...noPc,
    ...[1, 2, 3, 4, 5, 6].flatMap((k) => [nomeAutomatico(diaAtras(k, 12)), nomeAutomatico(diaAtras(k, 15))]),
    ...[7, 8, 9, 30].map((k) => nomeAutomatico(diaAtras(k, 15))),
  ].sort()
  confere('HD conectado: recebe o que está no PC, com o mesmo tamanho', noPc.every((n) => existsSync(join(pastaHd, n)) && statSync(join(pastaHd, n)).size === statSync(join(dadosDoServidor, 'backups', n)).size), noPc)
  confere('no HD fica tudo dos 7 dias mais recentes e, antes, o mais novo de cada dia por 6 meses', zipsEm(pastaHd).join() === esperadoHd.join(), { tem: zipsEm(pastaHd), esperado: esperadoHd })
  confere('o que não é backup no HD não é tocado', existsSync(join(pastaHd, 'leia-me.txt')))
  confere('resto de cópia interrompida sai, a cópia em andamento fica', !existsSync(join(pastaHd, 'velho.zip.parcial')) && existsSync(join(pastaHd, 'novo.zip.parcial')))

  const datas = () => zipsEm(pastaHd).map((n) => `${n}:${statSync(join(pastaHd, n)).mtimeMs}`).join()
  const antesDaSegunda = datas()
  await api('POST', '/api/crons/copiar_hd', { token: admin })
  await esperar(1500)
  confere('a rodada seguinte não copia de novo o que já está no HD', datas() === antesDaSegunda)
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

// ---------- viagem ----------

/** A configuração que o mapa grava hoje (app/src/mapa/viagem-campanha.ts): 14 números. */
const VIAGEM = {
  viajantes: 4,
  montarias: 2,
  kmPorHex: 10,
  kmPorDia: 30,
  racaoPorPessoa: 1,
  aguaPorPessoa: 2,
  racaoPorMontaria: 2,
  aguaPorMontaria: 8,
  pesoRacao: 1,
  pesoAgua: 1,
  cargaPorViajante: 25,
  cargaPorMontaria: 100,
  estoqueRacoes: 40,
  estoqueAgua: 60,
}

async function testarViagem({ admin, contas, Ana, Bruno, Carla, Davi }) {
  console.log('\nViagem da campanha')
  const mesa = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa da viagem' } })).dados
  for (const [nome, papel] of [['Bruno', 'jogador'], ['Davi', 'mestre']]) {
    await api('POST', '/api/collections/participantes/records', { token: Ana, corpo: { campanha: mesa.id, usuario: contas[nome].id, papel } })
  }
  const daMesa = registros('viagens', `campanha = "${mesa.id}"`)
  const vista = await api('GET', daMesa, { token: Bruno })
  const viagem = vista.dados?.items?.[0]
  confere('campanha nova nasce com a viagem, vazia, e quem participa lê', vista.dados?.items?.length === 1 && viagem?.config === null, vista.dados)
  const deFora = await api('GET', daMesa, { token: Carla })
  confere('quem está fora não lê a viagem', deFora.ok && deFora.dados.items.length === 0, deFora.dados)
  const tempoRealBruno = await abrirTempoReal(Bruno, ['viagens/*'])
  const tempoRealCarla = await abrirTempoReal(Carla, ['viagens/*'])

  const gravar = (token, corpo) => api('PATCH', `/api/collections/viagens/records/${viagem.id}`, { token, corpo })
  const doJogador = await gravar(Bruno, { config: VIAGEM })
  confere('jogador não grava a viagem', !doJogador.ok, doJogador.status)
  const doMestre = await gravar(Ana, { config: VIAGEM })
  confere('o mestre grava as regras e o estoque', doMestre.ok && doMestre.dados.config?.estoqueAgua === 60, doMestre.dados)
  const doOutroMestre = await gravar(Davi, { config: { ...VIAGEM, estoqueAgua: 55 } })
  const deNovo = await gravar(Ana, { config: { ...VIAGEM, estoqueAgua: 50.5 } })
  const final = (await api('GET', daMesa, { token: Bruno })).dados?.items?.[0]?.config
  confere('qualquer mestre da campanha grava, e vale a última gravação', doOutroMestre.ok && deNovo.ok && final?.estoqueAgua === 50.5, final)
  const campoNovo = await gravar(Ana, { config: { ...VIAGEM, kmPorHexEstrada: 15 } })
  confere('campo numérico novo é aceito, sem mudar o servidor', campoNovo.ok, campoNovo.status)

  const recusadas = {
    'número negativo': { ...VIAGEM, estoqueRacoes: -1 },
    'número acima de 100 mil': { ...VIAGEM, estoqueRacoes: 100001 },
    'texto no lugar de número': { ...VIAGEM, viajantes: '4' },
    'lista no lugar do objeto': [1, 2, 3],
    'número no lugar do objeto': 5,
    'nome de campo estranho': { ...VIAGEM, 'peso-extra': 1 },
    'mais de 32 campos': Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`campo${i}`, i])),
    'mais de 4 KB': { ...VIAGEM, nota: 'x'.repeat(5000) },
  }
  const resultados = {}
  for (const [caso, config] of Object.entries(recusadas)) resultados[caso] = (await gravar(Ana, { config })).status
  confere('configuração fora do formato é recusada', Object.values(resultados).every((status) => status >= 400), resultados)
  const motivo = await gravar(Ana, { config: { ...VIAGEM, estoqueRacoes: -1 } })
  confere('com o motivo', String(motivo.dados?.message).startsWith('Viagem recusada:'), motivo.dados)
  const zerada = await gravar(Ana, { config: null })
  confere('o mestre pode zerar a viagem, que volta aos valores padrão', zerada.ok && zerada.dados.config === null, zerada.dados)

  const daCarla = (await api('POST', '/api/collections/campanhas/records', { token: Carla, corpo: { nome: 'Mesa da Carla, viagem' } })).dados
  const mudaCampanha = await gravar(Ana, { campanha: daCarla.id })
  confere('a viagem não muda de campanha', !mudaCampanha.ok, mudaCampanha.status)
  const cria = await api('POST', '/api/collections/viagens/records', { token: Ana, corpo: { campanha: mesa.id } })
  confere('ninguém cria viagem pelo app', !cria.ok, cria.status)
  const apaga = await api('DELETE', `/api/collections/viagens/records/${viagem.id}`, { token: Ana })
  confere('ninguém apaga a viagem pelo app', !apaga.ok, apaga.status)

  confere('quem participa recebe as mudanças pelo tempo real', await esperarEvento(tempoRealBruno, 'viagens/*', viagem.id))
  await esperar(300)
  confere('quem está fora não recebe a viagem desta mesa', !tempoRealCarla.eventos.some((e) => e.data.includes(mesa.id)), tempoRealCarla.eventos.map((e) => e.event))
  await Promise.all([tempoRealBruno.fechar(), tempoRealCarla.fechar()])

  const apagou = await api('DELETE', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana })
  await api('DELETE', `/api/collections/campanhas/records/${daCarla.id}`, { token: Carla })
  confere('apagar a campanha apaga a viagem', apagou.ok && (await contar(admin, 'viagens', `campanha = "${mesa.id}"`)) === 0)
}

// ---------- quadro ----------

/** PNG de verdade, de uma cor só: o servidor precisa conseguir abrir para fazer a miniatura. */
function pngDeVerdade(largura, altura) {
  const pedaco = (tipo, conteudo) => {
    const tamanho = Buffer.alloc(4)
    tamanho.writeUInt32BE(conteudo.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), conteudo])
    const conferencia = Buffer.alloc(4)
    conferencia.writeUInt32BE(crc32(corpo))
    return Buffer.concat([tamanho, corpo, conferencia])
  }
  const cabecalho = Buffer.alloc(13)
  cabecalho.writeUInt32BE(largura, 0)
  cabecalho.writeUInt32BE(altura, 4)
  cabecalho[8] = 8 // 8 bits por canal
  cabecalho[9] = 6 // RGBA
  const linha = Buffer.alloc(1 + largura * 4)
  for (let x = 0; x < largura; x++) linha.set([180, 40, 90, 255], 1 + x * 4)
  const pixels = Buffer.concat(Array.from({ length: altura }, () => linha))
  return Buffer.concat([ASSINATURA_PNG, pedaco('IHDR', cabecalho), pedaco('IDAT', deflateSync(pixels)), pedaco('IEND', Buffer.alloc(0))])
}

const ASSINATURA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
// WebP sem perdas de 1 por 1 pixel.
const WEBP_PEQUENO = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')

/** Envia uma imagem como o app envia: formulário com o arquivo, a campanha, o nome e as dimensões. */
function enviarImagem(token, campanha, { arquivo = pngDeVerdade(40, 30), tipo = 'image/png', nomeArquivo = 'item.png', largura = 40, altura = 30, nome = 'Carta', extra = {}, ip } = {}) {
  const formulario = new FormData()
  formulario.append('campanha', campanha)
  formulario.append('largura', String(largura))
  formulario.append('altura', String(altura))
  if (nome) formulario.append('nome', nome)
  for (const [campo, valor] of Object.entries(extra)) formulario.append(campo, String(valor))
  formulario.append('arquivo', new Blob([arquivo], { type: tipo }), nomeArquivo)
  return api('POST', '/api/collections/quadro_imagens/records', { token, corpo: formulario, ip })
}

const criarItem = (token, corpo, ip) => api('POST', '/api/collections/quadro_itens/records', { token, corpo, ip })
const mudarItem = (token, id, corpo, ip) => api('PATCH', `/api/collections/quadro_itens/records/${id}`, { token, corpo, ip })
const mudarImagem = (token, id, corpo, ip) => api('PATCH', `/api/collections/quadro_imagens/records/${id}`, { token, corpo, ip })

async function tokenDeArquivo(token) {
  return (await api('POST', '/api/files/token', { token })).dados?.token ?? ''
}

/** Baixa o arquivo de uma imagem, como o navegador faria, com o que vier em `busca` (token, miniatura). */
async function baixarImagem(registro, busca = '') {
  const resposta = await fetch(`${base}/api/files/quadro_imagens/${registro.id}/${registro.arquivo}${busca}`)
  await resposta.arrayBuffer()
  return { status: resposta.status, tipo: resposta.headers.get('content-type') ?? '' }
}

async function testarQuadro({ admin, contas, Ana, Bruno, Carla, Davi }) {
  console.log('\nQuadro: biblioteca de imagens')
  const mesa = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa do quadro' } })).dados
  for (const nome of ['Bruno', 'Davi']) {
    await api('POST', '/api/collections/participantes/records', { token: Ana, corpo: { campanha: mesa.id, usuario: contas[nome].id, papel: 'jogador' } })
  }
  // Carla fica de fora desta mesa e tem a própria.
  const daCarla = (await api('POST', '/api/collections/campanhas/records', { token: Carla, corpo: { nome: 'Mesa da Carla' } })).dados
  // Cada pessoa num IP, como atrás do Funnel, para o limite de pedidos de uma não atrapalhar as outras.
  const ip = { Ana: '198.51.100.31', Bruno: '198.51.100.32', Carla: '198.51.100.33', Davi: '198.51.100.34' }
  const tempoRealBruno = await abrirTempoReal(Bruno, ['quadro_imagens/*', 'quadro_itens/*'])
  const tempoRealCarla = await abrirTempoReal(Carla, ['quadro_imagens/*', 'quadro_itens/*'])

  const png = pngDeVerdade(40, 30)
  const carta = await enviarImagem(Bruno, mesa.id, { arquivo: png, ip: ip.Bruno })
  confere('quem participa envia uma imagem', carta.ok && Boolean(carta.dados?.arquivo), carta)
  confere('o servidor grava quem enviou e o tamanho', carta.dados?.autor === contas.Bruno.id && carta.dados?.bytes === png.length, [carta.dados?.autor, carta.dados?.bytes, png.length])
  const fingeTamanho = await enviarImagem(Bruno, mesa.id, { ip: ip.Bruno, extra: { bytes: 1 } })
  confere('ninguém informa o tamanho da própria imagem', !fingeTamanho.ok, fingeTamanho.status)
  const fingeAutor = await enviarImagem(Bruno, mesa.id, { ip: ip.Bruno, extra: { autor: contas.Ana.id } })
  confere('ninguém envia em nome de outra pessoa', !fingeAutor.ok, fingeAutor.status)
  const deFora = await enviarImagem(Carla, mesa.id, { ip: ip.Carla })
  confere('quem está fora não envia imagem para a campanha', !deFora.ok, deFora.status)
  const doPainel = await enviarImagem(admin, mesa.id)
  confere('o administrador do painel não envia: ele não participa de campanhas', !doPainel.ok, doPainel.dados)

  const html = await enviarImagem(Bruno, mesa.id, { arquivo: Buffer.from('<html><body><script>alert(1)</script></body></html>'), nomeArquivo: 'falso.png', ip: ip.Bruno })
  confere('arquivo que não é imagem é recusado, mesmo com nome de imagem', !html.ok, html.status)
  const svg = await enviarImagem(Bruno, mesa.id, {
    arquivo: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    tipo: 'image/svg+xml',
    nomeArquivo: 'desenho.svg',
    ip: ip.Bruno,
  })
  confere('SVG é recusado', !svg.ok, svg.status)
  const grande = await enviarImagem(Davi, mesa.id, { arquivo: Buffer.concat([ASSINATURA_PNG, Buffer.alloc(2.1 * 1024 * 1024)]), ip: ip.Davi })
  confere('imagem de mais de 2 MB é recusada', !grande.ok, grande.status)
  const semDimensao = await enviarImagem(Davi, mesa.id, { largura: 0, ip: ip.Davi })
  confere('imagem sem as dimensões é recusada', !semDimensao.ok, semDimensao.status)
  const webp = await enviarImagem(Ana, mesa.id, { arquivo: WEBP_PEQUENO, tipo: 'image/webp', nomeArquivo: 'ponto.webp', largura: 1, altura: 1, nome: '', ip: ip.Ana })
  confere('WebP é aceito', webp.ok, webp.dados)

  const vistasBruno = await api('GET', registros('quadro_imagens', `campanha = "${mesa.id}"`), { token: Bruno })
  confere('quem participa vê a biblioteca da campanha', vistasBruno.dados?.items?.length === 2, vistasBruno.dados?.items?.length)
  const vistasCarla = await api('GET', registros('quadro_imagens', `campanha = "${mesa.id}"`), { token: Carla })
  confere('quem está fora não vê a biblioteca', vistasCarla.ok && vistasCarla.dados.items.length === 0, vistasCarla.dados)
  const diretaCarla = await api('GET', `/api/collections/quadro_imagens/records/${carta.dados.id}`, { token: Carla })
  confere('nem pelo id', !diretaCarla.ok, diretaCarla.status)

  console.log('\nQuadro: arquivos protegidos')
  const tokenBruno = await tokenDeArquivo(Bruno)
  const comToken = await baixarImagem(carta.dados, `?token=${tokenBruno}`)
  confere('quem participa abre a imagem com o token de arquivo', comToken.status === 200 && comToken.tipo.startsWith('image/png'), comToken)
  const semToken = await baixarImagem(carta.dados)
  confere('sem token, a imagem não abre, mesmo com o link', semToken.status !== 200, semToken)
  const tokenCarla = await tokenDeArquivo(Carla)
  const comTokenDeFora = await baixarImagem(carta.dados, `?token=${tokenCarla}`)
  confere('com o token de quem está fora, também não', comTokenDeFora.status !== 200, comTokenDeFora)
  const miniatura = await baixarImagem(carta.dados, `?thumb=320x0&token=${tokenBruno}`)
  confere('a miniatura abre com o token', miniatura.status === 200 && miniatura.tipo.startsWith('image/'), miniatura)
  const miniaturaWebp = await baixarImagem(webp.dados, `?thumb=320x0&token=${tokenBruno}`)
  confere('a miniatura do WebP também', miniaturaWebp.status === 200 && miniaturaWebp.tipo.startsWith('image/'), miniaturaWebp)

  console.log('\nQuadro: renomear e apagar imagens')
  const renomeia = await mudarImagem(Bruno, carta.dados.id, { nome: 'Carta do duque' }, ip.Bruno)
  confere('quem enviou renomeia', renomeia.ok && renomeia.dados.nome === 'Carta do duque', renomeia.dados)
  const renomeiaOutro = await mudarImagem(Davi, carta.dados.id, { nome: 'Minha' }, ip.Davi)
  confere('outro jogador não renomeia', !renomeiaOutro.ok, renomeiaOutro.status)
  const renomeiaMestre = await mudarImagem(Ana, carta.dados.id, { nome: 'Carta selada' }, ip.Ana)
  confere('o mestre renomeia', renomeiaMestre.ok, renomeiaMestre.status)
  const mudaDimensao = await mudarImagem(Bruno, carta.dados.id, { largura: 4000 }, ip.Bruno)
  confere('as dimensões não mudam depois do envio', !mudaDimensao.ok, mudaDimensao.status)
  const mudaTamanho = await mudarImagem(Ana, carta.dados.id, { bytes: 1 }, ip.Ana)
  confere('nem o tamanho, nem pelo mestre', !mudaTamanho.ok, mudaTamanho.status)
  const troca = new FormData()
  troca.append('arquivo', new Blob([pngDeVerdade(10, 10)], { type: 'image/png' }), 'outra.png')
  const trocaArquivo = await api('PATCH', `/api/collections/quadro_imagens/records/${carta.dados.id}`, { token: Bruno, corpo: troca, ip: ip.Bruno })
  confere('o arquivo não é trocado: imagem nova é envio novo', !trocaArquivo.ok, trocaArquivo.status)
  const mudaCampanha = await mudarImagem(Ana, carta.dados.id, { campanha: daCarla.id }, ip.Ana)
  confere('a imagem não muda de campanha', !mudaCampanha.ok, mudaCampanha.status)

  console.log('\nQuadro: itens e notas')
  const pino = await criarItem(Bruno, { campanha: mesa.id, tipo: 'imagem', imagem: carta.dados.id, x: 400, y: 300, largura: 240, rotacao: -3, z: 1 }, ip.Bruno)
  confere('quem participa prende uma imagem no quadro', pino.ok && pino.dados.autor === contas.Bruno.id, pino.dados)
  const nota = await criarItem(Davi, { campanha: mesa.id, tipo: 'nota', texto: 'O duque mente.', x: 800, y: 500, largura: 180, rotacao: 2, z: 2 }, ip.Davi)
  confere('quem participa prende uma nota, amarela se não disser a cor', nota.ok && nota.dados.cor === 'amarelo' && nota.dados.texto === 'O duque mente.', nota.dados)
  const pinoComTexto = await criarItem(Ana, { campanha: mesa.id, tipo: 'imagem', imagem: carta.dados.id, texto: 'escondido', cor: 'rosa', x: 100, y: 100, largura: 200 }, ip.Ana)
  confere('imagem no quadro não guarda texto nem cor', pinoComTexto.ok && pinoComTexto.dados.texto === '' && pinoComTexto.dados.cor === '', pinoComTexto.dados)

  const imagemDaCarla = await enviarImagem(Carla, daCarla.id, { ip: ip.Carla })
  const imagemDeFora = await criarItem(Bruno, { campanha: mesa.id, tipo: 'imagem', imagem: imagemDaCarla.dados?.id, x: 10, y: 10, largura: 100 }, ip.Bruno)
  confere('imagem de outra campanha não entra no quadro', imagemDaCarla.ok && !imagemDeFora.ok && String(imagemDeFora.dados?.message).startsWith('Item recusado:'), imagemDeFora.dados)
  const semImagem = await criarItem(Bruno, { campanha: mesa.id, tipo: 'imagem', x: 10, y: 10, largura: 100 }, ip.Bruno)
  confere('item de imagem sem imagem é recusado', !semImagem.ok, semImagem.status)
  const notaComImagem = await criarItem(Bruno, { campanha: mesa.id, tipo: 'nota', imagem: carta.dados.id, texto: 'x', x: 10, y: 10, largura: 100 }, ip.Bruno)
  confere('nota com imagem é recusada', !notaComImagem.ok, notaComImagem.status)
  const textoLongo = await criarItem(Bruno, { campanha: mesa.id, tipo: 'nota', texto: 'a'.repeat(501), x: 10, y: 10, largura: 100 }, ip.Bruno)
  confere('nota com mais de 500 caracteres é recusada', !textoLongo.ok, textoLongo.status)
  const foraDoQuadro = await criarItem(Bruno, { campanha: mesa.id, tipo: 'nota', texto: 'x', x: 5000, y: 10, largura: 100 }, ip.Bruno)
  confere('item fora do quadro é recusado', !foraDoQuadro.ok, foraDoQuadro.status)
  const fingeAutorItem = await criarItem(Bruno, { campanha: mesa.id, tipo: 'nota', texto: 'x', autor: contas.Ana.id, x: 10, y: 10, largura: 100 }, ip.Bruno)
  confere('ninguém prende item em nome de outra pessoa', !fingeAutorItem.ok, fingeAutorItem.status)
  const itemDeFora = await criarItem(Carla, { campanha: mesa.id, tipo: 'nota', texto: 'x', x: 10, y: 10, largura: 100 }, ip.Carla)
  confere('quem está fora não prende nada no quadro', !itemDeFora.ok, itemDeFora.status)

  const moveOutro = await mudarItem(Davi, pino.dados.id, { x: 1200, y: 900, z: 3 }, ip.Davi)
  confere('qualquer um da campanha move o item de outra pessoa', moveOutro.ok && moveOutro.dados.x === 1200 && moveOutro.dados.z === 3, moveOutro.dados)
  const redimensiona = await mudarItem(Bruno, nota.dados.id, { x: 700, largura: 260, rotacao: -1 }, ip.Bruno)
  confere('e muda de tamanho', redimensiona.ok && redimensiona.dados.largura === 260, redimensiona.dados)
  const editaOutro = await mudarItem(Bruno, nota.dados.id, { texto: 'O duque é inocente.' }, ip.Bruno)
  confere('a nota de outra pessoa não é editada', !editaOutro.ok, editaOutro.status)
  const pintaOutro = await mudarItem(Bruno, nota.dados.id, { cor: 'azul' }, ip.Bruno)
  confere('nem muda de cor', !pintaOutro.ok, pintaOutro.status)
  const editaMestre = await mudarItem(Ana, nota.dados.id, { texto: 'Editado pelo mestre.' }, ip.Ana)
  confere('nem pelo mestre', !editaMestre.ok, editaMestre.status)
  const editaAutor = await mudarItem(Davi, nota.dados.id, { texto: 'O duque mente, e a irmã sabe.', cor: 'rosa' }, ip.Davi)
  confere('quem escreveu edita a nota e a cor', editaAutor.ok && editaAutor.dados.cor === 'rosa' && editaAutor.dados.texto.endsWith('a irmã sabe.'), editaAutor.dados)
  const viraImagem = await mudarItem(Davi, nota.dados.id, { tipo: 'imagem' }, ip.Davi)
  confere('nota não vira imagem', !viraImagem.ok, viraImagem.status)
  const trocaImagem = await mudarItem(Bruno, pino.dados.id, { imagem: webp.dados.id }, ip.Bruno)
  confere('o item não troca de imagem', !trocaImagem.ok, trocaImagem.status)
  const trocaCampanha = await mudarItem(Bruno, pino.dados.id, { campanha: daCarla.id }, ip.Bruno)
  confere('nem de campanha', !trocaCampanha.ok, trocaCampanha.status)
  const trocaAutor = await mudarItem(Bruno, nota.dados.id, { autor: contas.Bruno.id }, ip.Bruno)
  confere('nem de autor', !trocaAutor.ok, trocaAutor.status)
  const moveDeFora = await mudarItem(Carla, pino.dados.id, { x: 10 }, ip.Carla)
  confere('quem está fora não move nada', !moveDeFora.ok, moveDeFora.status)

  confere('quem participa recebe as mudanças do quadro pelo tempo real', await esperarEvento(tempoRealBruno, 'quadro_itens/*', 'a irmã sabe'))
  confere('e as imagens novas da biblioteca', await esperarEvento(tempoRealBruno, 'quadro_imagens/*', webp.dados.id))
  await esperar(300)
  // A Carla recebe o que é da mesa dela: só não pode receber nada desta.
  confere('quem está fora não recebe nada do quadro', !tempoRealCarla.eventos.some((e) => e.event.startsWith('quadro_') && e.data.includes(mesa.id)), tempoRealCarla.eventos.map((e) => e.event))
  await Promise.all([tempoRealBruno.fechar(), tempoRealCarla.fechar()])

  console.log('\nQuadro: tirar do quadro')
  const tiraOutro = await api('DELETE', `/api/collections/quadro_itens/records/${pino.dados.id}`, { token: Davi, ip: ip.Davi })
  confere('jogador não tira do quadro o item de outra pessoa', !tiraOutro.ok, tiraOutro.status)
  const tiraProprio = await api('DELETE', `/api/collections/quadro_itens/records/${pino.dados.id}`, { token: Bruno, ip: ip.Bruno })
  confere('quem pôs tira', tiraProprio.ok, tiraProprio.status)
  const tiraMestre = await api('DELETE', `/api/collections/quadro_itens/records/${nota.dados.id}`, { token: Ana, ip: ip.Ana })
  confere('o mestre tira qualquer item', tiraMestre.ok, tiraMestre.status)
  const apagaOutro = await api('DELETE', `/api/collections/quadro_imagens/records/${webp.dados.id}`, { token: Davi, ip: ip.Davi })
  confere('jogador não apaga a imagem de outra pessoa', !apagaOutro.ok, apagaOutro.status)
  const apagaMestre = await api('DELETE', `/api/collections/quadro_imagens/records/${carta.dados.id}`, { token: Ana, ip: ip.Ana })
  const presosDaCarta = await contar(admin, 'quadro_itens', `imagem = "${carta.dados.id}"`)
  confere('o mestre apaga qualquer imagem, e ela sai do quadro junto', apagaMestre.ok && presosDaCarta === 0, { status: apagaMestre.status, presosDaCarta })

  console.log('\nQuadro: limite de espaço (1 MB nesta rodada)')
  const cheia = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa cheia' } })).dados
  const meioMega = Buffer.concat([ASSINATURA_PNG, Buffer.alloc(600 * 1024)])
  const primeira = await enviarImagem(Ana, cheia.id, { arquivo: meioMega, ip: '198.51.100.35' })
  const segunda = await enviarImagem(Ana, cheia.id, { arquivo: meioMega, ip: '198.51.100.35' })
  confere('passando do limite da campanha, a imagem é recusada com o motivo', primeira.ok && !segunda.ok && String(segunda.dados?.message).includes('limite de 1 MB'), segunda.dados)
  const outraMesa = await enviarImagem(Ana, mesa.id, { arquivo: meioMega, ip: '198.51.100.35' })
  confere('o limite é de cada campanha', outraMesa.ok, outraMesa.status)

  const apagou = await Promise.all([mesa, cheia, daCarla].map((c) => api('DELETE', `/api/collections/campanhas/records/${c.id}`, { token: c === daCarla ? Carla : Ana })))
  const restos = [await contar(admin, 'quadro_imagens', ''), await contar(admin, 'quadro_itens', '')]
  confere('apagar a campanha apaga a biblioteca e o quadro dela', apagou.every((r) => r.ok) && restos.every((n) => n === 0), restos)
}

/**
 * Rodada da migração e da limpeza: sobe um servidor como os de antes do mapa, com campanhas,
 * aplica a migração do mapa e confere que as campanhas antigas ganharam mapa. Depois testa a
 * limpeza dos lotes, com o prazo zerado só nesta rodada.
 */
// ---------- batalha ----------

const CONFIG_CENA = {
  grade: { tipo: 'quadrada', tamanho: 70, x: 0, y: 0, visivel: true, cor: 'clara', opacidade: 0.4 },
  medida: { valorPorCelula: 1.5, unidade: 'm', diagonal: 'simples' },
  encaixar: true,
  fundo: { largura: 40, altura: 30 },
}

/** Cada pedido de um IP diferente, para o limite de criações por IP não atrapalhar o teste. */
let ipDaBatalha = 0
const outroIp = () => `198.51.100.${150 + (ipDaBatalha++ % 100)}`

const criarCena = (token, campanha, corpo = {}) =>
  api('POST', '/api/collections/cenas_batalha/records', { token, corpo: { campanha, nome: 'Cena', config: CONFIG_CENA, ...corpo }, ip: outroIp() })
const mudarCena = (token, id, corpo) => api('PATCH', `/api/collections/cenas_batalha/records/${id}`, { token, corpo, ip: outroIp() })
const novoToken = (idLocal, extra = {}) => ({ idLocal, nome: idLocal, x: 105, y: 35, tamanho: 1, cor: '#c2185b', ...extra })
const criarTokenBatalha = (token, cena, corpo) => api('POST', '/api/collections/tokens_batalha/records', { token, corpo: { cena, ...corpo }, ip: outroIp() })
const mudarTokenBatalha = (token, id, corpo) => api('PATCH', `/api/collections/tokens_batalha/records/${id}`, { token, corpo, ip: outroIp() })

function enviarFundo(token, cena, arquivo = pngDeVerdade(40, 30), tipo = 'image/png', nomeArquivo = 'fundo.png') {
  const formulario = new FormData()
  formulario.append('fundo', new Blob([arquivo], { type: tipo }), nomeArquivo)
  return api('PATCH', `/api/collections/cenas_batalha/records/${cena}`, { token, corpo: formulario, ip: outroIp() })
}

function importarCena(token, cena, dados, { fundo, removerFundo = false } = {}) {
  const formulario = new FormData()
  formulario.append('cena', cena)
  formulario.append('dados', typeof dados === 'string' ? dados : JSON.stringify(dados))
  if (removerFundo) formulario.append('removerFundo', '1')
  if (fundo) formulario.append('fundo', new Blob([fundo.arquivo], { type: fundo.tipo }), fundo.nome)
  return api('POST', '/api/batalha/importar', { token, corpo: formulario, ip: outroIp() })
}

async function testarBatalha({ admin, contas, Ana, Bruno, Carla, Davi }) {
  console.log('\nBatalha: cenas')
  const mesa = (await api('POST', '/api/collections/campanhas/records', { token: Ana, corpo: { nome: 'Mesa da batalha' } })).dados
  for (const nome of ['Bruno', 'Davi']) {
    await api('POST', '/api/collections/participantes/records', { token: Ana, corpo: { campanha: mesa.id, usuario: contas[nome].id, papel: 'jogador' } })
  }
  const daCarla = (await api('POST', '/api/collections/campanhas/records', { token: Carla, corpo: { nome: 'Mesa da Carla, batalha' } })).dados
  const tempoRealBruno = await abrirTempoReal(Bruno, ['cenas_batalha/*', 'tokens_batalha/*', `campanhas/${mesa.id}`])
  const tempoRealCarla = await abrirTempoReal(Carla, ['cenas_batalha/*', 'tokens_batalha/*'])

  const taverna = await criarCena(Ana, mesa.id, { nome: 'Taverna' })
  confere('o mestre cria uma cena com a grade e a medida', taverna.ok && taverna.dados.config?.grade?.tamanho === 70, taverna.dados)
  const masmorra = (await criarCena(Ana, mesa.id, { nome: 'Masmorra', config: null })).dados
  confere('cena nova pode vir sem configuração: o app usa os padrões', masmorra?.config === null, masmorra)
  const doJogador = await criarCena(Bruno, mesa.id)
  confere('jogador não cria cena', !doJogador.ok, doJogador.status)
  const deFora = await criarCena(Carla, mesa.id)
  confere('quem está fora não cria cena na campanha', !deFora.ok, deFora.status)

  const configsRuins = {
    'tamanho da grade fora da faixa': { ...CONFIG_CENA, grade: { ...CONFIG_CENA.grade, tamanho: 5 } },
    'tipo de grade que não existe': { ...CONFIG_CENA, grade: { ...CONFIG_CENA.grade, tipo: 'triangular' } },
    'opacidade zero': { ...CONFIG_CENA, grade: { ...CONFIG_CENA.grade, opacidade: 0 } },
    'unidade longa demais': { ...CONFIG_CENA, medida: { ...CONFIG_CENA.medida, unidade: 'metros e meio' } },
    'diagonal que não existe': { ...CONFIG_CENA, medida: { ...CONFIG_CENA.medida, diagonal: 'torta' } },
    'fundo sem largura': { ...CONFIG_CENA, fundo: { largura: 0, altura: 30 } },
    'encaixar como texto': { ...CONFIG_CENA, encaixar: 'sim' },
    'lista no lugar do objeto': [1, 2],
    'mais de 2 KB': { ...CONFIG_CENA, nota: 'x'.repeat(2100) },
  }
  const recusas = {}
  for (const [caso, config] of Object.entries(configsRuins)) recusas[caso] = (await mudarCena(Ana, taverna.dados.id, { config })).status
  confere('configuração fora do formato é recusada', Object.values(recusas).every((status) => status >= 400), recusas)
  const motivo = await mudarCena(Ana, taverna.dados.id, { config: configsRuins['tamanho da grade fora da faixa'] })
  confere('com o motivo', String(motivo.dados?.message).startsWith('Cena recusada:'), motivo.dados)
  const semNome = await mudarCena(Ana, taverna.dados.id, { nome: '   ' })
  confere('cena sem nome é recusada', !semNome.ok, semNome.status)
  const renomeia = await mudarCena(Ana, taverna.dados.id, { nome: 'Taverna do Pônei' })
  confere('o mestre renomeia a cena', renomeia.ok && renomeia.dados.nome === 'Taverna do Pônei', renomeia.dados)
  const jogadorMuda = await mudarCena(Bruno, taverna.dados.id, { nome: 'Minha' })
  confere('jogador não muda a cena', !jogadorMuda.ok, jogadorMuda.status)
  const muda = await mudarCena(Ana, taverna.dados.id, { campanha: daCarla.id })
  confere('a cena não muda de campanha', !muda.ok, muda.status)

  console.log('\nBatalha: cena ativa')
  const daMesa = registros('cenas_batalha', `campanha = "${mesa.id}"`)
  confere('sem cena ativa, o jogador não vê nenhuma cena', (await api('GET', daMesa, { token: Bruno })).dados?.items?.length === 0)
  confere('o mestre vê todas', (await api('GET', daMesa, { token: Ana })).dados?.items?.length === 2)
  const ativa = await api('PATCH', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana, corpo: { cenaAtiva: taverna.dados.id } })
  confere('o mestre ativa uma cena', ativa.ok && ativa.dados.cenaAtiva === taverna.dados.id, ativa.dados)
  const vistas = (await api('GET', daMesa, { token: Bruno })).dados?.items ?? []
  confere('o jogador vê só a cena ativa', vistas.length === 1 && vistas[0].id === taverna.dados.id, vistas.map((c) => c.nome))
  const espia = await api('GET', `/api/collections/cenas_batalha/records/${masmorra.id}`, { token: Bruno })
  confere('nem abrindo pelo id ele vê a cena que o mestre prepara', !espia.ok, espia.status)
  confere('quem está fora não vê a cena ativa', (await api('GET', daMesa, { token: Carla })).dados?.items?.length === 0)
  const cenaDaCarla = (await criarCena(Carla, daCarla.id, { nome: 'Outra' })).dados
  const ativaDeOutra = await api('PATCH', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana, corpo: { cenaAtiva: cenaDaCarla.id } })
  confere('a cena ativa precisa ser desta campanha', !ativaDeOutra.ok && String(ativaDeOutra.dados?.message).startsWith('Cena recusada:'), ativaDeOutra.dados)
  const jogadorAtiva = await api('PATCH', `/api/collections/campanhas/records/${mesa.id}`, { token: Bruno, corpo: { cenaAtiva: masmorra.id } })
  confere('jogador não troca a cena ativa', !jogadorAtiva.ok, jogadorAtiva.status)
  confere('trocar a cena ativa chega ao jogador pelo tempo real da campanha', await esperarEvento(tempoRealBruno, `campanhas/${mesa.id}`, taverna.dados.id))

  console.log('\nBatalha: fundo')
  const fundo = await enviarFundo(Ana, taverna.dados.id)
  confere('o mestre envia o fundo', fundo.ok && Boolean(fundo.dados?.fundo), fundo.dados)
  const fundoMasmorra = (await enviarFundo(Ana, masmorra.id, WEBP_PEQUENO, 'image/webp', 'fundo.webp')).dados
  confere('WebP também serve de fundo', Boolean(fundoMasmorra?.fundo), fundoMasmorra)
  const jogadorFundo = await enviarFundo(Bruno, taverna.dados.id)
  confere('jogador não envia fundo', !jogadorFundo.ok, jogadorFundo.status)
  const html = await enviarFundo(Ana, taverna.dados.id, Buffer.from('<html><script>alert(1)</script></html>'), 'image/png', 'falso.png')
  confere('arquivo que não é imagem é recusado como fundo', !html.ok, html.status)
  const svg = await enviarFundo(Ana, taverna.dados.id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'fundo.svg')
  confere('SVG é recusado como fundo', !svg.ok, svg.status)
  const enorme = await enviarFundo(Ana, taverna.dados.id, Buffer.concat([ASSINATURA_PNG, Buffer.alloc(15.2 * 1024 * 1024)]))
  confere('fundo de mais de 15 MB é recusado', !enorme.ok, enorme.status)
  const baixar = async (registro, busca = '') => (await fetch(`${base}/api/files/cenas_batalha/${registro.id}/${registro.fundo}${busca}`)).status
  confere('o fundo não abre sem token, nem com o link', (await baixar(fundo.dados)) >= 400)
  const tokenBruno = await tokenDeArquivo(Bruno)
  confere('o jogador abre o fundo da cena ativa', (await baixar(fundo.dados, `?token=${tokenBruno}`)) === 200)
  confere('e não abre o fundo da cena que o mestre prepara', (await baixar(fundoMasmorra, `?token=${tokenBruno}`)) >= 400)
  confere('quem está fora não abre o fundo', (await baixar(fundo.dados, `?token=${await tokenDeArquivo(Carla)}`)) >= 400)

  console.log('\nBatalha: tokens')
  const cena = taverna.dados.id
  const guerreiro = await criarTokenBatalha(Ana, cena, novoToken('guerreiro', { dono: contas.Bruno.id }))
  confere('o mestre põe um token com dono', guerreiro.ok && guerreiro.dados.dono === contas.Bruno.id, guerreiro.dados)
  const orc = (await criarTokenBatalha(Ana, cena, novoToken('orc', { x: 0, y: 0 }))).dados
  confere('token sem dono, na posição zero', orc?.x === 0 && orc?.dono === '', orc)
  const dragao = (await criarTokenBatalha(Ana, masmorra.id, novoToken('dragao', { tamanho: 3, dono: contas.Bruno.id }))).dados
  const repetido = await criarTokenBatalha(Ana, cena, novoToken('orc'))
  confere('o id do token não se repete na mesma cena', !repetido.ok, repetido.status)
  const outraCena = await criarTokenBatalha(Ana, masmorra.id, novoToken('orc'))
  confere('mas pode repetir em outra cena', outraCena.ok, outraCena.dados)
  const donoDeFora = await criarTokenBatalha(Ana, cena, novoToken('espiao', { dono: contas.Carla.id }))
  confere('o dono precisa participar da campanha', !donoDeFora.ok && String(donoDeFora.dados?.message).startsWith('Token recusado:'), donoDeFora.dados)
  const jogadorCria = await criarTokenBatalha(Bruno, cena, novoToken('meu'))
  confere('jogador não cria token', !jogadorCria.ok, jogadorCria.status)
  const ruins = {
    tamanho: await criarTokenBatalha(Ana, cena, novoToken('gigante', { tamanho: 20 })),
    cor: await criarTokenBatalha(Ana, cena, novoToken('colorido', { cor: 'vermelho' })),
    posicao: await criarTokenBatalha(Ana, cena, novoToken('longe', { x: 2000000 })),
  }
  confere('token fora do formato é recusado', Object.values(ruins).every((r) => !r.ok), Object.fromEntries(Object.entries(ruins).map(([k, r]) => [k, r.status])))

  const daTaverna = registros('tokens_batalha', `cena = "${cena}"`)
  confere('o jogador vê os tokens da cena ativa', (await api('GET', daTaverna, { token: Bruno })).dados?.items?.length === 2)
  confere('e não vê os da cena que o mestre prepara', (await api('GET', registros('tokens_batalha', `cena = "${masmorra.id}"`), { token: Bruno })).dados?.items?.length === 0)
  confere('quem está fora não vê token nenhum', (await api('GET', daTaverna, { token: Carla })).dados?.items?.length === 0)

  const move = await mudarTokenBatalha(Bruno, guerreiro.dados.id, { x: 175, y: 105 })
  confere('o dono move o próprio token', move.ok && move.dados.x === 175 && move.dados.y === 105, move.dados)
  const renomeiaToken = await mudarTokenBatalha(Bruno, guerreiro.dados.id, { nome: 'Herói' })
  confere('o dono só move: não muda o nome', !renomeiaToken.ok, renomeiaToken.status)
  const passaDono = await mudarTokenBatalha(Bruno, guerreiro.dados.id, { dono: contas.Davi.id })
  confere('nem passa o token para outra pessoa', !passaDono.ok, passaDono.status)
  const cresce = await mudarTokenBatalha(Bruno, guerreiro.dados.id, { x: 10, tamanho: 3 })
  confere('nem muda o tamanho junto com a posição', !cresce.ok, cresce.status)
  const moveDoOutro = await mudarTokenBatalha(Bruno, orc.id, { x: 10 })
  confere('jogador não move o token de outro', !moveDoOutro.ok, moveDoOutro.status)
  const outroJogador = await mudarTokenBatalha(Davi, guerreiro.dados.id, { x: 10 })
  confere('nem o token de outro jogador', !outroJogador.ok, outroJogador.status)
  const foraDaAtiva = await mudarTokenBatalha(Bruno, dragao.id, { x: 10 })
  confere('nem o próprio token numa cena que não está ativa', !foraDaAtiva.ok, foraDaAtiva.status)
  const mestreMuda = await mudarTokenBatalha(Ana, orc.id, { nome: 'Chefe orc', tamanho: 2, cor: '#455a64', dono: contas.Davi.id })
  confere('o mestre muda tudo, inclusive o dono', mestreMuda.ok && mestreMuda.dados.dono === contas.Davi.id && mestreMuda.dados.tamanho === 2, mestreMuda.dados)
  const mudaCena = await mudarTokenBatalha(Ana, orc.id, { cena: masmorra.id })
  confere('o token não muda de cena', !mudaCena.ok, mudaCena.status)
  const jogadorTira = await api('DELETE', `/api/collections/tokens_batalha/records/${guerreiro.dados.id}`, { token: Bruno, ip: outroIp() })
  confere('jogador não tira token', !jogadorTira.ok, jogadorTira.status)

  confere('mover chega ao jogador pelo tempo real', await esperarEvento(tempoRealBruno, 'tokens_batalha/*', '"x":175'))
  await mudarTokenBatalha(Ana, dragao.id, { x: 777 })
  await esperar(300)
  confere('o que acontece na cena que o mestre prepara não chega ao jogador', !tempoRealBruno.eventos.some((e) => e.data?.includes(dragao.id)))
  confere('nem quem está fora recebe nada desta mesa', !tempoRealCarla.eventos.some((e) => e.data?.includes(mesa.id) || e.data?.includes(cena)))

  console.log('\nBatalha: importar')
  const tokensImportados = [novoToken('dragao', { x: 999, tamanho: 3, dono: contas.Bruno.id }), novoToken('kobold', { nome: 'Kobold' })]
  const novaConfig = { ...CONFIG_CENA, grade: { ...CONFIG_CENA.grade, tipo: 'hex-pontudo', tamanho: 50 } }
  const importa = await importarCena(Ana, masmorra.id, { config: novaConfig, tokens: tokensImportados }, { fundo: { arquivo: pngDeVerdade(40, 30), tipo: 'image/png', nome: 'mapa.png' } })
  const depoisDaImportacao = (await api('GET', registros('tokens_batalha', `cena = "${masmorra.id}"`), { token: Ana })).dados?.items ?? []
  const cenaImportada = (await api('GET', `/api/collections/cenas_batalha/records/${masmorra.id}`, { token: Ana })).dados
  confere('o mestre importa uma cena inteira num passo', importa.ok && cenaImportada?.config?.grade?.tipo === 'hex-pontudo' && cenaImportada.fundo.endsWith('.png'), importa.dados)
  const dragaoDepois = depoisDaImportacao.find((t) => t.idLocal === 'dragao')
  confere('o token que já existia é atualizado pelo id, os que não vieram saem', depoisDaImportacao.length === 2 && dragaoDepois?.id === dragao.id && dragaoDepois.x === 999, depoisDaImportacao.map((t) => t.idLocal))

  const antes = JSON.stringify(depoisDaImportacao.map((t) => [t.idLocal, t.x]).sort())
  const meioRuim = await importarCena(Ana, masmorra.id, { config: CONFIG_CENA, tokens: [novoToken('dragao', { x: 1 }), novoToken('ruim', { cor: 'azul' })] })
  const depoisDoRuim = (await api('GET', registros('tokens_batalha', `cena = "${masmorra.id}"`), { token: Ana })).dados?.items ?? []
  confere('com um token errado, nada entra', !meioRuim.ok && JSON.stringify(depoisDoRuim.map((t) => [t.idLocal, t.x]).sort()) === antes, meioRuim.dados)
  const fundoRuim = await importarCena(Ana, masmorra.id, { config: CONFIG_CENA, tokens: [] }, { fundo: { arquivo: Buffer.from('<html></html>'), tipo: 'image/png', nome: 'x.png' } })
  const aindaHex = (await api('GET', `/api/collections/cenas_batalha/records/${masmorra.id}`, { token: Ana })).dados?.config?.grade?.tipo
  confere('com um fundo que não é imagem, nada entra', !fundoRuim.ok && aindaHex === 'hex-pontudo', fundoRuim.dados)
  const jogadorImporta = await importarCena(Bruno, cena, { config: CONFIG_CENA, tokens: [] })
  confere('jogador não importa', jogadorImporta.status === 403, jogadorImporta.status)
  const donoDeForaImporta = await importarCena(Ana, masmorra.id, { config: CONFIG_CENA, tokens: [novoToken('x', { dono: contas.Carla.id })] })
  confere('na importação, o dono também precisa participar', !donoDeForaImporta.ok, donoDeForaImporta.dados)
  const duzentosEUm = Array.from({ length: 201 }, (_, i) => novoToken(`t${i}`))
  const demais = await importarCena(Ana, masmorra.id, { config: CONFIG_CENA, tokens: duzentosEUm })
  confere('a importação aceita até 200 tokens', !demais.ok, demais.status)
  const duzentos = await importarCena(Ana, masmorra.id, { config: CONFIG_CENA, tokens: duzentosEUm.slice(0, 200) }, { removerFundo: true })
  const semFundo = (await api('GET', `/api/collections/cenas_batalha/records/${masmorra.id}`, { token: Ana })).dados
  confere('200 tokens entram, e a importação pode tirar o fundo', duzentos.ok && semFundo?.fundo === '' && (await contar(admin, 'tokens_batalha', `cena = "${masmorra.id}"`)) === 200, duzentos.dados)
  const mais = await criarTokenBatalha(Ana, masmorra.id, novoToken('t200'))
  confere('a cena tem no máximo 200 tokens', !mais.ok && String(mais.dados?.message).startsWith('Token recusado:'), mais.dados)

  console.log('\nBatalha: limites e apagar')
  for (let i = 0; i < 18; i++) await criarCena(Ana, mesa.id, { nome: `Extra ${i}` })
  const vigesimaPrimeira = await criarCena(Ana, mesa.id, { nome: 'Uma a mais' })
  confere('a campanha tem no máximo 20 cenas', !vigesimaPrimeira.ok && String(vigesimaPrimeira.dados?.message).includes('20 cenas'), vigesimaPrimeira.dados)
  const jogadorApaga = await api('DELETE', `/api/collections/cenas_batalha/records/${cena}`, { token: Bruno, ip: outroIp() })
  confere('jogador não apaga cena', !jogadorApaga.ok, jogadorApaga.status)
  const apagaAtiva = await api('DELETE', `/api/collections/cenas_batalha/records/${cena}`, { token: Ana, ip: outroIp() })
  const campanhaDepois = (await api('GET', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana })).dados
  confere('apagar a cena ativa limpa a cena ativa da campanha', apagaAtiva.ok && campanhaDepois?.cenaAtiva === '', campanhaDepois)
  confere('e apaga os tokens dela', (await contar(admin, 'tokens_batalha', `cena = "${cena}"`)) === 0)

  await api('PATCH', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana, corpo: { cenaAtiva: masmorra.id } })
  await Promise.all([tempoRealBruno.fechar(), tempoRealCarla.fechar()])
  const apagaCampanha = await api('DELETE', `/api/collections/campanhas/records/${mesa.id}`, { token: Ana })
  await api('DELETE', `/api/collections/campanhas/records/${daCarla.id}`, { token: Carla })
  confere(
    'apagar a campanha, com uma cena ativa, apaga as cenas e os tokens',
    apagaCampanha.ok && (await contar(admin, 'cenas_batalha', `campanha = "${mesa.id}"`)) === 0 && (await contar(admin, 'tokens_batalha', `cena = "${masmorra.id}"`)) === 0,
    apagaCampanha.dados,
  )
}

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
    const viagens = await Promise.all(campanhas.map((c) => contar(admin, 'viagens', `campanha = "${c}"`)))
    confere('e a viagem, vazia', viagens.every((n) => n === 1), viagens)

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
    env: { ...process.env, DISCORDVTT_DIAS_LOTES: '', DISCORDVTT_DIAS_ROLAGENS: '', DISCORDVTT_QUADRO_LIMITE_MB: '', DISCORDVTT_COPIA_BACKUP: '', DISCORDVTT_COPIA_HD: '', DISCORDVTT_BACKUPS_NO_PC: '', ...env },
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
  pastaHd = join(dados, 'hd')
  dadosDoServidor = join(dados, 'pb_data')

  let erro = null
  try {
    // Limite do quadro de 1 MB nesta rodada, para o teste do limite não precisar enviar 50 MB.
    const servidor = await subirServidor(dados, {
      env: { DISCORDVTT_COPIA_BACKUP: pastaCopias, DISCORDVTT_COPIA_HD: pastaHd, DISCORDVTT_BACKUPS_NO_PC: '3', DISCORDVTT_QUADRO_LIMITE_MB: '1' },
    })
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
