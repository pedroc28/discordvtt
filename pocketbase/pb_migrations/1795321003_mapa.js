/// <reference path="../pb_data/types.d.ts" />

// Mapa no servidor: um mapa por campanha (por enquanto), com hexágonos, regiões, o token do grupo e
// os lotes, que são a unidade de sincronização. O porquê de cada regra está em docs/servidor/README.md,
// seção "Mapa", e o formato dos dados é o contrato do mapa (docs/contratos.md).
//
// Só o servidor grava hexágonos e regiões: o cliente grava um lote, e o hook pb_hooks/mapa.pb.js
// valida, numera e aplica, numa transação. Por enquanto, quem participa da campanha lê e edita o mapa.
// A camada privada do mestre ainda não existe: quando existir, fica em coleções próprias.

// Na coleção mapas: o usuário participa da campanha deste mapa.
const PARTICIPA_DA_CAMPANHA = 'campanha.participantes_via_campanha.usuario ?= @request.auth.id'

// Nas coleções com o campo `mapa`: o usuário participa da campanha do mapa.
const PARTICIPA_DO_MAPA = 'mapa.campanha.participantes_via_campanha.usuario ?= @request.auth.id'

// Lotes guardam o lote inteiro, com antes e depois de cada hexágono. Uma importação de mapa inteiro
// vira um lote só, então o limite é bem maior que o padrão de 1 MB do PocketBase.
const TAMANHO_MUDANCAS = 16 * 1024 * 1024
const TAMANHO_REGIOES = 2 * 1024 * 1024

const LIMITE_LOTES = { label: 'lotes:create', maxRequests: 300, duration: 10, audience: '' }

const datas = () => [
  { type: 'autodate', name: 'created', onCreate: true },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
]

migrate((app) => {
  const campanhas = app.findCollectionByNameOrId('campanhas')

  const mapas = new Collection({
    type: 'base',
    name: 'mapas',
    fields: [
      // Apagar a campanha apaga o mapa e, em cascata, tudo o que é dele.
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: 'text', name: 'nome', max: 80, presentable: true },
      // Número do último lote gravado. Fica aqui, e não só nos lotes, porque a limpeza apaga lotes
      // antigos e a numeração não pode recomeçar. O app lê este número ao abrir o mapa.
      { type: 'number', name: 'ultimaOrdem', onlyInt: true, min: 0 },
      ...datas(),
    ],
    indexes: [
      // Um mapa por campanha, por enquanto. Para ter vários, uma migração tira este índice.
      'CREATE UNIQUE INDEX `idx_mapas_campanha` ON `mapas` (`campanha`)',
    ],
    listRule: PARTICIPA_DA_CAMPANHA,
    viewRule: PARTICIPA_DA_CAMPANHA,
    // O mapa nasce junto com a campanha (pb_hooks/campanhas.pb.js) e só o servidor mexe no contador.
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  app.save(mapas)

  const relacaoMapa = { type: 'relation', name: 'mapa', collectionId: mapas.id, required: true, maxSelect: 1, cascadeDelete: true }
  // Ninguém grava direto: só o hook dos lotes, que não passa por estas regras.
  const soLeitura = { listRule: PARTICIPA_DO_MAPA, viewRule: PARTICIPA_DO_MAPA, createRule: null, updateRule: null, deleteRule: null }

  const hexagonos = new Collection({
    type: 'base',
    name: 'hexagonos',
    fields: [
      relacaoMapa,
      { type: 'number', name: 'q', onlyInt: true },
      { type: 'number', name: 'r', onlyInt: true },
      // Chave do chunk calculada pelo servidor, igual ao chaveChunk do mapa. É o que o app pede ao carregar.
      { type: 'text', name: 'chunk', required: true, max: 40 },
      // O hexágono inteiro, no formato do contrato (q, r, terreno, rios, estradas...).
      { type: 'json', name: 'dados', required: true, maxSize: 1024 * 1024 },
      ...datas(),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_hexagonos_posicao` ON `hexagonos` (`mapa`, `q`, `r`)',
      'CREATE INDEX `idx_hexagonos_chunk` ON `hexagonos` (`mapa`, `chunk`)',
    ],
    ...soLeitura,
  })
  app.save(hexagonos)

  const regioes = new Collection({
    type: 'base',
    name: 'regioes',
    fields: [
      relacaoMapa,
      // Id da região no mapa (gerado pelo app), diferente do id do registro no PocketBase.
      { type: 'text', name: 'regiaoId', required: true, max: 100 },
      { type: 'json', name: 'dados', required: true, maxSize: 1024 * 1024 },
      ...datas(),
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_regioes_mapa_regiao` ON `regioes` (`mapa`, `regiaoId`)'],
    ...soLeitura,
  })
  app.save(regioes)

  const tokens = new Collection({
    type: 'base',
    name: 'tokens_grupo',
    fields: [
      relacaoMapa,
      { type: 'number', name: 'q', onlyInt: true },
      { type: 'number', name: 'r', onlyInt: true },
      // Hora da mudança, em milissegundos. Vale o mais recente (ver o hook).
      { type: 'number', name: 'ts' },
      // Id da conta que mexeu por último. O hook preenche.
      { type: 'text', name: 'autor', max: 100 },
      // Falso quando o token foi tirado do mapa.
      { type: 'bool', name: 'presente' },
      ...datas(),
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_tokens_grupo_mapa` ON `tokens_grupo` (`mapa`)'],
    listRule: PARTICIPA_DO_MAPA,
    viewRule: PARTICIPA_DO_MAPA,
    // Um token por mapa, criado junto com ele. Quem participa só move.
    createRule: null,
    updateRule: `${PARTICIPA_DO_MAPA} && @request.body.mapa:changed = false`,
    deleteRule: null,
  })
  app.save(tokens)

  const lotes = new Collection({
    type: 'base',
    name: 'lotes',
    fields: [
      relacaoMapa,
      // Número de ordem dado pelo servidor. A ordem dos lotes no servidor é a verdade.
      { type: 'number', name: 'ordem', onlyInt: true, min: 0 },
      // Id do lote no app. Um lote repetido não é aplicado de novo.
      { type: 'text', name: 'loteId', required: true, max: 100 },
      // Id da conta que gravou. O hook preenche, o que o app mandar não vale.
      { type: 'text', name: 'autor', max: 100 },
      { type: 'number', name: 'ts' },
      { type: 'json', name: 'mudancas', maxSize: TAMANHO_MUDANCAS },
      { type: 'json', name: 'regioes', maxSize: TAMANHO_REGIOES },
      ...datas(),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_lotes_ordem` ON `lotes` (`mapa`, `ordem`)',
      'CREATE UNIQUE INDEX `idx_lotes_lote` ON `lotes` (`mapa`, `loteId`)',
      // Para a limpeza dos lotes antigos.
      'CREATE INDEX `idx_lotes_created` ON `lotes` (`created`)',
    ],
    listRule: PARTICIPA_DO_MAPA,
    viewRule: PARTICIPA_DO_MAPA,
    createRule: PARTICIPA_DO_MAPA,
    // Lote gravado não muda nem some pelo app. Só a limpeza apaga os antigos.
    updateRule: null,
    deleteRule: null,
  })
  app.save(lotes)

  // Cada pincelada é um lote, e o limite padrão do PocketBase para criar registros (20 a cada
  // 5 segundos por pessoa) barraria quem pinta tocando rápido. Para lotes vale o mesmo limite geral da API.
  const config = app.settings()
  config.rateLimits.rules = [
    ...config.rateLimits.rules.filter((regra) => regra.label !== LIMITE_LOTES.label),
    LIMITE_LOTES,
  ]
  app.save(config)

  // As campanhas que já existiam ganham o seu mapa, igual às novas (ver pb_hooks/mapa.js, criarMapa).
  for (const campanha of app.findAllRecords('campanhas')) {
    const mapa = new Record(mapas)
    mapa.set('campanha', campanha.id)
    mapa.set('nome', 'Mapa do mundo')
    mapa.set('ultimaOrdem', 0)
    app.save(mapa)

    const token = new Record(tokens)
    token.set('mapa', mapa.id)
    token.set('presente', false)
    token.set('ts', 0)
    app.save(token)
  }
}, (app) => {
  const config = app.settings()
  config.rateLimits.rules = config.rateLimits.rules.filter((regra) => regra.label !== LIMITE_LOTES.label)
  app.save(config)

  for (const nome of ['lotes', 'tokens_grupo', 'regioes', 'hexagonos', 'mapas']) {
    app.delete(app.findCollectionByNameOrId(nome))
  }
})
