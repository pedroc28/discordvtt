/// <reference path="../pb_data/types.d.ts" />

// Regras do mapa de batalha que não cabem numa regra de acesso. O porquê está em
// docs/servidor/README.md, seção "Batalha".
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em batalha.js e são carregadas com require dentro de cada handler.

onRecordCreateRequest((e) => {
  require(`${__hooks}/batalha.js`).criarCena(e)
}, 'cenas_batalha')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/batalha.js`).editarCena(e)
}, 'cenas_batalha')

onRecordCreateRequest((e) => {
  require(`${__hooks}/batalha.js`).criarToken(e)
}, 'tokens_batalha')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/batalha.js`).editarToken(e)
}, 'tokens_batalha')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/batalha.js`).conferirCenaAtiva(e)
}, 'campanhas')

// Importação de uma cena inteira (configuração, tokens e fundo) num passo só. Só o mestre.
routerAdd('POST', '/api/batalha/importar', (e) => {
  return require(`${__hooks}/batalha.js`).importarCena(e)
}, $apis.requireAuth('users'))
