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
  aplicar(lote: Lote): Promise<void>
  assinar(ouvinte: (lote: Lote) => void): () => void
  // Opcionais: sem eles o token do grupo vive só na memória de cada cliente.
  carregarToken?(): Promise<TokenGrupo | null>
  gravarToken?(token: TokenGrupo | null): Promise<void>
  assinarToken?(ouvinte: (token: TokenGrupo | null) => void): () => void
}
```

- `Hexagono` tem `rios: number[]` e `estradas: number[]`: direções de aresta 0 (leste), 1 (sudeste) e 2 (sudoeste) em que há rio ou estrada saindo daquele hexágono. A aresta pertence ao hexágono dono (`arestaCanonica`). Dado antigo sem os campos vale como lista vazia.
- `TokenGrupo` é `{ q, r, ts, autor }`. Vale o `ts` mais recente. Não passa por `aplicar` nem entra no desfazer.
- O servidor implementa `RepositorioPocketBase` em `app/src/servidor/`.
- `aplicar` é atômico por lote. `assinar` entrega lotes de outros clientes, e o próprio eco é ignorado pelo `id` do lote.
- A ordem em que os lotes chegam do servidor é a verdade.
- Um chunk que falhou ao carregar não pode ser gravado como vazio por cima do verdadeiro.
- A camada privada do mestre fica em coleções separadas, protegidas no servidor.

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
