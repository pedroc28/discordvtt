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
- `exportarTudo` é opcional. Sem ele, exportar leva só o que está carregado e o modo substituir da importação fica indisponível (mesclar funciona). Com servidor, o `RepositorioPocketBase` deve listar todos os hexágonos e regiões do mapa nele, respeitando a camada privada do mestre (um jogador não exporta o que não vê).
- `TokenGrupo` é `{ q, r, ts, autor }`. Vale o `ts` mais recente. Não passa por `aplicar` nem entra no desfazer.
- O servidor implementa `RepositorioPocketBase` em `app/src/servidor/`.
- `aplicar` é atômico por lote. `assinar` entrega lotes de outros clientes, e o próprio eco é ignorado pelo `id` do lote.
- A ordem em que os lotes chegam do servidor é a verdade.
- Um chunk que falhou ao carregar não pode ser gravado como vazio por cima do verdadeiro.
- A camada privada do mestre fica em coleções separadas, protegidas no servidor.
- **Chunk:** o tamanho do chunk (`TAMANHO_CHUNK = 16`) e o formato da chave (`chaveChunk`: `Math.floor(q / 16)` e `Math.floor(r / 16)`, juntos como `"cq,cr"`, sem `-0`) são contrato entre mapa e servidor. O servidor calcula a chave de cada hexágono do mesmo jeito (`pocketbase/pb_hooks/mapa.js`), e o `carregarChunk` pede por ela. Mudar qualquer um dos dois exige mudar o outro e migrar os hexágonos do servidor. Os casos com negativos conferidos pelos dois lados ficam em `app/src/servidor/casos-chunk.json`.
- **Validação:** o `RepositorioPocketBase` valida o que chega do servidor com `normalizarHexagono`, `normalizarRegiao` e `normalizarToken` de `app/src/mapa/armazenamento.ts`, as mesmas que o mapa usa no navegador. Mudar o que elas aceitam muda também o que vem do servidor.

### O que o servidor oferece ao mapa

Arquivos: `app/src/servidor/conexao.ts` e `app/src/servidor/repositorio-mapa.ts` (área do servidor). Detalhes em `docs/servidor/README.md`, seção "Mapa".

```ts
abrirRepositorioMapa(): RepositorioPocketBase | null  // mapa da campanha aberta, ou null sem login ou sem campanha

class RepositorioPocketBase implements RepositorioMapa {
  // tudo da RepositorioMapa, inclusive exportarTudo e os três métodos do token, e mais:
  readonly campanhaId: string
  readonly fechado: boolean        // fechado ao trocar de campanha, sair ou trocar de servidor
  readonly desatualizado: boolean  // faltou um lote que o servidor já apagou
  aoDesatualizar(ouvinte: () => void): () => void
  fechar(): Promise<void>
}
```

- Um mapa por campanha, por enquanto. Quem participa da campanha lê e edita.
- `assinar` entrega todos os lotes na ordem do servidor, inclusive o eco do próprio lote (o controlador ignora pelo `id`). Nenhum lote é entregue duas vezes nem fora de ordem: se falta um, o repositório busca no servidor antes de seguir.
- `aplicar` com um lote já gravado (mesmo `id`) dá certo e não aplica de novo.
- O autor de lotes e do token é o id da conta logada, posto pelo servidor. O controlador deve usar `useServidor().usuario.id` como autor, para o desfazer e o eco baterem.
- `carregarChunk`, `carregarRegioes`, `exportarTudo` e o token falham com um `Error` quando o servidor não responde ou recusa. A mensagem diz a causa e o que fazer, em minúscula, para vir depois do que o mapa tentava.
- Lotes com mais de 7 dias são apagados no servidor. Se o repositório precisar de um deles, ele para de entregar lotes, fica `desatualizado`, avisa `aoDesatualizar`, e a leitura passa a falhar pedindo para recarregar o mapa. Quem usa cria um repositório e um controlador novos.
- Um lote tem no máximo 20 mil hexágonos e 16 MB. O servidor recusa um item fora do formato e, com ele, o lote inteiro.
- `gravarToken(null)` grava a hora de quem tirou o token, e um aviso de token mais velho que o último entregue é ignorado.
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
useServidor(): EstadoServidor  // hook React, atualiza sozinho
// campos que as outras áreas podem usar:
//   fase: 'iniciando' | 'desconectado' | 'entrando' | 'conectado'
//   usuario: { id, nome } | null
//   campanhaAtualId: string | null
//   campanhas: { id, nome, papel: 'mestre' | 'jogador' }[]
```

- A campanha aberta é a que a pessoa escolheu na aba Campanha. O mapa e as fichas no servidor devem trabalhar nela.
- Fora da área do servidor, ninguém importa o SDK do PocketBase nem chama métodos de `conexao`: a leitura é só pelo `useServidor()`. O que mais for preciso (como o `RepositorioPocketBase`) a área do servidor oferece.
- Sem login (`fase` diferente de `conectado`), as fichas e o mapa continuam funcionando só no navegador.

## Configuração

- `VITE_POCKETBASE_URL`: endereço padrão do PocketBase (modelo em `app/.env.example`). A pessoa pode trocar na tela de login, e o app guarda o endereço escolhido no navegador.
- Parâmetros no endereço do site: `?servidor=` (área do servidor, link de convite) e `?tileset=` (área do mapa). A área do servidor lê e tira só o `?servidor=`, sem mexer nos outros.
