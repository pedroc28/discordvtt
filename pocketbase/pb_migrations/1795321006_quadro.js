/// <reference path="../pb_data/types.d.ts" />

// Quadro de cortiça de cada campanha: a biblioteca de imagens e os itens presos no quadro (imagens e
// notas). O porquê de cada regra está em docs/servidor/README.md, seção "Quadro".
//
// - As imagens são arquivos protegidos: só quem participa da campanha abre, mesmo com o link.
// - O servidor preenche quem enviou e o tamanho em bytes, e confere o limite da campanha
//   (pb_hooks/quadro.pb.js). O pedido não consegue mandar esses campos.
// - Todos movem qualquer item. A nota só quem escreveu edita. Tirar do quadro: quem pôs ou o mestre.

// Na coleção com o campo `campanha`: o usuário participa dela.
const PARTICIPA = 'campanha.participantes_via_campanha.usuario ?= @request.auth.id'

// Na coleção com o campo `campanha`: o usuário é mestre dela. O alias ":mestre" garante que as três
// condições valem para a mesma participação.
const MESTRE = [
  '@collection.participantes:mestre.campanha ?= campanha',
  '@collection.participantes:mestre.usuario ?= @request.auth.id',
  '@collection.participantes:mestre.papel ?= "mestre"',
].join(' && ')

// Quem fez (e ainda participa) ou o mestre.
const AUTOR_OU_MESTRE = `(${PARTICIPA} && autor = @request.auth.id) || (${MESTRE})`

// Tamanho do quadro, em unidades do app. É contrato com a aba Quadro (app/src/quadro/tipos.ts).
const LARGURA_QUADRO = 3200
const ALTURA_QUADRO = 2000

// Depois de o app reduzir a imagem (lado maior de 1600 px), ela fica perto de 1 MB no pior caso.
const TAMANHO_MAXIMO = 2 * 1024 * 1024

const CORES_NOTA = ['amarelo', 'rosa', 'azul', 'verde', 'branco']

const datas = () => [
  { type: 'autodate', name: 'created', onCreate: true },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
]

migrate((app) => {
  const campanhas = app.findCollectionByNameOrId('campanhas')
  const usuarios = app.findCollectionByNameOrId('users')

  const imagens = new Collection({
    type: 'base',
    name: 'quadro_imagens',
    fields: [
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      // Quem enviou. Se a conta for apagada, a imagem fica com a campanha, sem autor.
      { type: 'relation', name: 'autor', collectionId: usuarios.id, maxSelect: 1, cascadeDelete: false },
      {
        type: 'file',
        name: 'arquivo',
        required: true,
        maxSelect: 1,
        maxSize: TAMANHO_MAXIMO,
        // O PocketBase confere o tipo pelo conteúdo do arquivo, não pelo nome. SVG fica de fora:
        // pode carregar código.
        mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        // A miniatura é a que aparece no quadro e na biblioteca. A imagem inteira, só ao abrir.
        thumbs: ['320x0'],
        protected: true,
      },
      { type: 'text', name: 'nome', max: 80 },
      // Tamanho do arquivo, para o limite de espaço da campanha. O hook preenche.
      { type: 'number', name: 'bytes', required: true, onlyInt: true, min: 1, max: TAMANHO_MAXIMO },
      // Dimensões da imagem, para o quadro reservar o espaço antes de ela carregar.
      { type: 'number', name: 'largura', required: true, onlyInt: true, min: 1, max: 4096 },
      { type: 'number', name: 'altura', required: true, onlyInt: true, min: 1, max: 4096 },
      ...datas(),
    ],
    indexes: ['CREATE INDEX `idx_quadro_imagens_campanha` ON `quadro_imagens` (`campanha`, `created`)'],
    listRule: PARTICIPA,
    viewRule: PARTICIPA,
    createRule: `${PARTICIPA} && @request.body.autor:isset = false && @request.body.bytes:isset = false`,
    // Só o nome muda: o hook recusa o resto.
    updateRule: AUTOR_OU_MESTRE,
    deleteRule: AUTOR_OU_MESTRE,
  })
  app.save(imagens)

  const itens = new Collection({
    type: 'base',
    name: 'quadro_itens',
    fields: [
      { type: 'relation', name: 'campanha', collectionId: campanhas.id, required: true, maxSelect: 1, cascadeDelete: true },
      { type: 'relation', name: 'autor', collectionId: usuarios.id, maxSelect: 1, cascadeDelete: false },
      { type: 'select', name: 'tipo', required: true, maxSelect: 1, values: ['imagem', 'nota'] },
      // Apagar a imagem da biblioteca tira ela do quadro.
      { type: 'relation', name: 'imagem', collectionId: imagens.id, maxSelect: 1, cascadeDelete: true },
      { type: 'text', name: 'texto', max: 500 },
      { type: 'select', name: 'cor', maxSelect: 1, values: CORES_NOTA },
      // Centro do item no quadro. Número obrigatório no PocketBase recusa o zero, então x, y e z não são.
      { type: 'number', name: 'x', min: 0, max: LARGURA_QUADRO },
      { type: 'number', name: 'y', min: 0, max: ALTURA_QUADRO },
      { type: 'number', name: 'largura', required: true, min: 60, max: 1600 },
      // Graus. O item entra levemente torto, como num quadro de verdade.
      { type: 'number', name: 'rotacao', min: -10, max: 10 },
      // Ordem de empilhamento: o maior fica por cima.
      { type: 'number', name: 'z', onlyInt: true, min: 0, max: 1000000000 },
      ...datas(),
    ],
    indexes: ['CREATE INDEX `idx_quadro_itens_campanha` ON `quadro_itens` (`campanha`)'],
    listRule: PARTICIPA,
    viewRule: PARTICIPA,
    createRule: `${PARTICIPA} && @request.body.autor:isset = false`,
    // Todos movem qualquer item. Texto e cor da nota, só quem escreveu.
    updateRule: [
      PARTICIPA,
      '@request.body.campanha:changed = false',
      '@request.body.tipo:changed = false',
      '@request.body.imagem:changed = false',
      '@request.body.autor:changed = false',
      '(autor = @request.auth.id || (@request.body.texto:changed = false && @request.body.cor:changed = false))',
    ].join(' && '),
    deleteRule: AUTOR_OU_MESTRE,
  })
  app.save(itens)
}, (app) => {
  for (const nome of ['quadro_itens', 'quadro_imagens']) {
    app.delete(app.findCollectionByNameOrId(nome))
  }
})
