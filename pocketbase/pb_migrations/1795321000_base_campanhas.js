/// <reference path="../pb_data/types.d.ts" />

// Base do servidor: contas, campanhas e participantes (mestre ou jogador).
// As regras de acesso moram aqui, e não no painel, porque o repositório é público e o
// servidor fica na internet: toda mudança de regra precisa ser revisada e versionada.
// O porquê de cada regra está em docs/servidor/README.md.

// Quem está logado com uma conta do app (e não como administrador do painel).
const LOGADO = '@request.auth.collectionName = "users"'

// Na coleção campanhas: o usuário participa desta campanha.
const MEMBRO_DA_CAMPANHA = 'participantes_via_campanha.usuario ?= @request.auth.id'

// Na coleção campanhas: o usuário é mestre desta campanha. O alias ":mestre" garante que
// as três condições valem para a mesma participação, e não para participações diferentes.
const MESTRE_DA_CAMPANHA = [
  '@collection.participantes:mestre.campanha ?= id',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')

// Na coleção participantes: o usuário participa da mesma campanha desta participação.
const MEMBRO_DA_MESMA_CAMPANHA = 'campanha.participantes_via_campanha.usuario ?= @request.auth.id'

// Na coleção participantes: o usuário é mestre da campanha indicada por `campo`.
function mestreDe(campo) {
  return [
    `@collection.participantes:mestre.campanha ?= ${campo}`,
    '@collection.participantes:mestre.usuario ?= @request.auth.id',
    '@collection.participantes:mestre.papel ?= "mestre"',
  ].join(' && ')
}

migrate((app) => {
  // Contas
  const usuarios = app.findCollectionByNameOrId('users')
  // Cadastro fechado: o administrador cria a conta de cada pessoa pelo painel.
  usuarios.createRule = null
  // Quem está logado vê o nome dos outros, para o mestre poder escolher quem adicionar.
  // O e-mail continua escondido: o PocketBase só o mostra se a própria pessoa ligar emailVisibility.
  usuarios.listRule = LOGADO
  usuarios.viewRule = LOGADO
  usuarios.updateRule = 'id = @request.auth.id'
  // Conta só se apaga pelo painel, para ninguém sumir das campanhas por engano.
  usuarios.deleteRule = null
  // O servidor não envia e-mails, então o aviso de login em lugar novo só geraria erros no log.
  usuarios.authAlert.enabled = false
  // O nome é o que os outros veem no lugar do e-mail.
  const nome = usuarios.fields.getByName('name')
  nome.required = true
  nome.max = 60
  app.save(usuarios)

  // Campanhas. Nasce sem regras (só o administrador) porque as regras citam a coleção
  // participantes, que ainda não existe. Elas entram logo abaixo.
  const campanhas = new Collection({
    type: 'base',
    name: 'campanhas',
    fields: [
      { type: 'text', name: 'nome', required: true, max: 80, presentable: true },
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ],
  })
  app.save(campanhas)

  // Participantes: quem está em cada campanha e com que papel.
  const participantes = new Collection({
    type: 'base',
    name: 'participantes',
    fields: [
      // Apagar a campanha ou a conta apaga as participações junto.
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: 'relation', name: 'usuario', collectionId: usuarios.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: 'select', name: 'papel', values: ['mestre', 'jogador'], required: true, maxSelect: 1 },
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ],
    indexes: [
      // Cada pessoa entra uma vez só em cada campanha.
      'CREATE UNIQUE INDEX `idx_participantes_campanha_usuario` ON `participantes` (`campanha`, `usuario`)',
      'CREATE INDEX `idx_participantes_usuario` ON `participantes` (`usuario`)',
    ],
  })
  // Só quem participa vê a lista de participantes da campanha.
  participantes.listRule = MEMBRO_DA_MESMA_CAMPANHA
  participantes.viewRule = MEMBRO_DA_MESMA_CAMPANHA
  // Só mestre adiciona gente. A primeira participação (o criador como mestre) vem do hook
  // pb_hooks/campanhas.pb.js, que não passa por esta regra.
  participantes.createRule = mestreDe('@request.body.campanha')
  // Só mestre troca papéis, e ninguém muda uma participação de campanha ou de pessoa.
  participantes.updateRule = [
    mestreDe('campanha'),
    '@request.body.campanha:changed = false',
    '@request.body.usuario:changed = false',
  ].join(' && ')
  // Mestre tira qualquer um, e cada pessoa pode sair sozinha. O hook impede tirar o último mestre.
  participantes.deleteRule = `(${mestreDe('campanha')}) || usuario = @request.auth.id`
  app.save(participantes)

  campanhas.listRule = MEMBRO_DA_CAMPANHA
  campanhas.viewRule = MEMBRO_DA_CAMPANHA
  // Qualquer conta do app cria campanha e vira mestre dela (ver o hook).
  campanhas.createRule = LOGADO
  campanhas.updateRule = MESTRE_DA_CAMPANHA
  campanhas.deleteRule = MESTRE_DA_CAMPANHA
  app.save(campanhas)
}, (app) => {
  app.delete(app.findCollectionByNameOrId('participantes'))
  app.delete(app.findCollectionByNameOrId('campanhas'))

  // Volta a coleção de contas ao padrão de uma instalação nova do PocketBase.
  const usuarios = app.findCollectionByNameOrId('users')
  usuarios.createRule = ''
  usuarios.listRule = 'id = @request.auth.id'
  usuarios.viewRule = 'id = @request.auth.id'
  usuarios.updateRule = 'id = @request.auth.id'
  usuarios.deleteRule = 'id = @request.auth.id'
  usuarios.authAlert.enabled = true
  const nome = usuarios.fields.getByName('name')
  nome.required = false
  nome.max = 255
  app.save(usuarios)
})
