// Sobe um PocketBase local para testes, com uma campanha pronta: uma conta de mestre e duas de jogador,
// e o quadro da campanha montado com as imagens de exemplo do app.
//
// Uso, na raiz do repositório: node pocketbase/servidor-de-teste.mjs [caminho-do-pocketbase] [--porta=8092]
// Sem caminho, usa o pocketbase.exe (Windows) ou o pocketbase desta pasta.
//
// Os dados ficam numa pasta temporária, com as migrações e os hooks do repositório, e são apagados
// quando o script termina (Ctrl+C). Ele nunca toca no pb_data de verdade, e a porta padrão (8092) não
// atrapalha o servidor de verdade (8090). As contas e senhas ficam em app/src/servidor/contas-de-teste.json,
// as mesmas que os testes do app usam (app/src/servidor/teste-servidor.ts).
//
// Serve para testar o app à mão (npm run dev, entrando com uma das contas) e para rodar os testes do
// RepositorioPocketBase contra um servidor de verdade (ver docs/servidor/README.md, "Servidor de teste").
// Não precisa de nenhuma dependência: só do Node.js 18 ou mais novo.

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pasta = dirname(fileURLToPath(import.meta.url))
const argumentos = process.argv.slice(2)
const opcaoPorta = argumentos.find((a) => a.startsWith('--porta='))
const porta = opcaoPorta ? Number(opcaoPorta.slice('--porta='.length)) : 8092
const executavel = argumentos.find((a) => !a.startsWith('--')) ?? join(pasta, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase')
const versaoFixada = readFileSync(join(pasta, 'VERSAO'), 'utf8').trim()
const teste = JSON.parse(readFileSync(join(pasta, '..', 'app', 'src', 'servidor', 'contas-de-teste.json'), 'utf8'))
const pastaExemplos = join(pasta, '..', 'app', 'src', 'quadro', 'exemplos')
const base = `http://127.0.0.1:${porta}`

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

function portaLivre(numero) {
  return new Promise((resolver) => {
    const servidor = createServer()
    servidor.once('error', () => resolver(false))
    servidor.listen(numero, '127.0.0.1', () => servidor.close(() => resolver(true)))
  })
}

async function api(metodo, caminho, token, corpo) {
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(`${metodo} ${caminho} falhou (${resposta.status}): ${JSON.stringify(dados)}`)
  return dados
}

/** Cria as contas e a campanha. Tudo pelo administrador, sem login de conta, para não gastar o limite de tentativas. */
async function prepararCampanha() {
  const { token: admin } = await api('POST', '/api/collections/_superusers/auth-with-password', null, {
    identity: teste.administrador.email,
    password: teste.administrador.senha,
  })
  const ids = {}
  for (const conta of teste.contas) {
    const criada = await api('POST', '/api/collections/users/records', admin, {
      email: conta.email,
      password: conta.senha,
      passwordConfirm: conta.senha,
      name: conta.nome,
    })
    ids[conta.id] = criada.id
  }
  // Criada pelo administrador, a campanha já nasce com o mapa (pb_hooks/campanhas.pb.js), mas sem mestre.
  const campanha = await api('POST', '/api/collections/campanhas/records', admin, { nome: teste.campanha })
  for (const conta of teste.contas) {
    await api('POST', '/api/collections/participantes/records', admin, { campanha: campanha.id, usuario: ids[conta.id], papel: conta.papel })
  }
  const mapas = await api('GET', `/api/collections/mapas/records?filter=${encodeURIComponent(`campanha = "${campanha.id}"`)}`, admin)
  await montarQuadro(admin, campanha.id, ids)
  return { campanha: campanha.id, mapa: mapas.items[0]?.id ?? '' }
}

/**
 * Monta o quadro da campanha com as imagens de exemplo, enviadas pelo mestre, e uma nota da jogadora.
 * Os hooks do quadro só aceitam contas do app, então o administrador age como cada conta
 * (impersonate), sem login e sem gastar o limite de tentativas.
 */
async function montarQuadro(admin, campanha, ids) {
  const comoConta = async (id) => (await api('POST', `/api/collections/users/impersonate/${id}`, admin, { duration: 3600 })).token
  const mestre = await comoConta(ids.mestre)
  const { imagens } = JSON.parse(readFileSync(join(pastaExemplos, 'lista.json'), 'utf8'))
  // Em grade, em volta do meio do quadro (3200 por 2000), como o app faz.
  const posicoes = [[1270, 850], [1600, 850], [1930, 850], [1270, 1150], [1600, 1150], [1930, 1150]]
  for (const [i, imagem] of imagens.entries()) {
    const formulario = new FormData()
    formulario.append('campanha', campanha)
    formulario.append('nome', imagem.nome)
    formulario.append('largura', String(imagem.largura))
    formulario.append('altura', String(imagem.altura))
    formulario.append('arquivo', new Blob([readFileSync(join(pastaExemplos, imagem.arquivo))], { type: 'image/webp' }), imagem.arquivo)
    const resposta = await fetch(`${base}/api/collections/quadro_imagens/records`, { method: 'POST', headers: { Authorization: mestre }, body: formulario })
    const enviada = await resposta.json()
    if (!resposta.ok) throw new Error(`Não consegui pôr "${imagem.nome}" no quadro (${resposta.status}): ${JSON.stringify(enviada)}`)
    const [x, y] = posicoes[i % posicoes.length]
    const largura = imagem.largura >= imagem.altura ? 280 : 200
    await api('POST', '/api/collections/quadro_itens/records', mestre, { campanha, tipo: 'imagem', imagem: enviada.id, x, y, largura, rotacao: (i % 3) * 2 - 2, z: i + 1 })
    // Sem pressa: o limite de pedidos do PocketBase é de 20 criações a cada 5 segundos.
    await esperar(250)
  }
  const jogadora = await comoConta(ids.jogadora)
  await api('POST', '/api/collections/quadro_itens/records', jogadora, {
    campanha,
    tipo: 'nota',
    texto: 'Quem é o Corvo Rubro? E o que essa chave abre?',
    cor: 'amarelo',
    x: 2330,
    y: 1000,
    largura: 200,
    rotacao: 3,
    z: 10,
  })
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
  if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) {
    console.error('Porta inválida. Use um número entre 1024 e 65535, por exemplo --porta=8092.')
    process.exit(1)
  }
  if (!(await portaLivre(porta))) {
    console.error(`A porta ${porta} já está em uso, talvez por outro servidor de teste. Feche-o ou use outra porta, por exemplo --porta=${porta + 1}.`)
    process.exit(1)
  }

  const dados = mkdtempSync(join(tmpdir(), 'discordvtt-teste-'))
  const opcoes = [`--dir=${join(dados, 'pb_data')}`, `--migrationsDir=${join(pasta, 'pb_migrations')}`, `--hooksDir=${join(pasta, 'pb_hooks')}`]
  execFileSync(executavel, ['superuser', 'upsert', teste.administrador.email, teste.administrador.senha, ...opcoes], { stdio: 'ignore' })

  let log = ''
  const servidor = spawn(executavel, ['serve', `--http=127.0.0.1:${porta}`, '--hooksWatch=false', ...opcoes], {
    // Um servidor de teste nunca copia backups para a nuvem, e a limpeza dos lotes usa o prazo padrão.
    env: { ...process.env, DISCORDVTT_COPIA_BACKUP: '', DISCORDVTT_DIAS_LOTES: '' },
  })
  servidor.stdout.on('data', (parte) => (log += parte))
  servidor.stderr.on('data', (parte) => (log += parte))

  let encerrando = false
  const encerrar = (codigo) => {
    if (encerrando) return
    encerrando = true
    servidor.kill()
    servidor.once('exit', () => {
      rmSync(dados, { recursive: true, force: true })
      process.exit(codigo)
    })
  }
  process.on('SIGINT', () => encerrar(0))
  process.on('SIGTERM', () => encerrar(0))
  servidor.once('exit', (codigo) => {
    if (encerrando) return
    console.error(`\nO PocketBase parou sozinho (código ${codigo}). Saída dele:\n${log}`)
    rmSync(dados, { recursive: true, force: true })
    process.exit(1)
  })

  try {
    let pronto = false
    for (let i = 0; i < 60 && !pronto; i++) {
      await esperar(250)
      pronto = await fetch(`${base}/api/health`).then((r) => r.ok, () => false)
    }
    if (!pronto) throw new Error(`O PocketBase não respondeu. Saída dele:\n${log}`)
    const { campanha, mapa } = await prepararCampanha()

    console.log(`Servidor de teste em ${base} (PocketBase ${versao.replace(/^pocketbase version /, '')}, dados temporários).`)
    console.log(`Painel: ${base}/_/ com ${teste.administrador.email} e a senha ${teste.administrador.senha}`)
    console.log(`Campanha "${teste.campanha}": ${campanha}, mapa ${mapa}, quadro com as imagens de exemplo`)
    for (const conta of teste.contas) console.log(`  ${conta.papel.padEnd(7)} ${conta.email}, senha ${conta.senha}`)
    console.log('No app (npm run dev, em app/), entre com uma dessas contas e este endereço de servidor.')
    console.log(`Testes do repositório contra este servidor, em app/: DISCORDVTT_SERVIDOR_TESTE=${base} npx vitest run src/servidor/repositorio-mapa.servidor.test.ts`)
    console.log('Para desligar e apagar os dados, aperte Ctrl+C.')
    // A verificação do GitHub espera esta linha antes de rodar os testes.
    console.log('Servidor de teste pronto.')
  } catch (erro) {
    console.error(`Não consegui preparar o servidor de teste: ${erro.message}`)
    encerrar(1)
  }
}

main()
