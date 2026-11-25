/// <reference path="../pb_data/types.d.ts" />

// Regras da viagem da campanha que não cabem numa regra de acesso. O porquê está em
// docs/servidor/README.md, seção "Viagem".
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em viagem.js e são carregadas com require dentro de cada handler.

// Só o mestre chega aqui (regra de acesso). O hook confere o formato da configuração.
onRecordUpdateRequest((e) => {
  require(`${__hooks}/viagem.js`).conferirViagem(e)
}, 'viagens')
