# Mapa hexagonal infinito

Mapa compartilhado, construído pelos jogadores: terreno, nome e nota por hexágono, regiões, marcadores, rios, estradas, token do grupo e régua de distância. Pensado desde o começo para vários jogadores ao mesmo tempo, no computador e no celular.

Este é o manual do módulo. O histórico do projeto (decisões, o que foi feito por fase, problemas achados e próximos passos) está em [`diario.md`](diario.md).

Tudo roda sem servidor por enquanto: o mapa fica no IndexedDB do navegador, e abas abertas ao mesmo tempo se comportam como jogadores diferentes (assim o caminho de sincronização já é exercitado).

## Usar

Aba **Mapa**, no topo do app.

| Ação | Desktop | Celular |
| --- | --- | --- |
| Pintar | ferramenta Pintar (B), clique ou arraste | ferramenta Pintar, toque ou arraste |
| Apagar | ferramenta Apagar (E) | ferramenta Apagar |
| Mover o mapa | ferramenta Navegar (V), ou botão do meio / direito / Espaço + arrastar | arraste com a ferramenta Navegar, ou **dois dedos em qualquer ferramenta** |
| Zoom | roda do mouse, + e − | pinça |
| Selecionar hexágono | clique com Navegar | toque com Navegar |
| Nome, terreno, região, marcadores e nota | painel à direita do hexágono selecionado | painel que sobe da base (o mapa se ajusta para o hexágono não ficar escondido) |
| Pintar região | ferramenta Região (R): escolha ou crie uma região na lista e pinte os hexágonos que já existem. "Sem região" tira hexágonos da região | idem |
| Editar região | lápis ao lado dela na lista: nome, cor, "faz parte de" (reino › província), descrição e exclusão | idem |
| Colocar marcador | ferramenta Marcador (M): escolha o ícone e toque no hexágono (ele precisa ter terreno) | idem |
| Desenhar rio | ferramenta Rio (I): arraste pelas bordas dos hexágonos. A borda mais perto do cursor ganha o rio (ela aparece destacada antes). O modo "Tirar" apaga | idem |
| Desenhar estrada | ferramenta Estrada (D): arraste de hexágono em hexágono, e a estrada liga o centro de um ao do vizinho. Modo "Tirar" apaga | idem |
| Token do grupo | ferramenta Token (T): toque num hexágono e o token vai para lá, para todos. "Ir até o token" centraliza o mapa, "Tirar o token" o remove | idem |
| Medir distância | ferramenta Régua (L): toque no começo e no fim, e o mapa mostra a distância em hexágonos. Um terceiro toque recomeça, Esc limpa | idem |
| Esconder as cores das regiões | botão do olho | idem |
| Tamanho do pincel | 1, 7 ou 19 hexágonos (teclas `[` e `]`) | idem |
| Desfazer, refazer | Ctrl+Z, Ctrl+Shift+Z | botões |
| Grade, início | G, 0 | botões |

Desfazer é **por jogador**: só desfaz o que você fez, e pula hexágonos que outra pessoa mexeu depois (o app avisa quantos). Uma risca de rio ou de estrada é um passo só. Mover o token e a régua **não** entram no desfazer.

## Padrões

**Geometria** (`hex.ts`). Hexágonos *pointy-top* (ponta para cima), coordenadas axiais `(q, r)`: `q` cresce para leste, `r` para sudeste. A chave de um hexágono é `"q,r"`. As 6 direções, em sentido horário a partir do leste, são um contrato: arestas e cantos usam a mesma ordem.

**Mapa esparso e chunks.** Só existe o que foi construído. Os hexágonos são agrupados em *chunks* de 16×16 coordenadas axiais (`chunkDe`), que são a unidade de carregar, guardar e, no futuro, sincronizar. O renderizador só pede ao controlador os chunks da área visível.

**Arestas, rios e estradas.** Rios e estradas passam pelas arestas. Cada aresta é compartilhada por dois hexágonos, então só o "dono" a identifica: a aresta leste, sudeste ou sudoeste de cada hexágono (`arestaCanonica`). As outras três pertencem ao vizinho. O dado fica **dentro do hexágono dono**, nos campos `rios` e `estradas` (listas de direções 0, 1 e 2), como os marcadores: apagar o hexágono leva o que é dele, e o desfazer traz de volta. O rio é desenhado na borda, a estrada liga os centros dos dois hexágonos. **Só se liga onde os dois hexágonos da aresta existem**, e só aparece enquanto os dois existirem (se um for apagado, o dado fica guardado e volta se ele for pintado de novo). Tirar é sempre permitido. Pintar o terreno de um hexágono mantém os rios e estradas dele. O traço do rio escolhe a aresta mais próxima do cursor (`arestaMaisProxima`) e amostra o caminho do dedo em passos curtos (`arestasEntrePontos`), e o da estrada segue os hexágonos pelos quais o dedo passa (`arestasDoCaminho`).

**Token do grupo.** Mostra onde o grupo está: o sprite `token` do tileset (no tileset `pixel`, três aventureiros sobre uma base) ou, se o tileset não tem, um alfinete desenhado em código. É estado pequeno e muito mutável, então **não é um lote**: não entra no desfazer e vale o mais recente (`ts`). O `RepositorioMapa` o guarda por três métodos opcionais (`carregarToken`, `gravarToken`, `assinarToken`). O repositório local usa um registro no IndexedDB e um segundo BroadcastChannel (`discordvtt-mapa:principal:token`). Sem esses métodos, o token existe só na memória.

**Régua.** Só local: dois toques medem a distância em hexágonos (`regua.ts`, usando `distancia` e `linha`). Não é guardada nem sincronizada. Converter para quilômetros fica para quando o mapa tiver escala numérica (hoje `MapaMeta.escala` é texto livre).

**Lotes.** Quem edita nunca altera o mapa direto. As operações puras (`operacoes.ts`) devolvem *mudanças* (`antes` e `depois` de cada hexágono), e uma pincelada vira um **lote** (`Lote`). O lote é a unidade de rede, de gravação e de desfazer, e carrega mudanças de hexágonos e de regiões. O desfazer só reverte um item se o conteúdo dele ainda for o que o lote deixou (a revisão `rev` sobe a cada alteração e ordena versões, mas não serve para comparar: desfazer também a sobe). Quem desfaz um passo seu cria outro lote, e refazer é desfazer esse.

**Regiões.** São globais ao mapa (um registro só, não por chunk) e cada hexágono aponta para no máximo uma (`regiaoId`). Uma região pode fazer parte de outra (`paiId`), e o desenho usa isso: borda grossa entre regiões de topo (reino) e fina entre sub-regiões (província). Excluir uma região **não reescreve os hexágonos** (podem estar em chunks não carregados): um `regiaoId` sem região correspondente conta como "sem região", e desfazer a exclusão devolve a região com todos os seus hexágonos. Ciclos de `paiId` são recusados.

**Marcadores.** Moram dentro do hexágono (`marcadores`), então apagar o hexágono leva os marcadores junto e desfazer traz de volta. Dois jogadores editando marcadores do mesmo hexágono ao mesmo tempo disputam o hexágono inteiro (vale o último).

**Digitação.** Nome, nota e descrição só gravam quando a pessoa para de digitar (700 ms) ou sai do campo, e edições seguidas do mesmo campo viram um passo só no desfazer (`grupo`, janela de 2 s).

**Segredo do mestre.** Quando existir a camada privada do mestre (notas e hexágonos ocultos), ela deve ficar em **coleções separadas, protegidas no servidor** (regras de acesso do PocketBase). Esconder só na tela deixaria o dado exposto na rede.

## Organização

```
hex.ts               matemática de hexágonos, chunks e arestas (pura)
camera.ts            posição e zoom da câmera (pura)
tipos.ts             Hexagono, Mudanca, Lote, MapaMeta
operacoes.ts         pintar, editar, regiões, fundir mudanças, desfazer seletivo (puras)
armazem.ts           hexágonos (por chunk) e regiões carregados. É o que o desenho lê
repositorio.ts       interface RepositorioMapa (com os métodos opcionais do token) + versão em memória
repositorio-local.ts IndexedDB + BroadcastChannel (avisa as outras abas)
controlador.ts       junta tudo: traço, histórico por jogador, lotes recebidos
tileset.ts           carrega o tileset (manifesto + imagens)
renderizador.ts      desenha no canvas 2D
entrada.ts           mouse, toque e caneta (Pointer Events)
regua.ts             régua de distância (pura)
paleta.ts            pastas e pesquisa por tag da paleta de terrenos (pura)
PaletaTerrenos.tsx   paleta de terrenos com pastas e pesquisa
armazenamento.ts     validação de dados externos e preferências locais
MapaHex.tsx          tela: barra de ferramentas, paletas, canvas, painéis
InspetorHexagono.tsx painel do hexágono (nome, terreno, região, marcadores, nota)
Regioes.tsx          lista de regiões e editor de região
rascunho.ts          hooks: campo de texto que grava ao parar de digitar, versões do armazém
Icones.tsx, mapa.css interface
*.test.ts            testes (Vitest)
```

Tudo até `entrada.ts` não depende de React. `hex`, `camera`, `operacoes`, `armazem`, `repositorio` e `controlador` rodam em Node, e é por isso que os testes não precisam de navegador.

## Fluxo de uma edição

1. A entrada abre um `Traco` no controlador e vai chamando `pintar` ou `apagar` a cada movimento.
2. O traço aplica as mudanças **na hora** no armazém (o jogador vê sem esperar) e as acumula.
3. Ao soltar o dedo, `confirmar()` funde as mudanças num `Lote`, guarda no histórico e envia ao repositório.
4. O repositório grava e avisa os outros clientes. Cada um recebe o lote em `controlador.receber` e aplica no seu armazém. O eco do próprio lote é ignorado.

## Ligar o servidor (PocketBase)

Tudo o que o mapa sabe do mundo exterior é a interface `RepositorioMapa`:

```ts
interface RepositorioMapa {
  carregarChunk(chaveDoChunk: string): Promise<Hexagono[]>
  carregarRegioes(): Promise<Regiao[]>
  aplicar(lote: Lote): Promise<void>
  assinar(ouvinte: (lote: Lote) => void): () => void
  // opcionais, para o token do grupo
  carregarToken?(): Promise<TokenGrupo | null>
  gravarToken?(token: TokenGrupo | null): Promise<void>
  assinarToken?(ouvinte: (token: TokenGrupo | null) => void): () => void
}
```

Para o servidor, basta uma classe nova (`RepositorioPocketBase`) e trocar a linha `new RepositorioLocal(...)` em `MapaHex.tsx`. Pontos de atenção:

- `aplicar` deve ser atômico por lote (a API de batch do PocketBase serve).
- `assinar` recebe lotes de **outros** clientes. O servidor pode devolver o próprio lote, que o controlador ignora pelo `id`.
- A ordem em que os lotes chegam do servidor é a verdade: o armazém aplica sem conferir revisão.
- Hoje, se um chunk falha ao carregar, o controlador o trata como vazio para não repetir o pedido a cada quadro. Com servidor isso precisa mudar: um chunk vazio por falha de rede não pode ser gravado por cima do verdadeiro.
- O PocketBase assina por coleção, não por chunk: o cliente filtra o que não está visível.
- O hexágono ganhou `rios` e `estradas` (listas de números). A coleção de hexágonos precisa guardá-los, e dado sem esses campos vale como lista vazia.
- O token do grupo precisa de um registro por mapa com `q`, `r`, `ts` e `autor`. A regra é "vale o `ts` mais recente".

## Tilesets (trocar a arte)

Um tileset é uma pasta em `app/public/tilesets/<id>/` com um `tileset.json` e as imagens. **Trocar a arte não exige mexer em código**: ponha as imagens novas, ajuste o JSON e (para usar de verdade) troque a constante `URL_TILESET` em `MapaHex.tsx`.

```jsonc
{
  "id": "padrao",
  "nome": "Padrão (gerado por script)",
  "orientacao": "pointy",   // por enquanto só pointy-top
  "largura": 256,           // largura do hexágono na imagem, em px
  "altura": 296,            // altura do hexágono SEM o extra, em px
  "pixelart": false,        // true: amplia as imagens sem suavizar (arte em pixel art)
  "token": "token.png",     // imagem do token do grupo (omita para o alfinete desenhado em código)
  "pastas": [               // pastas da paleta, na ordem em que aparecem
    { "id": "florestas", "nome": "Florestas" }
  ],
  "terrenos": [
    {
      "id": "floresta",             // é o que fica gravado no mapa. Não renomeie depois que houver mapas
      "nome": "Floresta",
      "cor": "#5f8f45",             // cor de reserva: pinta o hexágono antes da imagem e esconde frestas
      "extra": 0,                   // px a mais no topo da imagem (montanhas, torres)
      "pasta": "florestas",         // id de uma das `pastas` do tileset (ou omita: cai em "Outros")
      "tags": ["floresta", "árvores", "temperado"],   // pesquisa da paleta, no mínimo 3
      "arquivos": ["floresta-1.svg", "floresta-2.svg", "floresta-3.svg"]
    }
  ],
  "marcadores": [
    {
      "id": "cidade",                 // fica gravado nos hexágonos: não renomeie
      "nome": "Cidade",
      "arquivo": "marcadores/cidade.svg"   // relativo à pasta do tileset.json
    }
  ]
}
```

**Formato das imagens.** PNG, WebP ou SVG. O hexágono pointy-top deve ocupar a imagem inteira de ponta a ponta: **256 px de largura por 296 de altura** (a altura é `2 × largura / √3`), com os cantos transparentes. Se o terreno tem algo que passa por cima do hexágono de cima (picos, árvores altas), some `extra` px **no topo** da imagem: a imagem fica `256 × (296 + extra)` e o hexágono continua alinhado à base. Dê mais de uma variante por terreno: cada hexágono sempre usa a mesma, escolhida pela posição, então o mapa não pisca nem repete um padrão visível.

**Ícones de marcador.** Imagens quadradas com fundo transparente, de qualquer tamanho (o tileset gerado por script usa 128×128 em selo redondo, e a pasta `pixel` usa PNGs de 64×64 em pixel art, em pequenos blocos de terreno com a construção em cima). Um hexágono mostra até 3 marcadores lado a lado, e um "+N" se houver mais. Marcador sem imagem aparece como um círculo simples.

**Pastas e tags na paleta.** A paleta de terrenos agrupa os tiles em pastas que abrem e fecham (o app lembra quais estão fechadas) e tem uma caixa de pesquisa. A pesquisa ignora acento e maiúsculas e procura em cada palavra digitada no nome do terreno, no nome da pasta e nas tags. O botão "Tags" abre os chips de todas as tags, e marcar mais de uma exige que o terreno tenha todas. Durante a pesquisa as pastas com resultado ficam abertas, e Esc limpa. No celular a faixa da paleta tem só a caixa de pesquisa e os tiles em fila. A lógica está em `paleta.ts` (pura, testada) e a tela em `PaletaTerrenos.tsx`. Os 43 terrenos previstos têm pasta e tags prontas em `app/tools/catalogo-terrenos.json`, que o gerador do tileset padrão também lê.

**Rios e estradas em pixel art.** Com `"pixelart": true`, rios e estradas são desenhados pixel a pixel (`pixellinhas.ts` e `desenharLinhasPixel` no renderizador): uma camada do tamanho da tela, em pixels do mesmo tamanho dos da arte (1/128 da largura do hexágono), ampliada sem suavizar. O rio é azul com contorno e brilho, a estrada é de terra com salpicos. Sem `pixelart`, continuam traços suaves.

**Pixel art e `?tileset=`.** Com `"pixelart": true`, as imagens são ampliadas sem suavização. A imagem pode ter qualquer tamanho: ela é esticada para o hexágono de `largura` × `altura`. A arte do PixelLab, por exemplo, são PNGs de 128 × 128 com o hexágono preenchendo o quadrado, e o mapa os estica para 256 × 296. O mapa usa por padrão a pasta `pixel` (a arte em pixel art). Para ver outra pasta de tileset sem mexer no código, abra o mapa com `?tileset=<pasta>` no endereço (só letras minúsculas, números e hífen), por exemplo `?tileset=padrao` para o tileset gerado por script. O guia completo da arte nova, com a lista dos terrenos, está em [`arte.md`](arte.md).

**Tileset gerado.** A arte atual é provisória e vem de `app/tools/gerar-tileset.mjs` (`npm run tileset`), que desenha 13 terrenos com 3 variantes cada e 12 ícones de marcador, em SVG. Rodar de novo apaga e refaz `app/public/tilesets/padrao/`, então **não edite esses arquivos à mão**: copie a pasta com outro nome para a arte nova.

## Testes

```bash
npm test            # uma vez
npm run test:watch  # a cada alteração
```

Cobrem a matemática de hexágonos (ida e volta pixel↔hex, anéis, linhas, arestas), a câmera, as operações, o desfazer entre dois jogadores, rios e estradas (regras de onde ligam, desfazer, sincronia), o token do grupo, a régua e a validação de dados.

## Próximas fases

- **3.** Feita: rios, estradas, token do grupo e régua de distância.
- **4.** Servidor: `RepositorioPocketBase`, papéis (jogador e mestre), camada privada do mestre, presença (cursores).
- **Depois.** Se desenhar pesar com mapas grandes, guardar cada chunk num bitmap (cache invalidado ao editar).
