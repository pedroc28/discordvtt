/// <reference path="../pb_data/types.d.ts" />

// Regras de campanhas que não cabem numa regra de acesso.
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em campanhas.js e são carregadas com require dentro de cada handler.

// Quem cria uma campanha pelo app vira mestre dela, na mesma transação. Sem isso, a campanha
// nasceria sem participantes, e ninguém conseguiria vê-la nem gerenciá-la.
onRecordCreateRequest((e) => {
  const autor = e.auth
  // Campanha criada pelo painel não tem um usuário do app como autor: o administrador
  // adiciona os participantes à mão.
  if (!autor || autor.collection().name !== 'users') {
    e.next()
    return
  }

  e.app.runInTransaction((txApp) => {
    // Grava a campanha pela transação, para ela e o mestre entrarem juntos ou nenhum dos dois.
    e.app = txApp
    e.next()

    const mestre = new Record(txApp.findCollectionByNameOrId('participantes'))
    mestre.set('campanha', e.record.id)
    mestre.set('usuario', autor.id)
    mestre.set('papel', 'mestre')
    txApp.save(mestre)
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
