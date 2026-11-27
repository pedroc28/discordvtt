/// <reference path="../pb_data/types.d.ts" />

// Mapa de batalha de cada campanha: várias cenas, com fundo, grade e tokens, e a cena ativa, que é a
// que os jogadores veem. O porquê de cada regra está em docs/servidor/README.md, seção "Batalha".
//
// - A cena ativa fica na campanha (`campanhas.cenaAtiva`). O jogador só lê a cena ativa e os tokens
//   dela: o mestre prepara a próxima luta sem os jogadores verem. Com a marca na campanha, trocar de
//   cena chega a todos pelo tempo real da campanha.
// - Só o mestre cria, edita e apaga cenas e tokens. O jogador só move (x e y) os tokens em que ele é
//   o dono, e só na cena ativa.
// - O fundo é arquivo protegido: abre só com token de arquivo de quem pode ver a cena.
// - O hook (pb_hooks/batalha.pb.js) confere a configuração, os limites de cenas e de tokens, o dono e
//   a cena ativa.

// Na coleção com o campo `campanha`.
const PARTICIPA = 'campanha.participantes_via_campanha.usuario ?= @request.auth.id'
const MESTRE = [
  '@collection.participantes:mestre.campanha ?= campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')
const ATIVA = 'campanha.cenaAtiva = id'

// Na coleção com o campo `cena`.
const PARTICIPA_DA_CENA = 'cena.campanha.participantes_via_campanha.usuario ?= @request.auth.id'
const MESTRE_DA_CENA = [
  '@collection.participantes:mestre.campanha ?= cena.campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')
const CENA_ATIVA = 'cena.campanha.cenaAtiva = cena'
// O pedido do jogador não muda nada além de x e y.
const SO_MOVE = ['idLocal', 'nome', 'tamanho', 'cor', 'dono'].map((campo) => `@request.body.${campo}:changed = false`).join(' && ')

// O app reduz o fundo para 4096 px no lado maior. Pixel art fica como veio, por isso o limite é folgado.
const TAMANHO_MAXIMO_FUNDO = 15 * 1024 * 1024
const COORDENADA = 1000000

const datas = () => [
  { type: 'autodate', name: 'created', onCreate: true },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
]

migrate((app) => {
  const campanhas = app.findCollectionByNameOrId('campanhas')
  const usuarios = app.findCollectionByNameOrId('users')

  const cenas = new Collection({
    type: 'base',
    name: 'cenas_batalha',
    fields: [
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: 'text', name: 'nome', required: true, max: 60 },
      // Grade, medida, encaixe e tamanho do fundo. Vazio até o mestre gravar: o app usa os padrões.
      { type: 'json', name: 'config', maxSize: 2048 },
      {
        type: 'file',
        name: 'fundo',
        maxSelect: 1,
        maxSize: TAMANHO_MAXIMO_FUNDO,
        // O PocketBase confere o tipo pelo conteúdo do arquivo. SVG fica de fora: pode carregar código.
        mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        protected: true,
      },
      ...datas(),
    ],
    indexes: ['CREATE INDEX `idx_cenas_batalha_campanha` ON `cenas_batalha` (`campanha`)'],
  })
  app.save(cenas)

  // A cena que os jogadores veem. Apagar a cena limpa o campo sozinho. As regras das cenas dependem
  // deste campo, por isso elas entram depois.
  campanhas.fields.add(new RelationField({ name: 'cenaAtiva', collectionId: cenas.id, maxSelect: 1, cascadeDelete: false }))
  app.save(campanhas)

  cenas.listRule = `(${MESTRE}) || (${PARTICIPA} && ${ATIVA})`
  cenas.viewRule = `(${MESTRE}) || (${PARTICIPA} && ${ATIVA})`
  cenas.createRule = MESTRE
  cenas.updateRule = `${MESTRE} && @request.body.campanha:changed = false`
  cenas.deleteRule = MESTRE
  app.save(cenas)

  const tokens = new Collection({
    type: 'base',
    name: 'tokens_batalha',
    fields: [
      { type: 'relation', name: 'cena', collectionId: cenas.id, required: true, maxSelect: 1, cascadeDelete: true },
      // O id que o app já usa, para um arquivo importado manter os mesmos tokens.
      { type: 'text', name: 'idLocal', required: true, max: 64 },
      { type: 'text', name: 'nome', max: 40 },
      // Centro do token, em pixels da imagem. Número obrigatório recusa o zero, então x e y não são.
      { type: 'number', name: 'x', min: -COORDENADA, max: COORDENADA },
      { type: 'number', name: 'y', min: -COORDENADA, max: COORDENADA },
      // Em células: 1 ocupa uma célula.
      { type: 'number', name: 'tamanho', required: true, min: 0.5, max: 10 },
      { type: 'text', name: 'cor', required: true, pattern: '^#[0-9a-fA-F]{6}$' },
      // Quem pode mover o token, além do mestre. Se a conta for apagada, o token fica sem dono.
      { type: 'relation', name: 'dono', collectionId: usuarios.id, maxSelect: 1, cascadeDelete: false },
      ...datas(),
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_tokens_batalha_cena_id` ON `tokens_batalha` (`cena`, `idLocal`)'],
    listRule: `(${MESTRE_DA_CENA}) || (${PARTICIPA_DA_CENA} && ${CENA_ATIVA})`,
    viewRule: `(${MESTRE_DA_CENA}) || (${PARTICIPA_DA_CENA} && ${CENA_ATIVA})`,
    createRule: MESTRE_DA_CENA,
    // O mestre muda tudo. O dono só move, e só na cena ativa.
    updateRule: `@request.body.cena:changed = false && ((${MESTRE_DA_CENA}) || (dono = @request.auth.id && ${PARTICIPA_DA_CENA} && ${CENA_ATIVA} && ${SO_MOVE}))`,
    deleteRule: MESTRE_DA_CENA,
  })
  app.save(tokens)
}, (app) => {
  const campanhas = app.findCollectionByNameOrId('campanhas')
  campanhas.fields.removeByName('cenaAtiva')
  app.save(campanhas)
  for (const nome of ['tokens_batalha', 'cenas_batalha']) {
    app.delete(app.findCollectionByNameOrId(nome))
  }
})
