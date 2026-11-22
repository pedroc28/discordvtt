// Testa as regras de acesso do servidor num PocketBase temporário.
//
// Uso, na raiz do repositório: node pocketbase/testar-regras.mjs [caminho-do-pocketbase]
// Sem caminho, usa o pocketbase.exe (Windows) ou o pocketbase desta pasta.
//
// O teste cria uma pasta de dados temporária com as migrações e os hooks do repositório e a
// apaga no fim. Ele nunca toca no pb_data de verdade. Não precisa de nenhuma dependência:
// só do Node.js 18 ou mais novo.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pasta = dirname(fileURLToPath(import.meta.url))
const executavel = process.argv[2] ?? join(pasta, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase')
const versaoFixada = readFileSync(join(pasta, 'VERSAO'), 'utf8').trim()
const SENHA = 'senha-de-teste-123'
const ADMIN = { email: 'admin@teste.local', senha: 'senha-do-admin-123' }

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
  pastaCopias = join(dados, 'copias')
  const argumentos = [
    `--dir=${join(dados, 'pb_data')}`,
    `--migrationsDir=${join(pasta, 'pb_migrations')}`,
    `--hooksDir=${join(pasta, 'pb_hooks')}`,
  ]
  execFileSync(executavel, ['superuser', 'upsert', ADMIN.email, ADMIN.senha, ...argumentos], { stdio: 'ignore' })

  const porta = await portaLivre()
  base = `http://127.0.0.1:${porta}`
  let log = ''
  const servidor = spawn(executavel, ['serve', `--http=127.0.0.1:${porta}`, '--hooksWatch=false', ...argumentos], {
    env: { ...process.env, DISCORDVTT_COPIA_BACKUP: pastaCopias },
  })
  servidor.stdout.on('data', (parte) => (log += parte))
  servidor.stderr.on('data', (parte) => (log += parte))
  const terminou = new Promise((resolver) => servidor.once('exit', resolver))

  let erro = null
  try {
    let pronto = false
    for (let i = 0; i < 60 && !pronto; i++) {
      await esperar(250)
      pronto = await fetch(`${base}/api/health`).then((r) => r.ok, () => false)
    }
    if (!pronto) throw new Error(`O PocketBase não respondeu. Saída dele:\n${log}`)
    console.log(`PocketBase ${versao.replace(/^pocketbase version /, '')} em ${base}, com dados temporários.`)
    await testar()
  } catch (e) {
    erro = e
  } finally {
    servidor.kill()
    await terminou
    rmSync(dados, { recursive: true, force: true })
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
