/// <reference path="../pb_data/types.d.ts" />

// Camada do mestre no mapa, combinada com o GrifoCaolho em 22/11/2026: notas privadas e hexágonos
// ocultos (com os marcadores deles) ficam em coleções que só o mestre da campanha lê, e as mudanças nelas
// ficam num histórico de lotes próprio, com numeração própria, para jogador nenhum receber nem perceber.
// Também entram o tipo do lote (edição, importação ou reversão), que o hook confere, e a trava do mapa
// (`permissao`): com "mestre", só o mestre edita. O porquê de cada regra está em docs/servidor/README.md.

// Nas coleções com o campo `mapa`: o usuário é mestre da campanha do mapa. O alias ":mestre" faz as três
// condições valerem para a mesma participação (ver docs/contratos.md).
const MESTRE_DO_MAPA = [
  '@collection.participantes:mestre.campanha ?= mapa.campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')

// Na coleção mapas: o usuário é mestre da campanha deste mapa.
const MESTRE_DA_CAMPANHA = [
  '@collection.participantes:mestre.campanha ?= campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')

const TAMANHO_PRIVADO = 16 * 1024 * 1024
const TIPOS_DE_LOTE = ['edicao', 'importacao', 'reversao']

const datas = () => [
  { type: 'autodate', name: 'created', onCreate: true },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
]

// Só o mestre lê, e ninguém grava pela API: só os hooks.
const soDoMestre = { listRule: MESTRE_DO_MAPA, viewRule: MESTRE_DO_MAPA, createRule: null, updateRule: null, deleteRule: null }

migrate((app) => {
  const mapas = app.findCollectionByNameOrId('mapas')
  // Trava do mapa: com "mestre", o hook dos lotes recusa edições de jogadores. Vazio vale "todos".
  mapas.fields.add(new SelectField({ name: 'permissao', values: ['todos', 'mestre'], maxSelect: 1 }))
  // O mestre muda a trava e o nome. O contador de lotes e a campanha, ninguém muda.
  mapas.updateRule = [MESTRE_DA_CAMPANHA, '@request.body.campanha:changed = false', '@request.body.ultimaOrdem:changed = false'].join(' && ')
  app.save(mapas)

  const lotes = app.findCollectionByNameOrId('lotes')
  lotes.fields.add(new SelectField({ name: 'tipo', values: TIPOS_DE_LOTE, maxSelect: 1 }))
  // Na reversão: o id (loteId) do lote desfeito.
  lotes.fields.add(new TextField({ name: 'alvoId', max: 100 }))
  app.save(lotes)

  const relacaoMapa = { type: 'relation', name: 'mapa', collectionId: mapas.id, required: true, maxSelect: 1, cascadeDelete: true }

  // O contador da camada do mestre fica fora do mapa, que jogadores leem: senão eles veriam quantas
  // edições secretas o mestre fez.
  const camadas = new Collection({
    type: 'base',
    name: 'mapas_mestre',
    fields: [relacaoMapa, { type: 'number', name: 'ultimaOrdem', onlyInt: true, min: 0 }, ...datas()],
    indexes: ['CREATE UNIQUE INDEX `idx_mapas_mestre_mapa` ON `mapas_mestre` (`mapa`)'],
    ...soDoMestre,
  })
  app.save(camadas)

  const ocultos = new Collection({
    type: 'base',
    name: 'hexagonos_ocultos',
    fields: [
      relacaoMapa,
      { type: 'number', name: 'q', onlyInt: true },
      { type: 'number', name: 'r', onlyInt: true },
      { type: 'text', name: 'chunk', required: true, max: 40 },
      { type: 'json', name: 'dados', required: true, maxSize: 1024 * 1024 },
      ...datas(),
    ],
    // Pode haver um hexágono público e um oculto na mesma posição: são coleções separadas.
    indexes: [
      'CREATE UNIQUE INDEX `idx_hexagonos_ocultos_posicao` ON `hexagonos_ocultos` (`mapa`, `q`, `r`)',
      'CREATE INDEX `idx_hexagonos_ocultos_chunk` ON `hexagonos_ocultos` (`mapa`, `chunk`)',
    ],
    ...soDoMestre,
  })
  app.save(ocultos)

  const notas = new Collection({
    type: 'base',
    name: 'notas_mestre',
    fields: [
      relacaoMapa,
      { type: 'number', name: 'q', onlyInt: true },
      { type: 'number', name: 'r', onlyInt: true },
      { type: 'text', name: 'chunk', required: true, max: 40 },
      { type: 'json', name: 'dados', required: true, maxSize: 1024 * 1024 },
      ...datas(),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_notas_mestre_posicao` ON `notas_mestre` (`mapa`, `q`, `r`)',
      'CREATE INDEX `idx_notas_mestre_chunk` ON `notas_mestre` (`mapa`, `chunk`)',
    ],
    ...soDoMestre,
  })
  app.save(notas)

  const lotesMestre = new Collection({
    type: 'base',
    name: 'lotes_mestre',
    fields: [
      relacaoMapa,
      // Numeração própria da camada do mestre, separada da dos lotes públicos.
      { type: 'number', name: 'ordem', onlyInt: true, min: 0 },
      // O mesmo id do lote que o app mandou. Um lote com parte pública e privada tem os dois registros.
      { type: 'text', name: 'loteId', required: true, max: 100 },
      { type: 'text', name: 'autor', max: 100 },
      { type: 'number', name: 'ts' },
      { type: 'select', name: 'tipo', values: TIPOS_DE_LOTE, maxSelect: 1 },
      { type: 'text', name: 'alvoId', max: 100 },
      { type: 'json', name: 'ocultos', maxSize: TAMANHO_PRIVADO },
      { type: 'json', name: 'notas', maxSize: TAMANHO_PRIVADO },
      ...datas(),
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_lotes_mestre_ordem` ON `lotes_mestre` (`mapa`, `ordem`)',
      'CREATE UNIQUE INDEX `idx_lotes_mestre_lote` ON `lotes_mestre` (`mapa`, `loteId`)',
      'CREATE INDEX `idx_lotes_mestre_created` ON `lotes_mestre` (`created`)',
    ],
    ...soDoMestre,
  })
  app.save(lotesMestre)

  // Os mapas que já existiam: trava aberta e a camada do mestre vazia.
  for (const mapa of app.findAllRecords('mapas')) {
    mapa.set('permissao', 'todos')
    app.save(mapa)
    const camada = new Record(camadas)
    camada.set('mapa', mapa.id)
    camada.set('ultimaOrdem', 0)
    app.save(camada)
  }
}, (app) => {
  for (const nome of ['lotes_mestre', 'notas_mestre', 'hexagonos_ocultos', 'mapas_mestre']) {
    app.delete(app.findCollectionByNameOrId(nome))
  }
  const lotes = app.findCollectionByNameOrId('lotes')
  lotes.fields.removeByName('tipo')
  lotes.fields.removeByName('alvoId')
  app.save(lotes)
  const mapas = app.findCollectionByNameOrId('mapas')
  mapas.fields.removeByName('permissao')
  mapas.updateRule = null
  app.save(mapas)
})
