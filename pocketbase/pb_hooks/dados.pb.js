/// <reference path="../pb_data/types.d.ts" />

// Regras da rolagem de dados que não cabem numa regra de acesso. O porquê está em
// docs/servidor/README.md, seção "Dados".
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em dados.js e são carregadas com require dentro de cada handler.

// O servidor sorteia e grava quem rolou. O que o app mandar nesses campos é recusado pela regra.
onRecordCreateRequest((e) => {
  require(`${__hooks}/dados.js`).rolar(e)
}, 'rolagens', 'rolagens_secretas')

// Limpeza das rolagens antigas, a cada hora em que o servidor estiver ligado.
cronAdd('limpar_rolagens', '43 * * * *', () => {
  require(`${__hooks}/dados.js`).limparRolagens($app)
})
