/// <reference path="../pb_data/types.d.ts" />

// Rolagem de dados: o histórico de cada campanha. O porquê de cada regra está em
// docs/servidor/README.md, seção "Dados".
//
// O app manda só a campanha e quantos lados tem o dado. Quem rolou e quanto deu, o hook
// pb_hooks/dados.pb.js preenche, com o gerador de números aleatórios criptográfico do servidor.
// Assim ninguém escolhe o próprio resultado, nem mandando o pedido à mão.
//
// A rolagem secreta do mestre fica numa coleção própria, que jogadores não leem nem pelo tempo real.

// Na coleção com o campo `campanha`: o usuário participa dela.
const PARTICIPA_DA_CAMPANHA = 'campanha.participantes_via_campanha.usuario ?= @request.auth.id'

// Na coleção com o campo `campanha`: o usuário é mestre dela. O alias ":mestre" garante que
// as três condições valem para a mesma participação.
const MESTRE_DA_CAMPANHA = [
  '@collection.participantes:mestre.campanha ?= campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')

// O pedido não traz quem rolou nem o resultado: um pedido com qualquer um dos dois é recusado.
const SO_O_DADO = '@request.body.autor:isset = false && @request.body.resultado:isset = false'

function colecaoDeRolagens(app, nome, quemVe) {
  const campanhas = app.findCollectionByNameOrId('campanhas')
  const usuarios = app.findCollectionByNameOrId('users')
  return new Collection({
    type: 'base',
    name: nome,
    fields: [
      // Apagar a campanha ou a conta apaga as rolagens junto.
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: 'relation', name: 'autor', collectionId: usuarios.id, required: true, maxSelect: 1, cascadeDelete: true },
      // Lados do dado: 2, 4, 6, 8, 10, 12 ou 20. O hook recusa os outros números.
      { type: 'number', name: 'lados', required: true, onlyInt: true, min: 2, max: 20 },
      { type: 'number', name: 'resultado', required: true, onlyInt: true, min: 1, max: 20 },
      { type: 'autodate', name: 'created', onCreate: true },
    ],
    indexes: [
      // O app lê as rolagens mais novas da campanha.
      `CREATE INDEX \`idx_${nome}_campanha\` ON \`${nome}\` (\`campanha\`, \`created\`)`,
      // Para a limpeza das rolagens antigas.
      `CREATE INDEX \`idx_${nome}_created\` ON \`${nome}\` (\`created\`)`,
    ],
    listRule: quemVe,
    viewRule: quemVe,
    createRule: `${quemVe} && ${SO_O_DADO}`,
    // Rolagem feita não muda nem some pelo app. Só a limpeza apaga as antigas.
    updateRule: null,
    deleteRule: null,
  })
}

migrate((app) => {
  // Todos da campanha veem e fazem rolagens abertas.
  app.save(colecaoDeRolagens(app, 'rolagens', PARTICIPA_DA_CAMPANHA))
  // Só os mestres da campanha veem e fazem rolagens secretas.
  app.save(colecaoDeRolagens(app, 'rolagens_secretas', MESTRE_DA_CAMPANHA))
}, (app) => {
  for (const nome of ['rolagens_secretas', 'rolagens']) {
    app.delete(app.findCollectionByNameOrId(nome))
  }
})
