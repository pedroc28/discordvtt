/// <reference path="../pb_data/types.d.ts" />

// Funções auxiliares de mapa.pb.js e campanhas.pb.js. O nome sem ".pb" impede o PocketBase de
// carregar este arquivo como hook: ele só entra pelo require.
//
// O mapa sincroniza por lotes: o cliente grava um lote inteiro na coleção `lotes`, e o hook valida,
// dá o número de ordem e aplica as mudanças em `hexagonos` e `regioes`, tudo numa transação.
// O formato dos dados é o contrato do mapa (app/src/mapa/tipos.ts e docs/contratos.md).

// Tamanho do chunk e formato da chave são contrato com o mapa: precisam bater com `TAMANHO_CHUNK`
// e `chaveChunk` de app/src/mapa/hex.ts, inclusive com coordenadas negativas. Os casos conferidos
// pelos dois lados estão em app/src/servidor/casos-chunk.json.
const TAMANHO_CHUNK = 16

// Limites contra lotes absurdos. São bem maiores que o que a interface do mapa produz, para não
// atrapalhar uma importação: o tamanho de um mapa inteiro cabe com folga num lote.
const LIMITES = {
  mudancas: 20000,
  regioes: 2000,
  coordenada: 1000000,
  id: 100,
  nome: 500,
  texto: 20000,
  marcadores: 100,
}

// Lotes mais velhos que isto são apagados pela limpeza: o estado do mapa fica nos hexágonos e nas
// regiões, e os lotes só servem para quem está conectado buscar o que perdeu. A variável existe para o
// teste das regras conseguir limpar na hora. Num servidor normal ela fica vazia e vale o padrão.
const DIAS_PADRAO_LOTES = 30

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

/** Confere o lote inteiro antes de mexer em qualquer coisa. Um item errado recusa o lote todo. */
function validarLote(record) {
  const loteId = record.getString('loteId')
  if (!loteId) recusar('falta o id do lote.')
  const mudancas = lerJson(record, 'mudancas') ?? []
  const regioes = lerJson(record, 'regioes') ?? []
  if (!Array.isArray(mudancas) || !Array.isArray(regioes)) recusar('as mudanças não estão em listas.')
  if (mudancas.length > LIMITES.mudancas) {
    recusar(`tem ${mudancas.length} hexágonos, e o limite é ${LIMITES.mudancas}. Divida a importação em partes.`)
  }
  if (regioes.length > LIMITES.regioes) recusar(`tem ${regioes.length} regiões, e o limite é ${LIMITES.regioes}.`)
  if (mudancas.length === 0 && regioes.length === 0) recusar('não tem nenhuma mudança.')

  const hexagonos = mudancas.map((m) => {
    if (!ehObj(m) || !inteiro(m.q) || !inteiro(m.r)) recusar('uma das mudanças não tem posição de hexágono.')
    if (Math.abs(m.q) > LIMITES.coordenada || Math.abs(m.r) > LIMITES.coordenada) {
      recusar(`o hexágono (${m.q}, ${m.r}) está longe demais do centro do mapa.`)
    }
    const depois = m.depois === null || m.depois === undefined ? null : validarHexagono(m.depois, m.q, m.r)
    return { q: m.q, r: m.r, depois }
  })
  const listaRegioes = regioes.map((m) => {
    if (!ehObj(m) || !textoAte(m.id, LIMITES.id) || !m.id) recusar('uma das mudanças de região não tem id.')
    const depois = m.depois === null || m.depois === undefined ? null : validarRegiao(m.depois, m.id)
    return { id: m.id, depois }
  })
  return { loteId, hexagonos, regioes: listaRegioes }
}

/**
 * Aplica as mudanças nos hexágonos e nas regiões do mapa e devolve as listas com o "antes" real
 * do servidor no lugar do que o cliente achava. Roda dentro da transação do lote.
 */
function aplicarMudancas(txApp, mapaId, validado) {
  // Carrega de uma vez os hexágonos dos chunks mexidos, em vez de uma busca por hexágono:
  // uma importação mexe em milhares deles.
  const atuais = new Map()
  const chunks = new Set(validado.hexagonos.map((m) => chaveChunk(m.q, m.r)))
  for (const chunk of chunks) {
    const lista = txApp.findRecordsByFilter('hexagonos', 'mapa = {:mapa} && chunk = {:chunk}', '', 0, 0, { mapa: mapaId, chunk })
    for (const rec of lista) atuais.set(`${rec.getInt('q')},${rec.getInt('r')}`, rec)
  }
  const colecaoHex = txApp.findCollectionByNameOrId('hexagonos')
  const mudancas = []
  for (const m of validado.hexagonos) {
    const chave = `${m.q},${m.r}`
    const rec = atuais.get(chave)
    const antes = rec ? lerJson(rec, 'dados') : null
    if (m.depois) {
      const alvo = rec ?? new Record(colecaoHex)
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

  const regioes = []
  if (validado.regioes.length) {
    const porId = new Map()
    for (const rec of txApp.findRecordsByFilter('regioes', 'mapa = {:mapa}', '', 0, 0, { mapa: mapaId })) {
      porId.set(rec.getString('regiaoId'), rec)
    }
    const colecaoRegioes = txApp.findCollectionByNameOrId('regioes')
    for (const m of validado.regioes) {
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
  return { mudancas, regioes }
}

module.exports = {
  chaveChunk,

  /** Cria o mapa da campanha e o token do grupo dele. Roda na transação que criou a campanha. */
  criarMapa(txApp, campanhaId) {
    const mapa = new Record(txApp.findCollectionByNameOrId('mapas'))
    mapa.set('campanha', campanhaId)
    mapa.set('nome', 'Mapa do mundo')
    mapa.set('ultimaOrdem', 0)
    txApp.save(mapa)

    const token = new Record(txApp.findCollectionByNameOrId('tokens_grupo'))
    token.set('mapa', mapa.id)
    token.set('presente', false)
    token.set('ts', 0)
    txApp.save(token)
    return mapa
  },

  /**
   * Grava um lote: confere, numera e aplica, tudo na mesma transação. Se algo falhar, nada muda,
   * nem o número de ordem. Um lote repetido (mesmo id, por exemplo reenviado depois de a conexão cair)
   * não é aplicado de novo: a resposta é o lote que já estava gravado.
   */
  gravarLote(e) {
    const validado = validarLote(e.record)
    const mapaId = e.record.getString('mapa')
    let repetido = null

    e.app.runInTransaction((txApp) => {
      try {
        repetido = txApp.findFirstRecordByFilter('lotes', 'mapa = {:mapa} && loteId = {:loteId}', {
          mapa: mapaId,
          loteId: validado.loteId,
        })
      } catch {
        repetido = null
      }
      if (repetido) return

      // O contador fica no mapa, e não no maior número entre os lotes, porque a limpeza apaga lotes
      // antigos e a numeração não pode recomeçar. A transação do PocketBase grava uma de cada vez,
      // então dois lotes nunca recebem o mesmo número.
      const mapa = txApp.findRecordById('mapas', mapaId)
      const ordem = mapa.getInt('ultimaOrdem') + 1
      mapa.set('ultimaOrdem', ordem)
      txApp.save(mapa)

      const aplicado = aplicarMudancas(txApp, mapaId, validado)
      const ts = e.record.getFloat('ts')
      e.record.set('ordem', ordem)
      e.record.set('autor', e.auth ? e.auth.id : '')
      e.record.set('ts', Number.isFinite(ts) && ts > 0 ? ts : Date.now())
      e.record.set('mudancas', aplicado.mudancas)
      e.record.set('regioes', aplicado.regioes)

      e.app = txApp
      e.next()
    })

    if (repetido) return e.json(200, repetido)
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
      const resultado = app.db().newQuery('DELETE FROM lotes WHERE created < {:limite}').bind({ limite }).execute()
      const apagados = resultado.rowsAffected()
      if (apagados > 0) app.logger().info('Lotes antigos do mapa apagados', 'quantidade', apagados, 'antesDe', limite)
    } catch (erro) {
      app.logger().error('Não consegui apagar os lotes antigos do mapa', 'erro', String(erro))
    }
  },
}
