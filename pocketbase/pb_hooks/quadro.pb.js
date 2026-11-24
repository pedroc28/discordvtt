/// <reference path="../pb_data/types.d.ts" />

// Regras do quadro de cortiça que não cabem numa regra de acesso. O porquê está em
// docs/servidor/README.md, seção "Quadro".
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em quadro.js e são carregadas com require dentro de cada handler.

onRecordCreateRequest((e) => {
  require(`${__hooks}/quadro.js`).enviarImagem(e)
}, 'quadro_imagens')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/quadro.js`).editarImagem(e)
}, 'quadro_imagens')

onRecordCreateRequest((e) => {
  require(`${__hooks}/quadro.js`).criarItem(e)
}, 'quadro_itens')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/quadro.js`).editarItem(e)
}, 'quadro_itens')
