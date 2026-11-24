# Contratos entre áreas

O que uma área oferece para as outras. Mudar qualquer item daqui afeta mais de uma pessoa: o Claude analisa os riscos, avisa antes, atualiza este arquivo no mesmo pull request e explica a mudança na descrição.

## Telas (núcleo e todas as áreas)

Arquivo: `app/src/nucleo/telas.ts`

Cada área cria `app/src/<area>/tela.ts` exportando:

```ts
export const tela: DefinicaoTela = {
  id: 'mapa',          // estável, sem acento. Fica salvo como última tela aberta
  nome: 'Mapa',        // texto da aba
  ordem: 20,           // posição da aba: 10, 20, 30...
  Componente: MapaHex, // ocupa todo o espaço abaixo das abas
}
```

O `tela.ts` importa o CSS da própria área. Ordens em uso: fichas 10, mapa 20, campanha 30.

## Tema (núcleo e todas as áreas)

Arquivos: `app/src/nucleo/tema.css` e `app/src/nucleo/aparencia.ts`

- Variáveis da interface: `--ui-papel`, `--ui-papel-2`, `--ui-papel-3`, `--ui-campo`, `--ui-linha`, `--ui-tinta`, `--ui-tinta-2`, `--feltro`, `--feltro-escuro`, `--acento`, `--acento-forte`, `--acento-suave`, `--perigo`, `--perigo-suave`, `--ui-fonte` e `--ui-mono`. Todas mudam sozinhas no tema escuro.
- Botões comuns: `.botao-icone` (com `--perigo`), `.botao-topo` (com `--principal`), `.grupo-botoes` e `.espaco`.
- `useAparencia()` devolve `{ tema, escuro, folhaClara, mudar }` e é o mesmo estado em todas as telas. O botão de tema fica na barra de abas.

Remover ou renomear uma variável ou classe daqui quebra as outras áreas.

## Mapa e servidor

Arquivos: `app/src/mapa/repositorio.ts` e `app/src/mapa/tipos.ts` (área do mapa). Detalhes em `docs/mapa/manual.md`, seção "Ligar o servidor".

```ts
interface RepositorioMapa {
  carregarChunk(chaveDoChunk: string): Promise<Hexagono[]>
  carregarRegioes(): Promise<Regiao[]>
  aplicar(lote: Lote): Promise<void>
  assinar(ouvinte: (lote: Lote) => void): () => void
  // Opcional: o mapa inteiro, inclusive chunks que ninguém abriu. Serve à exportação e ao modo substituir da importação.
  exportarTudo?(): Promise<{ hexagonos: Hexagono[]; regioes: Regiao[] }>
  // Opcionais: sem eles o token do grupo vive só na memória de cada cliente.
  carregarToken?(): Promise<TokenGrupo | null>
  gravarToken?(token: TokenGrupo | null): Promise<void>
  assinarToken?(ouvinte: (token: TokenGrupo | null) => void): () => void
}
```

- `Hexagono` tem `rios: number[]` e `estradas: number[]`: direções de aresta 0 (leste), 1 (sudeste) e 2 (sudoeste) em que há rio ou estrada saindo daquele hexágono. A aresta pertence ao hexágono dono (`arestaCanonica`). Dado antigo sem os campos vale como lista vazia.
- `exportarTudo` é opcional. Sem ele, exportar leva só o que está carregado e o modo substituir da importação fica indisponível (mesclar funciona). Com servidor, o `RepositorioPocketBase` lista todos os hexágonos e regiões públicos do mapa. A camada do mestre sai à parte, em `exportarCamadaMestre`, só para o mestre.
- `TokenGrupo` é `{ q, r, ts, autor }`. O controlador aplica o que o repositório entrega, na ordem de chegada, sem comparar `ts` com o relógio do aparelho. Não passa por `aplicar` nem entra no desfazer.
- O servidor implementa `RepositorioPocketBase` em `app/src/servidor/`.
- `aplicar` é atômico por lote. `assinar` entrega lotes de outros clientes, e o próprio eco é ignorado pelo `id` do lote.
- A ordem em que os lotes chegam do servidor é a verdade.
- Um chunk que falhou ao carregar não pode ser gravado como vazio por cima do verdadeiro.
- A camada privada do mestre fica em coleções separadas, protegidas no servidor.
- **Lote:** além de `id`, `autor`, `ts`, `mudancas` e `regioes`, o `Lote` tem três campos opcionais, combinados em 22/11/2026:
  - `tipo`: `edicao` (o padrão, quando falta), `importacao` (só do mestre) ou `reversao`
  - `alvoId`: na reversão, o id do lote desfeito. O de outra pessoa, só o mestre desfaz.
  - `privado`: só o mestre manda. É `{ ocultos: Mudanca[]; notas: MudancaNota[] }`, e `MudancaNota` segue a convenção de `Mudanca` com `NotaPrivada` (`{ q, r, texto, rev }`) no antes e no depois. Revelar é um lote só: o hexágono entra em `mudancas` e sai de `privado.ocultos`.
- **Chunk:** o tamanho do chunk (`TAMANHO_CHUNK = 16`) e o formato da chave (`chaveChunk`: `Math.floor(q / 16)` e `Math.floor(r / 16)`, juntos como `"cq,cr"`, sem `-0`) são contrato entre mapa e servidor. O servidor calcula a chave de cada hexágono do mesmo jeito (`pocketbase/pb_hooks/mapa.js`), e o `carregarChunk` pede por ela. Mudar qualquer um dos dois exige mudar o outro e migrar os hexágonos do servidor. Os casos com negativos conferidos pelos dois lados ficam em `app/src/servidor/casos-chunk.json`.
- **Validação:** o `RepositorioPocketBase` valida o que chega do servidor com `normalizarHexagono`, `normalizarRegiao` e `normalizarToken` de `app/src/mapa/armazenamento.ts`, as mesmas que o mapa usa no navegador. Mudar o que elas aceitam muda também o que vem do servidor.

### O que o servidor oferece ao mapa

Arquivos: `app/src/servidor/conexao.ts` e `app/src/servidor/repositorio-mapa.ts` (área do servidor). Detalhes em `docs/servidor/README.md`, seção "Mapa".

```ts
abrirRepositorioMapa(): RepositorioPocketBase | null  // mapa da campanha aberta, ou null sem login ou sem campanha

class RepositorioPocketBase implements RepositorioMapa {
  // tudo da RepositorioMapa, inclusive exportarTudo e os três métodos do token, e mais:
  readonly campanhaId: string
  readonly papel: 'mestre' | 'jogador'
  readonly ehMestre: boolean
  readonly fechado: boolean        // fechado ao trocar de campanha ou de papel, sair ou trocar de servidor
  readonly desatualizado: boolean  // faltou um lote que o servidor já apagou
  aoDesatualizar(ouvinte: () => void): () => void
  fechar(): Promise<void>
  // camada do mestre: para jogadores, devolvem vazio sem perguntar ao servidor
  carregarChunkOculto(chaveDoChunk: string): Promise<Hexagono[]>
  carregarNotasPrivadas(chaveDoChunk: string): Promise<NotaPrivada[]>
  exportarCamadaMestre(): Promise<{ ocultos: Hexagono[]; notas: NotaPrivada[] }>
  // trava do mapa
  carregarPermissao(): Promise<'todos' | 'mestre'>
  gravarPermissao(permissao: 'todos' | 'mestre'): Promise<void>  // só o mestre consegue
  assinarPermissao(ouvinte: (permissao: 'todos' | 'mestre') => void): () => void
}
```

- Um mapa por campanha, por enquanto. Quem participa da campanha lê e edita, a não ser que o mestre trave o mapa (`permissao` igual a `mestre`): aí o servidor recusa as edições dos outros. O token do grupo continua livre.
- **Camada do mestre:** para o mestre, `assinar` entrega também a parte privada dos lotes, como um lote à parte com o mesmo `id`, só com `privado` (`mudancas` e `regioes` vazias). Um lote com as duas partes chega ao mestre em dois pedaços, e o eco do próprio lote também: o controlador precisa reconhecer o mesmo `id` nas duas partes. Jogadores nunca recebem a parte privada. A parte pública e a privada têm numerações separadas, e cada uma chega na ordem dela.
- **Permissões que o servidor confere:** parte privada, importação e trava são só do mestre. Reversão de lote de outra pessoa, só do mestre, e o jogador não desfaz um lote que já saiu do histórico de 7 dias. A recusa chega como erro de `aplicar`, com a mensagem do servidor ("o servidor recusou: só o mestre importa mapas.").
- `assinar` entrega todos os lotes na ordem do servidor, inclusive o eco do próprio lote (o controlador ignora pelo `id`). Nenhum lote é entregue duas vezes nem fora de ordem: se falta um, o repositório busca no servidor antes de seguir.
- `aplicar` com um lote já gravado (mesmo `id`) dá certo e não aplica de novo.
- O autor de lotes e do token é o id da conta logada, posto pelo servidor. O controlador deve usar `useServidor().usuario.id` como autor, para o desfazer e o eco baterem.
- `carregarChunk`, `carregarRegioes`, `exportarTudo` e o token falham com um `Error` quando o servidor não responde ou recusa. A mensagem diz a causa e o que fazer, em minúscula, para vir depois do que o mapa tentava.
- Lotes com mais de 7 dias são apagados no servidor. Se o repositório precisar de um deles, ele para de entregar lotes, fica `desatualizado`, avisa `aoDesatualizar`, e a leitura passa a falhar pedindo para recarregar o mapa. Quem usa cria um repositório e um controlador novos.
- Uma edição comum ou reversão tem no máximo 2.000 mudanças, somando hexágonos, ocultos e notas. A importação tem até 20 mil e 16 MB, num lote só. O servidor recusa um item fora do formato e, com ele, o lote inteiro.
- `gravarToken(null)` grava a hora de quem tirou o token, e um aviso de token mais velho que o último entregue é ignorado.
- **Do lado do mapa (controlador):** com o servidor, as edições do próprio cliente que ainda não voltaram como eco são reaplicadas por cima de lote de outra pessoa que chegue antes delas. Um lote que chega com o `id` de um lote enviado é eco, inclusive o segundo pedaço do lote do mestre. Um `aplicar` que falha desfaz a edição na tela. Chunk e regiões que falham são pedidos de novo, nunca tratados como vazios.
- **Testes contra o servidor de verdade:** um teste do mapa que precise do PocketBase usa os ajudantes de `app/src/servidor/teste-servidor.ts` (`entrarComoTeste`, `campanhaDeTeste` e `instalarEventSource`) e o nome do arquivo termina em `.servidor.test.ts`. Ele roda contra o `pocketbase/servidor-de-teste.mjs` na verificação do GitHub e é pulado no `npm test` comum. Detalhes em `docs/servidor/README.md`, seção "Servidor de teste".

## Campanhas e papéis (servidor)

Arquivos: `pocketbase/pb_migrations/1795321000_base_campanhas.js` e `pocketbase/pb_hooks/campanhas.pb.js` (área do servidor). Detalhes em `docs/servidor/README.md`.

- Coleções: `users` (`name`), `campanhas` (`nome`) e `participantes` (`campanha`, `usuario`, `papel`, que é `mestre` ou `jogador`).
- Uma participação nunca muda de campanha nem de pessoa. Para trocar, apague e crie outra.
- Toda campanha tem pelo menos um mestre, e pode ter vários.
- Coleções de outras áreas ligadas a uma campanha (por exemplo, um mapa com o campo `campanha`) reaproveitam estas regras:

```
// é participante da campanha
campanha.participantes_via_campanha.usuario ?= @request.auth.id

// é mestre da campanha
@collection.participantes:mestre.campanha ?= campanha && @collection.participantes:mestre.usuario ?= @request.auth.id && @collection.participantes:mestre.papel ?= "mestre"
```

O alias `:mestre` faz as três condições valerem para a mesma participação. Sem ele, quem é mestre em uma campanha e jogador em outra passaria como mestre nas duas. Toda regra nova ganha verificação em `pocketbase/testar-regras.mjs`.

## Sessão e campanha aberta (servidor, lado do app)

Arquivos: `app/src/servidor/conexao.ts` e `app/src/servidor/tipos.ts` (área do servidor).

```ts
useServidor(): EstadoServidor  // hook React, atualiza sozinho e, na primeira vez, retoma a sessão guardada
// campos que as outras áreas podem usar:
//   fase: 'iniciando' | 'desconectado' | 'entrando' | 'conectado'
//   usuario: { id, nome } | null
//   campanhaAtualId: string | null
//   campanhas: { id, nome, papel: 'mestre' | 'jogador' }[]
```

- A campanha aberta é a que a pessoa escolheu na aba Campanha. O mapa e as fichas no servidor devem trabalhar nela.
- Fora da área do servidor, ninguém importa o SDK do PocketBase nem chama métodos de `conexao`: a leitura é só pelo `useServidor()`. O que mais for preciso (como o `RepositorioPocketBase` e o `RepositorioDadosPocketBase`) a área do servidor oferece.
- Sem login (`fase` diferente de `conectado`), as fichas e o mapa continuam funcionando só no navegador.

## Dados e servidor

Arquivos: `app/src/dados/tipos.ts` e `app/src/dados/repositorio.ts` (área dos dados), `app/src/servidor/repositorio-dados.ts` e `abrirRepositorioDados()` em `app/src/servidor/conexao.ts` (área do servidor). Os dois lados são do Pedro.

```ts
const LADOS = [2, 4, 6, 8, 10, 12, 20]   // os dados que existem, um botão para cada

interface Rolagem {
  id: string
  autorId: string     // conta de quem rolou. Vazio na rolagem só deste aparelho
  lados: 2 | 4 | 6 | 8 | 10 | 12 | 20
  resultado: number   // de 1 a lados
  quando: number      // milissegundos desde 1970
  secreta: boolean    // só os mestres veem
}

interface RepositorioDados {
  readonly compartilhado: boolean        // da campanha (servidor) ou só deste aparelho
  readonly podeRolarEmSegredo: boolean   // é mestre da campanha
  rolar(lados, opcoes?: { secreta?: boolean }): Promise<Rolagem>
  recentes(quantas: number): Promise<Rolagem[]>   // da mais nova para a mais velha
  assinar(ouvinte: (rolagem: Rolagem) => void): () => void
  fechar(): Promise<void>
}

abrirRepositorioDados(): RepositorioDadosPocketBase | null   // da campanha aberta, ou null
```

- Quem sorteia é o repositório: o servidor, na campanha, ou o gerador criptográfico do navegador, na rolagem local (`RepositorioDadosLocal`, em `app/src/dados/local.ts`). Ninguém fora dele escolhe um resultado.
- `assinar` avisa toda rolagem nova, inclusive as próprias, e pode avisar a mesma mais de uma vez (a resposta, o eco do tempo real e a busca depois de reconectar). Quem ouve junta pelo id.
- Os erros de `rolar` e `recentes` dizem a causa e o que fazer, começando em minúscula. Quem mostra põe antes o que tentava: "Não consegui rolar: ...".
- Rolagem secreta de quem não é mestre falha sem perguntar ao servidor, e o servidor recusa do mesmo jeito.
- Trocar de campanha, sair, trocar de servidor ou mudar de papel fecha o repositório do servidor. Quem usa abre outro.
- A ficha, quando ganhar botões de rolagem (`roll@forca`, no roteiro), pode usar este mesmo contrato.

## Quadro e servidor

Arquivos: `app/src/quadro/tipos.ts` e `app/src/quadro/repositorio.ts` (área do quadro), `app/src/servidor/repositorio-quadro.ts` e `abrirRepositorioQuadro()` em `app/src/servidor/conexao.ts` (área do servidor). Os dois lados são do Pedro.

```ts
const LARGURA_QUADRO = 3200, ALTURA_QUADRO = 2000   // a posição de um item é o centro dele
const CORES_NOTA = ['amarelo', 'rosa', 'azul', 'verde', 'branco']

interface ImagemQuadro { id, autorId, nome, arquivo, largura, altura, bytes, enviada }
interface Posicao { x, y, largura, rotacao, z }
type ItemQuadro =
  | { id, autorId, tipo: 'imagem', imagemId, ...Posicao }
  | { id, autorId, tipo: 'nota', texto, cor, ...Posicao }

interface RepositorioQuadro {
  readonly ehMestre: boolean
  carregar(): Promise<{ imagens, itens }>
  assinar(ouvinte: (evento: EventoQuadro) => void): () => void   // imagem, imagemApagada, item, itemApagado, tudo
  enviarImagem(arquivo: Blob, info: { nome, nomeArquivo, largura, altura }): Promise<ImagemQuadro>
  renomearImagem(id, nome), apagarImagem(id)
  urlDaImagem(imagem, 'miniatura' | 'inteira'): Promise<string>   // endereço blob:, válido até fechar
  criarItem(novo), moverItem(id, posicao), editarNota(id, { texto?, cor? }), tirarItem(id)
  fechar(): Promise<void>
}

abrirRepositorioQuadro(): RepositorioQuadroPocketBase | null   // da campanha aberta, ou null
```

- O quadro existe só no servidor: sem campanha aberta, não há repositório.
- Limites que o servidor confere: imagem PNG, JPEG ou WebP de até 2 MB e 4096 px de lado, 50 MB por campanha, nota de até 500 caracteres, nome de imagem de até 80, largura de item de 60 a 1600, rotação de até 10 graus para cada lado e posição dentro do quadro. Estão em `LIMITES_QUADRO`.
- `assinar` avisa também o que a própria pessoa fez, às vezes duas vezes (resposta e eco). Quem ouve junta pelo id. O evento `tudo` substitui o quadro inteiro.
- Os erros dizem a causa e o que fazer, começando em minúscula. Quem mostra põe antes o que tentava: "Não consegui mover: ...".
- Trocar de campanha, sair, trocar de servidor ou mudar de papel fecha o repositório. Quem usa abre outro.

## Configuração

- `VITE_POCKETBASE_URL`: endereço padrão do PocketBase (modelo em `app/.env.example`). A pessoa pode trocar na tela de login, e o app guarda o endereço escolhido no navegador.
- Parâmetros no endereço do site: `?servidor=` (área do servidor, link de convite) e `?tileset=` (área do mapa). A área do servidor lê e tira só o `?servidor=`, sem mexer nos outros.
