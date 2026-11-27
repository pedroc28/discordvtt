/// <reference path="../pb_data/types.d.ts" />

// Funções do mapa de batalha, usadas por batalha.pb.js com require. O porquê está em
// docs/servidor/README.md, seção "Batalha". Os formatos são contrato com app/src/batalha/operacoes.ts.

const LIMITES = { cenas: 20, tokens: 200, configBytes: 2048, nomeCena: 60, nomeToken: 40, idLocal: 64, coordenada: 1000000 }
const TIPOS_GRADE = ['quadrada', 'hex-pontudo', 'hex-chato', 'nenhuma']
const CORES_GRADE = ['clara', 'escura', 'acento']
const DIAGONAIS = ['simples', 'alternada', 'euclidiana']
const COR_HEX = /^#[0-9a-fA-F]{6}$/

const ehObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const numeroEntre = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

function cenaRecusada(motivo) {
  return new BadRequestError(`Cena recusada: ${motivo}`)
}

function tokenRecusado(motivo) {
  return new BadRequestError(`Token recusado: ${motivo}`)
}

function papelNaCampanha(app, campanhaId, usuarioId) {
  try {
    return app
      .findFirstRecordByFilter('participantes', 'campanha = {:campanha} && usuario = {:usuario}', { campanha: campanhaId, usuario: usuarioId })
      .getString('papel')
  } catch (_) {
    return ''
  }
}

/**
 * Confere a grade, a medida, o encaixe e o tamanho do fundo. Só os campos que vierem: o que faltar, o app
 * completa com o padrão. Campo que o servidor não conhece passa como veio, dentro do limite de tamanho.
 * Devolve o motivo da recusa, ou '' se estiver tudo certo.
 */
function motivoDaConfig(config) {
  if (config === null) return ''
  if (!ehObj(config)) return 'a configuração precisa ser um objeto.'
  if (JSON.stringify(config).length > LIMITES.configBytes) return `a configuração passou de ${LIMITES.configBytes} bytes.`
  const { grade, medida, encaixar, fundo } = config
  if (grade !== undefined) {
    if (!ehObj(grade)) return 'a grade precisa ser um objeto.'
    if (grade.tipo !== undefined && !TIPOS_GRADE.includes(grade.tipo)) return `o tipo da grade precisa ser ${TIPOS_GRADE.join(', ')}.`
    if (grade.tamanho !== undefined && !numeroEntre(grade.tamanho, 8, 1000)) return 'o tamanho da grade precisa ficar entre 8 e 1000.'
    for (const eixo of ['x', 'y']) {
      if (grade[eixo] !== undefined && !numeroEntre(grade[eixo], -LIMITES.coordenada, LIMITES.coordenada)) return `o ${eixo} da grade precisa ficar entre -1000000 e 1000000.`
    }
    if (grade.visivel !== undefined && typeof grade.visivel !== 'boolean') return 'visivel, na grade, precisa ser verdadeiro ou falso.'
    if (grade.cor !== undefined && !CORES_GRADE.includes(grade.cor)) return `a cor da grade precisa ser ${CORES_GRADE.join(', ')}.`
    if (grade.opacidade !== undefined && !numeroEntre(grade.opacidade, 0.05, 1)) return 'a opacidade da grade precisa ficar entre 0,05 e 1.'
  }
  if (medida !== undefined) {
    if (!ehObj(medida)) return 'a medida precisa ser um objeto.'
    if (medida.valorPorCelula !== undefined && !numeroEntre(medida.valorPorCelula, 0, 100000)) return 'o valor por célula precisa ficar entre 0 e 100000.'
    if (medida.unidade !== undefined && (typeof medida.unidade !== 'string' || medida.unidade.length > 12)) return 'a unidade precisa ser um texto de até 12 caracteres.'
    if (medida.diagonal !== undefined && !DIAGONAIS.includes(medida.diagonal)) return `a diagonal precisa ser ${DIAGONAIS.join(', ')}.`
  }
  if (encaixar !== undefined && typeof encaixar !== 'boolean') return 'encaixar precisa ser verdadeiro ou falso.'
  if (fundo !== undefined && fundo !== null) {
    if (!ehObj(fundo) || !numeroEntre(fundo.largura, 1, 16384) || !numeroEntre(fundo.altura, 1, 16384)) {
      return 'o fundo precisa ter largura e altura entre 1 e 16384.'
    }
  }
  return ''
}

/** A configuração gravada no registro, já lida do JSON. */
function configDoRegistro(record) {
  const texto = record.getString('config')
  if (texto.length > LIMITES.configBytes) throw cenaRecusada(`a configuração passou de ${LIMITES.configBytes} bytes.`)
  try {
    return JSON.parse(texto || 'null')
  } catch (_) {
    throw cenaRecusada('a configuração não é um JSON válido.')
  }
}

function conferirCena(record) {
  const nome = record.getString('nome').trim()
  if (!nome) throw cenaRecusada('a cena precisa de um nome.')
  record.set('nome', nome)
  const motivo = motivoDaConfig(configDoRegistro(record))
  if (motivo) throw cenaRecusada(motivo)
}

/** O dono precisa participar da campanha da cena. */
function conferirDono(app, record) {
  const dono = record.getString('dono')
  if (!dono) return
  const cena = app.findRecordById('cenas_batalha', record.getString('cena'))
  if (!papelNaCampanha(app, cena.getString('campanha'), dono)) throw tokenRecusado('o dono do token precisa participar da campanha.')
}

/** Um token que veio na importação, conferido e já no formato do registro. */
function tokenImportado(bruto, posicao) {
  const qual = ehObj(bruto) && typeof bruto.nome === 'string' && bruto.nome ? `"${bruto.nome.slice(0, LIMITES.nomeToken)}"` : `número ${posicao + 1}`
  const recusar = (motivo) => {
    throw cenaRecusada(`o token ${qual} ${motivo}`)
  }
  if (!ehObj(bruto)) recusar('não é um objeto.')
  const idLocal = bruto.idLocal ?? bruto.id
  if (typeof idLocal !== 'string' || !idLocal || idLocal.length > LIMITES.idLocal) recusar(`precisa de um id de até ${LIMITES.idLocal} caracteres.`)
  if (bruto.nome !== undefined && (typeof bruto.nome !== 'string' || bruto.nome.length > LIMITES.nomeToken)) recusar(`precisa de um nome de até ${LIMITES.nomeToken} caracteres.`)
  for (const eixo of ['x', 'y']) {
    if (!numeroEntre(bruto[eixo], -LIMITES.coordenada, LIMITES.coordenada)) recusar(`precisa de ${eixo} entre -1000000 e 1000000.`)
  }
  if (!numeroEntre(bruto.tamanho, 0.5, 10)) recusar('precisa de tamanho entre 0,5 e 10.')
  if (typeof bruto.cor !== 'string' || !COR_HEX.test(bruto.cor)) recusar('precisa de uma cor no formato #rrggbb.')
  const dono = bruto.dono ?? ''
  if (typeof dono !== 'string') recusar('tem um dono que não vale.')
  return { idLocal, nome: bruto.nome ?? '', x: bruto.x, y: bruto.y, tamanho: bruto.tamanho, cor: bruto.cor, dono }
}

module.exports = {
  LIMITES,
  motivoDaConfig,

  /** Cena nova: nome, configuração e o limite de cenas da campanha. */
  criarCena(e) {
    conferirCena(e.record)
    const campanha = e.record.getString('campanha')
    // Na transação, duas cenas criadas ao mesmo tempo não passam juntas do limite.
    e.app.runInTransaction((txApp) => {
      const conta = new DynamicModel({ n: 0 })
      txApp.db().newQuery('SELECT COUNT(*) AS n FROM cenas_batalha WHERE campanha = {:campanha}').bind({ campanha }).one(conta)
      if (conta.n >= LIMITES.cenas) {
        throw cenaRecusada(`a campanha já tem ${LIMITES.cenas} cenas, o máximo. Apague uma cena que não usa mais e tente de novo.`)
      }
      e.app = txApp
      e.next()
    })
  },

  editarCena(e) {
    conferirCena(e.record)
    e.next()
  },

  /** A cena ativa da campanha precisa ser uma cena dela. */
  conferirCenaAtiva(e) {
    const cenaId = e.record.getString('cenaAtiva')
    if (cenaId && cenaId !== e.record.original().getString('cenaAtiva')) {
      let cena = null
      try {
        cena = e.app.findRecordById('cenas_batalha', cenaId)
      } catch (_) {
        cena = null
      }
      if (!cena || cena.getString('campanha') !== e.record.id) throw cenaRecusada('a cena ativa precisa ser uma cena desta campanha.')
    }
    e.next()
  },

  /** Token novo: dono da campanha e o limite de tokens da cena. */
  criarToken(e) {
    conferirDono(e.app, e.record)
    const cena = e.record.getString('cena')
    e.app.runInTransaction((txApp) => {
      const conta = new DynamicModel({ n: 0 })
      txApp.db().newQuery('SELECT COUNT(*) AS n FROM tokens_batalha WHERE cena = {:cena}').bind({ cena }).one(conta)
      if (conta.n >= LIMITES.tokens) throw tokenRecusado(`a cena já tem ${LIMITES.tokens} tokens, o máximo.`)
      e.app = txApp
      e.next()
    })
  },

  editarToken(e) {
    if (e.record.getString('dono') !== e.record.original().getString('dono')) conferirDono(e.app, e.record)
    e.next()
  },

  /**
   * Troca a configuração, os tokens e, se vier, o fundo de uma cena num passo só: entra tudo ou nada.
   * Só o mestre. Pedido em multipart: `cena` (o id), `dados` (JSON com `config` e `tokens`), o arquivo
   * `fundo` e `removerFundo` ("1" tira o fundo). Tokens que já existem são atualizados pelo idLocal,
   * os que não vierem saem, e os que não mudaram não são gravados de novo.
   */
  importarCena(e) {
    const corpo = e.requestInfo().body
    const cenaId = String(corpo.cena || '')
    let cena = null
    try {
      cena = e.app.findRecordById('cenas_batalha', cenaId)
    } catch (_) {
      throw new NotFoundError('Cena não encontrada.')
    }
    const campanha = cena.getString('campanha')
    if (papelNaCampanha(e.app, campanha, e.auth.id) !== 'mestre') throw new ForbiddenError('Só o mestre da campanha importa uma cena.')

    let dados = null
    try {
      dados = JSON.parse(String(corpo.dados || ''))
    } catch (_) {
      throw cenaRecusada('os dados da importação não são um JSON válido.')
    }
    if (!ehObj(dados)) throw cenaRecusada('os dados da importação precisam ser um objeto.')
    const config = dados.config === undefined ? null : dados.config
    const motivo = motivoDaConfig(config)
    if (motivo) throw cenaRecusada(motivo)
    if (!Array.isArray(dados.tokens)) throw cenaRecusada('faltou a lista de tokens.')
    if (dados.tokens.length > LIMITES.tokens) throw cenaRecusada(`a cena pode ter até ${LIMITES.tokens} tokens.`)
    const tokens = dados.tokens.map(tokenImportado)
    const vistos = new Set()
    for (const token of tokens) {
      if (vistos.has(token.idLocal)) throw cenaRecusada(`dois tokens têm o mesmo id (${token.idLocal}).`)
      vistos.add(token.idLocal)
      if (token.dono && !papelNaCampanha(e.app, campanha, token.dono)) throw cenaRecusada(`o dono do token "${token.nome}" precisa participar da campanha.`)
    }

    let fundo = null
    try {
      fundo = e.findUploadedFiles('fundo')[0] || null
    } catch (_) {
      fundo = null
    }
    const removerFundo = String(corpo.removerFundo || '') === '1'

    try {
      e.app.runInTransaction((txApp) => {
        const registro = txApp.findRecordById('cenas_batalha', cenaId)
        registro.set('config', config)
        if (fundo) registro.set('fundo', fundo)
        else if (removerFundo) registro.set('fundo', '')
        txApp.save(registro)

        const colecao = txApp.findCollectionByNameOrId('tokens_batalha')
        const existentes = new Map()
        for (const r of txApp.findRecordsByFilter('tokens_batalha', 'cena = {:cena}', '', 0, 0, { cena: cenaId })) existentes.set(r.getString('idLocal'), r)
        for (const token of tokens) {
          const r = existentes.get(token.idLocal) || new Record(colecao)
          existentes.delete(token.idLocal)
          const igual =
            !r.isNew() &&
            ['idLocal', 'nome', 'cor', 'dono'].every((campo) => r.getString(campo) === token[campo]) &&
            ['x', 'y', 'tamanho'].every((campo) => r.getFloat(campo) === token[campo])
          if (igual) continue
          r.set('cena', cenaId)
          for (const campo of ['idLocal', 'nome', 'x', 'y', 'tamanho', 'cor', 'dono']) r.set(campo, token[campo])
          txApp.save(r)
        }
        for (const sobra of existentes.values()) txApp.delete(sobra)
      })
    } catch (erro) {
      // O PocketBase confere o arquivo ao gravar: tipo pelo conteúdo e tamanho.
      if (fundo) throw cenaRecusada('o fundo precisa ser uma imagem PNG, JPEG ou WebP de até 15 MB.')
      throw cenaRecusada(`não consegui gravar a cena (${String(erro).slice(0, 200)}).`)
    }
    return e.json(200, { cena: cenaId, tokens: tokens.length })
  },
}
