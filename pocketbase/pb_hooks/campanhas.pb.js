/// <reference path="../pb_data/types.d.ts" />

// Regras de campanhas que não cabem numa regra de acesso.
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em campanhas.js e são carregadas com require dentro de cada handler.

// Toda campanha nasce com o seu mapa (e o token do grupo dele), e quem cria a campanha pelo app
// vira mestre dela, tudo na mesma transação. Sem o mestre, a campanha nasceria sem participantes,
// e ninguém conseguiria vê-la nem gerenciá-la.
onRecordCreateRequest((e) => {
  const autor = e.auth
  // Campanha criada pelo painel não tem um usuário do app como autor: o administrador
  // adiciona os participantes à mão. O mapa nasce do mesmo jeito.
  const peloApp = Boolean(autor) && autor.collection().name === 'users'

  e.app.runInTransaction((txApp) => {
    // Grava a campanha pela transação, para ela, o mapa e o mestre entrarem juntos ou nenhum deles.
    e.app = txApp
    e.next()

    require(`${__hooks}/mapa.js`).criarMapa(txApp, e.record.id)

    if (peloApp) {
      const mestre = new Record(txApp.findCollectionByNameOrId('participantes'))
      mestre.set('campanha', e.record.id)
      mestre.set('usuario', autor.id)
      mestre.set('papel', 'mestre')
      txApp.save(mestre)
    }
  })
}, 'campanhas')

// Uma campanha nunca fica sem mestre: sem ele, ninguém mais conseguiria gerenciá-la pelo app.
onRecordUpdateRequest((e) => {
  const antes = e.record.original()
  if (antes.get('papel') === 'mestre' && e.record.get('papel') !== 'mestre') {
    require(`${__hooks}/campanhas.js`).exigirOutroMestre(e.app, antes)
  }
  e.next()
}, 'participantes')

onRecordDeleteRequest((e) => {
  if (e.record.get('papel') === 'mestre') {
    require(`${__hooks}/campanhas.js`).exigirOutroMestre(e.app, e.record)
  }
  e.next()
}, 'participantes')
