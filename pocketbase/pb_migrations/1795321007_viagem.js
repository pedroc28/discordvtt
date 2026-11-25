/// <reference path="../pb_data/types.d.ts" />

// Viagem da campanha: as regras do mundo e o estoque do grupo que o painel de viagem do mapa usa.
// O porquê de cada regra está em docs/servidor/README.md, seção "Viagem".
//
// Um registro por campanha, criado junto com ela (pb_hooks/campanhas.pb.js). Quem participa lê, só o
// mestre grava, e ninguém cria nem apaga pelo app. O hook pb_hooks/viagem.pb.js confere a configuração.
//
// Fica fora do registro `mapas` de propósito: ele é regravado a cada lote (o contador de ordem), e uma
// gravação da viagem no mesmo registro poderia escrever um contador velho por cima.

const PARTICIPA = 'campanha.participantes_via_campanha.usuario ?= @request.auth.id'

const MESTRE = [
  '@collection.participantes:mestre.campanha ?= campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')

// Contrato com o mapa (app/src/mapa/viagem-campanha.ts): 14 números hoje, com folga para crescer.
const TAMANHO_MAXIMO = 4096

migrate((app) => {
  const campanhas = app.findCollectionByNameOrId('campanhas')
  const viagens = new Collection({
    type: 'base',
    name: 'viagens',
    fields: [
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      // Vazio até o mestre gravar pela primeira vez: o mapa usa os valores padrão.
      { type: 'json', name: 'config', maxSize: TAMANHO_MAXIMO },
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_viagens_campanha` ON `viagens` (`campanha`)'],
    listRule: PARTICIPA,
    viewRule: PARTICIPA,
    createRule: null,
    updateRule: `${MESTRE} && @request.body.campanha:changed = false`,
    deleteRule: null,
  })
  app.save(viagens)

  // As campanhas que já existem ganham a viagem delas, vazia.
  for (const campanha of app.findAllRecords('campanhas')) {
    const viagem = new Record(viagens)
    viagem.set('campanha', campanha.id)
    app.save(viagem)
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId('viagens'))
})
