/// <reference path="../pb_data/types.d.ts" />

// Funções auxiliares de mapa.pb.js e campanhas.pb.js. O nome sem ".pb" impede o PocketBase de
// carregar este arquivo como hook: ele só entra pelo require.
//
// O mapa sincroniza por lotes: o cliente grava um lote inteiro na coleção `lotes`, e o hook valida,
// dá o número de ordem e aplica as mudanças em `hexagonos` e `regioes`, tudo numa transação.
// A parte privada do lote (só do mestre) vai para a camada do mestre: `hexagonos_ocultos`,
// `notas_mestre` e um registro em `lotes_mestre`, com numeração própria. Jogador nenhum recebe essa parte.
// O formato dos dados é o contrato do mapa (app/src/mapa/tipos.ts e docs/contratos.md).

// Tamanho do chunk e formato da chave são contrato com o mapa: precisam bater com `TAMANHO_CHUNK`
// e `chaveChunk` de app/src/mapa/hex.ts, inclusive com coordenadas negativas. Os casos conferidos
// pelos dois lados estão em app/src/servidor/casos-chunk.json.
const TAMANHO_CHUNK = 16

// Limites contra lotes absurdos. Uma pincelada tem de 1 a 20 mudanças, então uma edição comum cabe com
// folga em 2.000. A importação (só do mestre) leva um mapa inteiro num lote só, para entrar inteira ou nada.
const LIMITES = {
  edicao: 2000,
  importacao: 20000,
  regioes: 2000,
  coordenada: 1000000,
  id: 100,
  nome: 500,
  texto: 20000,
  marcadores: 100,
}

// Lotes mais velhos que isto são apagados pela limpeza: o estado do mapa fica nos hexágonos e nas
// regiões, e os lotes servem para quem está conectado buscar o que perdeu e para o mestre reverter.
// Prazo combinado com o GrifoCaolho em 22/11/2026 (ver docs/decisoes.md). A variável existe para o
// teste das regras conseguir limpar na hora. Num servidor normal ela fica vazia e vale o padrão.
const DIAS_PADRAO_LOTES = 7

const TIPOS_DE_LOTE = ['edicao', 'importacao', 'reversao']

// Quanto um relógio adiantado pode passar da hora do servidor ao mover o token do grupo.
const TOLERANCIA_RELOGIO_MS = 60 * 1000

const ehObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const inteiro = (v) => typeof v === 'number' && Number.isInteger(v)
const textoAte = (v, max) => typeof v === 'string' && v.length <= max

function recusar(mensagem) {
  throw new BadRequestError(`Lote recusado: ${mensagem}`)
}

function chaveChunk(q, r) {
  // `${-0}` vira "0", igual ao que o mapa faz.
  return `${Math.floor(q / TAMANHO_CHUNK)},${Math.floor(r / TAMANHO_CHUNK)}`
}

function lerJson(record, campo) {
  const texto = record.getString(campo)
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

/** Direções de aresta: só 0, 1 e 2, sem repetir, em ordem. */
function validarDirecoes(valor, onde, campo) {
  if (valor === undefined || valor === null) return []
  if (!Array.isArray(valor) || valor.some((d) => d !== 0 && d !== 1 && d !== 2)) {
    recusar(`${onde} tem ${campo} fora do formato (use as direções 0, 1 e 2).`)
  }
  return [...new Set(valor)].sort()
}

/**
 * Confere o hexágono e devolve uma cópia com os campos conhecidos no formato certo. Campos que o
 * servidor não conhece passam como vieram: assim o mapa pode ganhar campos novos sem esperar o servidor.
 */
function validarHexagono(bruto, q, r) {
  const onde = `o hexágono (${q}, ${r})`
  if (!ehObj(bruto)) recusar(`${onde} não está no formato de hexágono.`)
  if (bruto.q !== q || bruto.r !== r) recusar(`${onde} diz estar em outra posição.`)
  if (typeof bruto.terreno !== 'string' || !bruto.terreno || bruto.terreno.length > LIMITES.id) {
    recusar(`${onde} não tem terreno.`)
  }
  const regiaoId = bruto.regiaoId === undefined ? null : bruto.regiaoId
  if (regiaoId !== null && !(textoAte(regiaoId, LIMITES.id) && regiaoId)) recusar(`${onde} tem uma região inválida.`)
  const nome = bruto.nome === undefined ? '' : bruto.nome
  if (!textoAte(nome, LIMITES.nome)) recusar(`${onde} tem um nome com mais de ${LIMITES.nome} letras.`)
  const nota = bruto.nota === undefined ? '' : bruto.nota
  if (!textoAte(nota, LIMITES.texto)) recusar(`${onde} tem uma nota com mais de ${LIMITES.texto} letras.`)
  const marcadores = bruto.marcadores === undefined ? [] : bruto.marcadores
  if (!Array.isArray(marcadores) || marcadores.length > LIMITES.marcadores) {
    recusar(`${onde} tem marcadores demais ou fora do formato.`)
  }
  for (const m of marcadores) {
    const ok =
      ehObj(m) &&
      textoAte(m.id, LIMITES.id) &&
      m.id &&
      textoAte(m.tipo, LIMITES.id) &&
      m.tipo &&
      (m.nome === undefined || textoAte(m.nome, LIMITES.nome))
    if (!ok) recusar(`${onde} tem um marcador fora do formato.`)
  }
  const rev = bruto.rev === undefined ? 1 : bruto.rev
  if (!inteiro(rev) || rev < 1) recusar(`${onde} tem uma revisão inválida.`)
  return Object.assign({}, bruto, {
    regiaoId,
    nome,
    nota,
    marcadores,
    rios: validarDirecoes(bruto.rios, onde, 'rios'),
    estradas: validarDirecoes(bruto.estradas, onde, 'estradas'),
    rev,
  })
}

function validarRegiao(bruto, id) {
  const onde = `a região "${id}"`
  if (!ehObj(bruto) || bruto.id !== id) recusar(`${onde} não está no formato de região.`)
  const nome = bruto.nome === undefined ? '' : bruto.nome
  if (!textoAte(nome, LIMITES.nome)) recusar(`${onde} tem um nome com mais de ${LIMITES.nome} letras.`)
  if (typeof bruto.cor !== 'string' || !/^#[0-9a-f]{6}$/i.test(bruto.cor)) recusar(`${onde} tem uma cor inválida.`)
  const descricao = bruto.descricao === undefined ? '' : bruto.descricao
  if (!textoAte(descricao, LIMITES.texto)) recusar(`${onde} tem uma descrição com mais de ${LIMITES.texto} letras.`)
  const paiId = bruto.paiId === undefined ? null : bruto.paiId
  if (paiId !== null && !(textoAte(paiId, LIMITES.id) && paiId && paiId !== id)) recusar(`${onde} tem uma região pai inválida.`)
  const rev = bruto.rev === undefined ? 1 : bruto.rev
  if (!inteiro(rev) || rev < 1) recusar(`${onde} tem uma revisão inválida.`)
  return Object.assign({}, bruto, { nome, descricao, paiId, rev })
}

function validarPosicao(m, oque) {
  if (!ehObj(m) || !inteiro(m.q) || !inteiro(m.r)) recusar(`uma das mudanças de ${oque} não tem posição de hexágono.`)
  if (Math.abs(m.q) > LIMITES.coordenada || Math.abs(m.r) > LIMITES.coordenada) {
    recusar(`o hexágono (${m.q}, ${m.r}) está longe demais do centro do mapa.`)
  }
}

function validarMudancasDeHexagono(lista, oque) {
  return lista.map((m) => {
    validarPosicao(m, oque)
    const depois = m.depois === null || m.depois === undefined ? null : validarHexagono(m.depois, m.q, m.r)
    return { q: m.q, r: m.r, depois }
  })
}

function validarNota(bruto, q, r) {
  const onde = `a nota privada do hexágono (${q}, ${r})`
  if (!ehObj(bruto) || bruto.q !== q || bruto.r !== r) recusar(`${onde} não está no formato de nota.`)
  if (!textoAte(bruto.texto, LIMITES.texto)) recusar(`${onde} precisa de um texto de até ${LIMITES.texto} letras.`)
  const rev = bruto.rev === undefined ? 1 : bruto.rev
  if (!inteiro(rev) || rev < 1) recusar(`${onde} tem uma revisão inválida.`)
  return Object.assign({}, bruto, { rev })
}

/**
 * A parte privada vem no corpo do pedido, e não num campo da coleção `lotes`: assim ela nunca chega perto
 * do registro público, que jogadores leem.
 */
function lerPrivado(e) {
  const bruto = e.requestInfo().body.privado
  if (bruto === undefined || bruto === null) return null
  try {
    return JSON.parse(JSON.stringify(bruto))
  } catch {
    recusar('a parte privada não está no formato certo.')
  }
}

/** Confere o lote inteiro antes de mexer em qualquer coisa. Um item errado recusa o lote todo. */
function validarLote(record, privado) {
  const loteId = record.getString('loteId')
  if (!loteId) recusar('falta o id do lote.')
  const tipo = record.getString('tipo') || 'edicao'
  if (!TIPOS_DE_LOTE.includes(tipo)) recusar(`o tipo "${tipo}" não existe. Use edicao, importacao ou reversao.`)
  const alvoId = record.getString('alvoId')
  if (tipo === 'reversao' && !alvoId) recusar('a reversão não diz qual lote desfaz.')

  const mudancas = lerJson(record, 'mudancas') ?? []
  const regioes = lerJson(record, 'regioes') ?? []
  if (!Array.isArray(mudancas) || !Array.isArray(regioes)) recusar('as mudanças não estão em listas.')
  if (privado !== null && !ehObj(privado)) recusar('a parte privada não está no formato certo.')
  const ocultos = privado?.ocultos ?? []
  const notas = privado?.notas ?? []
  if (!Array.isArray(ocultos) || !Array.isArray(notas)) recusar('a parte privada não está em listas.')

  const total = mudancas.length + ocultos.length + notas.length
  const limite = tipo === 'importacao' ? LIMITES.importacao : LIMITES.edicao
  if (total > limite) {
    recusar(
      tipo === 'importacao'
        ? `tem ${total} mudanças, e o limite de uma importação é ${LIMITES.importacao}. Divida a importação em partes.`
        : `tem ${total} mudanças, e uma edição comum tem no máximo ${LIMITES.edicao}. Para mais, use a importação, que é do mestre.`,
    )
  }
  if (regioes.length > LIMITES.regioes) recusar(`tem ${regioes.length} regiões, e o limite é ${LIMITES.regioes}.`)
  if (total === 0 && regioes.length === 0) recusar('não tem nenhuma mudança.')

  const listaRegioes = regioes.map((m) => {
    if (!ehObj(m) || !textoAte(m.id, LIMITES.id) || !m.id) recusar('uma das mudanças de região não tem id.')
    const depois = m.depois === null || m.depois === undefined ? null : validarRegiao(m.depois, m.id)
    return { id: m.id, depois }
  })
  const listaNotas = notas.map((m) => {
    validarPosicao(m, 'nota')
    const depois = m.depois === null || m.depois === undefined ? null : validarNota(m.depois, m.q, m.r)
    return { q: m.q, r: m.r, depois }
  })
  return {
    loteId,
    tipo,
    alvoId,
    hexagonos: validarMudancasDeHexagono(mudancas, 'hexágono'),
    regioes: listaRegioes,
    ocultos: validarMudancasDeHexagono(ocultos, 'hexágono oculto'),
    notas: listaNotas,
  }
}

/**
 * Aplica mudanças por posição (hexágonos, hexágonos ocultos ou notas privadas) na coleção indicada e
 * devolve a lista com o "antes" real do servidor no lugar do que o cliente achava. Roda na transação do lote.
 */
function aplicarPorPosicao(txApp, colecao, mapaId, lista) {
  // Carrega de uma vez os registros dos chunks mexidos, em vez de uma busca por posição:
  // uma importação mexe em milhares deles.
  const atuais = new Map()
  const chunks = new Set(lista.map((m) => chaveChunk(m.q, m.r)))
  for (const chunk of chunks) {
    const achados = txApp.findRecordsByFilter(colecao, 'mapa = {:mapa} && chunk = {:chunk}', '', 0, 0, { mapa: mapaId, chunk })
    for (const rec of achados) atuais.set(`${rec.getInt('q')},${rec.getInt('r')}`, rec)
  }
  const colecaoRegistros = txApp.findCollectionByNameOrId(colecao)
  const mudancas = []
  for (const m of lista) {
    const chave = `${m.q},${m.r}`
    const rec = atuais.get(chave)
    const antes = rec ? lerJson(rec, 'dados') : null
    if (m.depois) {
      const alvo = rec ?? new Record(colecaoRegistros)
      alvo.set('mapa', mapaId)
      alvo.set('q', m.q)
      alvo.set('r', m.r)
      alvo.set('chunk', chaveChunk(m.q, m.r))
      alvo.set('dados', m.depois)
      txApp.save(alvo)
      atuais.set(chave, alvo)
    } else if (rec) {
      txApp.delete(rec)
      atuais.delete(chave)
    }
    mudancas.push({ q: m.q, r: m.r, antes, depois: m.depois })
  }
  return mudancas
}

/** Aplica as mudanças de regiões, com o "antes" real do servidor. Roda na transação do lote. */
function aplicarRegioes(txApp, mapaId, lista) {
  const regioes = []
  if (lista.length) {
    const porId = new Map()
    for (const rec of txApp.findRecordsByFilter('regioes', 'mapa = {:mapa}', '', 0, 0, { mapa: mapaId })) {
      porId.set(rec.getString('regiaoId'), rec)
    }
    const colecaoRegioes = txApp.findCollectionByNameOrId('regioes')
    for (const m of lista) {
      const rec = porId.get(m.id)
      const antes = rec ? lerJson(rec, 'dados') : null
      if (m.depois) {
        const alvo = rec ?? new Record(colecaoRegioes)
        alvo.set('mapa', mapaId)
        alvo.set('regiaoId', m.id)
        alvo.set('dados', m.depois)
        txApp.save(alvo)
        porId.set(m.id, alvo)
      } else if (rec) {
        txApp.delete(rec)
        porId.delete(m.id)
      }
      regioes.push({ id: m.id, antes, depois: m.depois })
    }
  }
  return regioes
}

function acharLote(txApp, colecao, mapaId, loteId) {
  try {
    return txApp.findFirstRecordByFilter(colecao, 'mapa = {:mapa} && loteId = {:loteId}', { mapa: mapaId, loteId })
  } catch {
    return null
  }
}

function ehMestre(txApp, campanhaId, usuarioId) {
  try {
    txApp.findFirstRecordByFilter('participantes', 'campanha = {:campanha} && usuario = {:usuario} && papel = "mestre"', {
      campanha: campanhaId,
      usuario: usuarioId,
    })
    return true
  } catch {
    return false
  }
}

/**
 * O que a regra de acesso não consegue conferir: a trava do mapa, a parte privada, a importação e a
 * reversão de lote de outra pessoa. O tipo é declarado pelo app, então ele não impede um jogador de
 * apagar muito numa edição comum: contra isso valem o limite de tamanho, o de frequência e o histórico.
 */
function conferirPermissoes(txApp, mapa, validado, autorId, mestre) {
  if (mestre) return
  if (mapa.getString('permissao') === 'mestre') recusar('só o mestre edita este mapa.')
  if (validado.ocultos.length || validado.notas.length) recusar('só o mestre mexe na camada do mestre.')
  if (validado.tipo === 'importacao') recusar('só o mestre importa mapas.')
  if (validado.tipo === 'reversao') {
    const alvo = acharLote(txApp, 'lotes', mapa.id, validado.alvoId)
    if (!alvo) recusar('essa edição já saiu do histórico, que guarda 7 dias, e não dá mais para desfazer.')
    if (alvo.getString('autor') !== autorId) recusar('só o mestre desfaz edições de outra pessoa.')
  }
}

module.exports = {
  chaveChunk,

  /** Cria o mapa da campanha e o token do grupo dele. Roda na transação que criou a campanha. */
  criarMapa(txApp, campanhaId) {
    const mapa = new Record(txApp.findCollectionByNameOrId('mapas'))
    mapa.set('campanha', campanhaId)
    mapa.set('nome', 'Mapa do mundo')
    mapa.set('ultimaOrdem', 0)
    mapa.set('permissao', 'todos')
    txApp.save(mapa)

    const camada = new Record(txApp.findCollectionByNameOrId('mapas_mestre'))
    camada.set('mapa', mapa.id)
    camada.set('ultimaOrdem', 0)
    txApp.save(camada)

    const token = new Record(txApp.findCollectionByNameOrId('tokens_grupo'))
    token.set('mapa', mapa.id)
    token.set('presente', false)
    token.set('ts', 0)
    txApp.save(token)
    return mapa
  },

  /**
   * Grava um lote: confere, numera e aplica, tudo na mesma transação. Se algo falhar, nada muda,
   * nem os números de ordem. A parte pública vira o registro de `lotes`, e a parte privada (só do mestre)
   * vira um registro de `lotes_mestre`, com a numeração da camada do mestre. Um lote só com parte privada
   * não cria nada em `lotes`: a resposta é o registro de `lotes_mestre`. Um lote repetido (mesmo id, por
   * exemplo reenviado depois de a conexão cair) não é aplicado de novo: a resposta é o que já estava gravado.
   */
  gravarLote(e) {
    const validado = validarLote(e.record, lerPrivado(e))
    const mapaId = e.record.getString('mapa')
    const autorId = e.auth ? e.auth.id : ''
    let resposta = null

    e.app.runInTransaction((txApp) => {
      resposta = acharLote(txApp, 'lotes', mapaId, validado.loteId) ?? acharLote(txApp, 'lotes_mestre', mapaId, validado.loteId)
      if (resposta) return

      const mapa = txApp.findRecordById('mapas', mapaId)
      const mestre = e.hasSuperuserAuth() || (Boolean(autorId) && ehMestre(txApp, mapa.getString('campanha'), autorId))
      conferirPermissoes(txApp, mapa, validado, autorId, mestre)
      const ts = e.record.getFloat('ts')
      const quando = Number.isFinite(ts) && ts > 0 ? ts : Date.now()

      if (validado.ocultos.length || validado.notas.length) {
        // O contador da camada do mestre fica fora do mapa, que jogadores leem.
        const camada = txApp.findFirstRecordByFilter('mapas_mestre', 'mapa = {:mapa}', { mapa: mapaId })
        const ordem = camada.getInt('ultimaOrdem') + 1
        camada.set('ultimaOrdem', ordem)
        txApp.save(camada)
        const privado = new Record(txApp.findCollectionByNameOrId('lotes_mestre'))
        privado.set('mapa', mapaId)
        privado.set('ordem', ordem)
        privado.set('loteId', validado.loteId)
        privado.set('autor', autorId)
        privado.set('ts', quando)
        privado.set('tipo', validado.tipo)
        privado.set('alvoId', validado.alvoId)
        privado.set('ocultos', aplicarPorPosicao(txApp, 'hexagonos_ocultos', mapaId, validado.ocultos))
        privado.set('notas', aplicarPorPosicao(txApp, 'notas_mestre', mapaId, validado.notas))
        txApp.save(privado)
        resposta = privado
      }

      if (validado.hexagonos.length || validado.regioes.length) {
        // O contador fica no mapa, e não no maior número entre os lotes, porque a limpeza apaga lotes
        // antigos e a numeração não pode recomeçar. O PocketBase grava uma transação de cada vez,
        // então dois lotes nunca recebem o mesmo número.
        const ordem = mapa.getInt('ultimaOrdem') + 1
        mapa.set('ultimaOrdem', ordem)
        txApp.save(mapa)
        e.record.set('ordem', ordem)
        e.record.set('autor', autorId)
        e.record.set('ts', quando)
        e.record.set('tipo', validado.tipo)
        e.record.set('alvoId', validado.alvoId)
        e.record.set('mudancas', aplicarPorPosicao(txApp, 'hexagonos', mapaId, validado.hexagonos))
        e.record.set('regioes', aplicarRegioes(txApp, mapaId, validado.regioes))
        resposta = null
        e.app = txApp
        e.next()
      }
    })

    if (resposta) return e.json(200, resposta)
  },

  /**
   * Muda o token do grupo. Vale o `ts` mais recente: um pedido atrasado não desfaz um mais novo.
   * Um relógio muito adiantado é trazido para a hora do servidor, senão o token ficaria preso nele.
   */
  gravarToken(e) {
    const antes = e.record.original()
    if (e.record.getString('mapa') !== antes.getString('mapa')) {
      throw new BadRequestError('O token do grupo não muda de mapa.')
    }
    const agora = Date.now()
    let ts = e.record.getFloat('ts')
    if (!Number.isFinite(ts) || ts <= 0) ts = agora
    if (ts > agora + TOLERANCIA_RELOGIO_MS) ts = agora
    if (ts < antes.getFloat('ts')) return e.json(200, antes)
    e.record.set('ts', ts)
    e.record.set('autor', e.auth ? e.auth.id : '')
    e.next()
  },

  /** Apaga os lotes mais velhos que o prazo. O estado do mapa continua nos hexágonos e regiões. */
  limparLotes(app) {
    const bruto = String($os.getenv('DISCORDVTT_DIAS_LOTES') || '').trim()
    const dias = bruto === '' || !Number.isFinite(Number(bruto)) || Number(bruto) < 0 ? DIAS_PADRAO_LOTES : Number(bruto)
    const limite = new DateTime().addDate(0, 0, -dias).string()
    try {
      // Direto no banco, sem passar pelos hooks: são só registros de histórico, e assim os clientes
      // conectados não recebem um aviso de tempo real por lote apagado.
      let apagados = 0
      for (const tabela of ['lotes', 'lotes_mestre']) {
        apagados += app.db().newQuery(`DELETE FROM ${tabela} WHERE created < {:limite}`).bind({ limite }).execute().rowsAffected()
      }
      if (apagados > 0) app.logger().info('Lotes antigos do mapa apagados', 'quantidade', apagados, 'antesDe', limite)
    } catch (erro) {
      app.logger().error('Não consegui apagar os lotes antigos do mapa', 'erro', String(erro))
    }
  },
}
