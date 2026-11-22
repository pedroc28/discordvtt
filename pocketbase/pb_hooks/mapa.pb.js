/// <reference path="../pb_data/types.d.ts" />

// Regras do mapa que não cabem numa regra de acesso. O porquê de cada uma está em
// docs/servidor/README.md, seção "Mapa".
// Cada handler roda isolado e não enxerga nada declarado fora dele, por isso as funções
// auxiliares ficam em mapa.js e são carregadas com require dentro de cada handler.

// O cliente grava o lote inteiro, e o servidor numera, valida e aplica nos hexágonos e regiões,
// numa transação só. A regra de acesso (participar da campanha) já foi conferida antes deste hook.
onRecordCreateRequest((e) => {
  return require(`${__hooks}/mapa.js`).gravarLote(e)
}, 'lotes')

// Token do grupo: vale o ts mais recente, e o autor é quem está logado.
onRecordUpdateRequest((e) => {
  return require(`${__hooks}/mapa.js`).gravarToken(e)
}, 'tokens_grupo')

// Limpeza dos lotes antigos, a cada hora em que o servidor estiver ligado. Não roda ao ligar porque,
// no bootstrap, a migração que cria os lotes ainda pode não ter rodado.
cronAdd('limpar_lotes', '41 * * * *', () => {
  require(`${__hooks}/mapa.js`).limparLotes($app)
})
