# Mapa hexagonal: o que foi feito, o que foi entregue e os próximos passos

Registro do projeto do mapa hexagonal infinito e compartilhado do DiscordVtt. Serve para quem chegar depois (inclusive nós dois, daqui a umas semanas) entender de onde saímos, o que existe, por que foi feito assim e o que falta.

Última atualização: 22/11/2026. Estado: **fases 0, 1, 2 e 3 prontas**. Fase 4 pendente.

Para o detalhe técnico do código (padrões, fluxo de uma edição, formato do tileset, como ligar o servidor), leia [`manual.md`](manual.md). Este documento é o **diário e o mapa do caminho**; aquele é o **manual do módulo**.

---

## 1. O pedido

Um mapa hexagonal **infinito**, construído pelos próprios jogadores, compartilhado online, com informação dentro dos hexágonos e regiões. Tinha de:

- funcionar no computador e no celular;
- nascer pensado para vários jogadores ao mesmo tempo, podendo usar um servidor local do host;
- usar imagens de tiles feitas por mim (provisórias), a serem trocadas depois por arte customizada, sem mexer em código.

## 2. Decisões tomadas

Tomadas na conversa de planejamento, antes de escrever código.

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Sincronização | **PocketBase como autoridade** (o servidor do host guarda cada hexágono) | Já está no roteiro do projeto e permite esconder o que o mestre não revelou. Yjs (CRDT) funde edições sozinho, mas entrega todos os dados a todos os clientes, o que impede segredo do mestre. |
| Papéis | **Jogadores constroem; o mestre tem uma camada privada** | Segredo não dá para acrescentar depois: muda o modelo de dados desde o começo. |
| Escopo extra | Marcadores, rios e estradas, token do grupo e régua, desfazer por jogador | Escolhido por vocês. |
| Geometria | Hexágonos **pointy-top**, coordenadas axiais `(q, r)`, chunks de 16×16 | Pointy-top deixa montanhas e árvores passarem por cima do hexágono de cima. Chunks são a unidade de carregar, guardar e sincronizar, o que torna o mapa infinito de verdade. |
| Dados | O mapa é **esparso**: só existe o que foi construído. Toda edição vira um **lote** (antes e depois) | Um formato só serve ao mapa solo, à rede e ao desfazer. |
| Arte | Tileset em **pasta com `tileset.json`**; arte provisória gerada por script | Trocar a arte não exige código. |
| Backend | O mapa fala com uma interface (`RepositorioMapa`), não com o servidor | O mapa foi construído sem esperar o PocketBase, que ainda não existe. |

Mudanças em relação ao plano inicial, decididas durante a construção:

- **Marcadores moram dentro do hexágono**, e não numa coleção separada. Assim o desfazer, os chunks e a sincronia funcionam sem código novo. O preço: dois jogadores editando marcadores do mesmo hexágono ao mesmo tempo disputam o hexágono inteiro (vale o último).
- **Excluir uma região não reescreve os hexágonos dela.** Eles ficam apontando para um id que não existe, e isso conta como "sem região". Desfazer a exclusão devolve a região com todos os seus hexágonos.
- **O desfazer compara conteúdo, não revisão** (ver o bug na seção 5).

## 3. O que foi feito, por fase

### Fase 0 e 1: fundação, desenho e pintura (commit `ed184b8`, branch `mapa-hexagonal`)

- Aba **Mapa** ao lado de **Fichas**, no topo do app.
- Matemática de hexágonos pura e testada: vizinhos, distância, disco, anel, linha, pixel↔hexágono, chunks, arestas.
- Renderizador em canvas 2D com câmera, zoom (roda do mouse e pinça), grade, terrenos desenhados de cima para baixo.
- Entrada por mouse, toque e caneta (Pointer Events): pintar, apagar, mover o mapa, selecionar. Dois dedos sempre movem o mapa e cancelam a pincelada em andamento.
- Pincéis de 1, 7 e 19 hexágonos.
- **Desfazer e refazer por jogador**, seletivos: pulam hexágonos que outra pessoa mexeu depois.
- Armazenamento local no IndexedDB e **sincronia entre abas** por BroadcastChannel. Abas abertas ao mesmo tempo se comportam como jogadores diferentes, o que já exercita o caminho de rede.
- Tileset padrão: 13 terrenos com 3 variantes cada, em SVG, gerados por `npm run tileset`.
- Vitest adicionado, com 42 testes.

### Fase 2: informação nos hexágonos (commit `e97adf3`, branch `mapa-fase-2`)

- **Painel do hexágono:** nome, terreno, região, marcadores e nota. À direita no desktop; no celular sobe da base, e o mapa se desloca para o hexágono selecionado não ficar escondido.
- **Regiões:** ferramenta Região, lista, editor (nome, cor, descrição, "faz parte de"), hierarquia reino › província. No mapa: cor suave, borda (grossa entre reinos, fina entre sub-regiões) e rótulo. Botão do olho para esconder as cores.
- **Marcadores:** ferramenta Marcador, 12 ícones (cidade, vila, castelo, masmorra, ruína, torre, templo, acampamento, porto, tesouro, perigo, ponto de interesse). Até 3 por hexágono lado a lado, "+N" se houver mais, e o nome do hexágono desenhado embaixo.
- O **lote** passou a carregar mudanças de hexágonos e de regiões; o `RepositorioMapa` ganhou `carregarRegioes`.
- Texto digitado (nome, nota, descrição) só grava ao parar de digitar, e edições seguidas viram um passo só no desfazer.
- 62 testes.

### Fase 3: rios, estradas, token do grupo e régua (branch `mapa/fase-3`)

- **Rios e estradas** pelas arestas, guardados no hexágono dono (decisão: ver `docs/decisoes.md`). Ferramentas Rio e Estrada, com modo "Tirar". O rio vai pela borda do hexágono, a estrada liga os centros. Só liga onde os dois hexágonos existem. Uma risca é um passo no desfazer.
- **Token do grupo:** alfinete framboesa que qualquer jogador leva a um hexágono com a ferramenta Token. Fora do desfazer, vale o mais recente, sincroniza entre abas. O `RepositorioMapa` ganhou três métodos opcionais, então nada quebra para quem não os implementa.
- **Régua de distância** local, em hexágonos, com linha tracejada, hexágonos do caminho marcados e etiqueta com a distância.
- `Hexagono` ganhou `rios` e `estradas`. Dados antigos continuam válidos (lista vazia).
- 89 testes (27 novos).

### Arte em pixel art (em andamento)

- Guia para o agente do PixelLab e lista de 43 terrenos em [`arte.md`](arte.md). Três já feitos como teste (oceano, planície, montanha, 2 variantes cada) na pasta `app/public/tilesets/pixel/`, que é uma cópia do tileset padrão com esses três terrenos trocados.
- **Lote 1** (campo, colina, savana) feito e na pasta `pixel`. Aprendizados novos no guia: o modo de estilo (`style_images`) quebra o hexágono, descrever um objeto só gera objeto solto sem chão, e terrenos que cobrem áreas grandes precisam de muitas variantes (a savana com 1 variante virou uma grade repetida no mapa, com 6 ficou natural).
- **Lote 2** (estepe, charneca, pomar) feito: 12 variantes novas. Dois lotes seguidos já mostram o ritmo: 1 chamada por lote e mais 1 para completar variantes dos terrenos contínuos (30 gerações por lote).
- **Lote 3** (floresta, floresta densa, bosque) feito: 9 variantes. Foram 3 chamadas (45 gerações), porque a primeira saiu com copas soltas e blocos com laje. O prompt que funcionou para florestas está no guia.
- **Lote 4** (taiga, floresta de outono, floresta nevada) feito: 6 variantes em uma chamada só (15 gerações). A receita de floresta do guia funcionou de primeira.
- **Lote 5** (selva, floresta morta, picos nevados) feito: 6 variantes em uma chamada (15 gerações). Os picos nevados repetem em grade, ficam como ponto a refazer.
- **Lote 6** (rochoso, planalto, cânion) feito: 6 variantes em uma chamada (15 gerações).
- **Lote 7** (vulcão, campo de lava, deserto) feito: 5 variantes em uma chamada (15 gerações).
- **Lote 8** (dunas, oásis, planície de sal) feito: 6 variantes em uma chamada (15 gerações). As dunas repetem em grade.
- **Lote 9** (pântano, manguezal, água rasa) feito: 6 variantes em uma chamada (15 gerações).
- **Paleta com pastas e pesquisa por tag.** Cada terreno do `tileset.json` tem `pasta` e `tags` (3 a 5), e o tileset tem a lista `pastas`. O catálogo dos 43 terrenos previstos fica em `app/tools/catalogo-terrenos.json` e o gerador do tileset padrão lê dele.
- **A arte em pixel art virou o padrão do mapa** (antes só aparecia com `?tileset=pixel`, e por isso parecia que as imagens não tinham sido aplicadas). O tileset gerado por script continua em `?tileset=padrao`.
- O tileset ganhou a opção `pixelart` (amplia sem suavizar) e o mapa aceita `?tileset=<pasta>` no endereço para testar arte sem mexer no código.
- Descoberta: o `create_tiles_pro` do PixelLab em `hex_pointy` com `tile_size` 128 entrega 128 × 128 com o hexágono achatado preenchendo o quadrado. O mapa estica para o hexágono regular. Usar `tile_height` não serve, porque acrescenta uma laje de espessura.

## 4. Como foi verificado

- **Automático:** `npm test` (62 testes), `npx tsc -b`, `npx oxlint` e `npm run build` passam nas duas branches.
- **No navegador, fase 1:** pintar, desfazer, pincel de 7, zoom, arrastar, selecionar, persistência depois de recarregar, layout de celular e **duas abas sincronizando**.
- **No navegador, fase 2:** criar e renomear região, trocar cor, pintar região, colocar marcador, nome e nota, persistência depois de recarregar, painel que sobe da base no celular.
- **No navegador, fase 3:** desenhar rio e estrada arrastando, levar o token, medir com a régua, persistência depois de recarregar (rios, estradas e token voltam) e a paleta no celular emulado. **Não conferido à mão:** o token sincronizando entre duas abas (coberto por testes automáticos) e rio e estrada com toque real.
- **Não conferido à mão na fase 2:** a sincronia entre duas abas com regiões e marcadores. Ela é coberta por testes automáticos (dois clientes no mesmo repositório), mas ninguém testou clicando. Vale fazer uma vez.
- **Nunca testado:** celular de verdade (toque real, pinça real). Só a emulação do navegador.

## 5. Problemas encontrados no caminho

- **Desfazer com conflito falso (corrigido na fase 2).** O desfazer comparava a revisão (`rev`) do hexágono, que sobe a cada alteração, inclusive ao desfazer. Depois de desfazer um passo, o passo anterior parecia ter sido mexido por outra pessoa, e o segundo desfazer não fazia nada. Aconteceu em passos seguidos no mesmo hexágono. Passou a comparar o conteúdo, com teste de regressão. **O bug está no commit `ed184b8`** (fases 0 e 1) e só a `mapa-fase-2` o corrige. Por isso o PR certo é o da `mapa-fase-2`, que traz tudo.
- **Zip sem `.git`.** O trabalho começou numa cópia baixada do repositório, sem histórico. O clone real é `OneDrive\Documents\GitHub\discordvtt`, e tudo foi movido para lá.
- **Recarregamento a quente com instância velha.** Ao editar com o servidor rodando, o Vite atualiza o código mas pode manter objetos antigos com callbacks antigos. Se algo parecer não ter mudado, recarregue a página de verdade antes de concluir que há bug.

## 6. Pendências conhecidas

- **Arte provisória.** Terrenos e ícones são SVGs gerados por script, a serem trocados por arte própria. Nunca edite `public/tilesets/padrao/` à mão: o script apaga e refaz a pasta. Copie com outro nome (ver o README do módulo).
- **Troca de aba perde edição de ficha.** O editor de fichas salva com 400 ms de atraso e é desmontado ao trocar para a aba Mapa. Trocar de aba dentro desse intervalo, logo depois de editar, perde a última edição. Conserto: salvar ao desmontar, em `EditorDeFichas.tsx` (arquivo de vocês, não mexi).
- **Chunk que falha ao carregar vira vazio.** Isso evita pedir o mesmo chunk a cada quadro, mas **não pode continuar assim com servidor**: um chunk vazio por falha de rede não pode ser gravado por cima do verdadeiro.
- **Desempenho não medido com mapas grandes.** Tudo é redesenhado a cada quadro, com corte pela área visível. Funciona bem nos testes, que são pequenos. O plano de reserva é guardar cada chunk num bitmap.
- **Marcadores disputam o hexágono inteiro** em edição simultânea (ver a seção 2).
- **Só um mapa por instalação** (id fixo `principal`). O modelo já tem `MapaMeta`, mas não há tela para vários mapas.

## 7. Próximos passos

### Fase 3: feita

Ver a seção 3. Ideias que ficaram para depois: arrastar o token em vez de tocar, nome e cor do token, vários tokens, rio e estrada com curvas, régua com custo de terreno e conversão para quilômetros.

### Fase 4: servidor (depende da base do projeto)

Depende de seu amigo montar o PocketBase, o login e os papéis por mesa (mestre e jogador). O mapa só precisa de uma classe nova.

1. `RepositorioPocketBase` que implemente `RepositorioMapa` (carregar chunk, carregar regiões, aplicar lote, assinar). Trocar a linha `new RepositorioLocal(...)` em `MapaHex.tsx`.
2. Coleções: mapas, hexágonos (com `q`, `r`, chunk e dados), regiões e **coleções privadas do mestre** (nota e hexágonos ou marcadores ocultos), protegidas por regras de acesso do servidor. Nunca esconder só na tela.
3. `aplicar` atômico por lote (API de batch do PocketBase; confirmar que a versão de vocês tem). Realtime filtrado por chunk no cliente.
4. Trocar a política de falha de carregamento (ver as pendências).
5. Papéis: o mestre pode reverter edições e marcar o que é privado.
6. Presença (cursores dos outros jogadores). O PocketBase não tem broadcast efêmero entre clientes; ou se grava um registro com limite de frequência, ou se deixa de fora.
7. Autor das edições: hoje é um id aleatório por navegador (`autorLocal`); com login vira o id do usuário.

### Depois

- **Arte final** de terrenos e ícones, no formato descrito no README do módulo.
- **Vários mapas** por mesa (mundo, cidade, masmorra) e escala por mapa (1 hexágono = X km).
- **Exportar e importar** o mapa em JSON (já existem as funções de validação).
- **Cache de bitmap por chunk**, se o desenho pesar em mapas grandes.
- **Teste em celular de verdade**, e depois um teste automático de interface (por exemplo, Playwright) para os fluxos principais.

## 8. Perguntas em aberto

1. **Quando começa o PocketBase?** A fase 4 só anda depois do login e dos papéis por mesa.
2. **Arte final:** quem faz, em que formato e quando? Define o que precisamos preparar no tileset (mais variantes, `extra` maior, ícones).
3. **Mestre:** o que exatamente é privado? Só nota e hexágonos ocultos, ou também regiões e marcadores?

## 9. Como retomar

- **Fluxo:** cada tarefa vira uma branch `mapa/<nome>` criada por `scripts/comecar.sh` e entregue por `scripts/entregar.sh`. As regras estão no `CLAUDE.md` da raiz.
- **Rodar:** `cd app`, `npm install`, `npm run dev`. Testes: `npm test`. Verificação completa: `npm run build` (inclui tipos) e `npx oxlint`.
- **Regerar a arte padrão:** `npm run tileset`.
- **Onde mexer:** tudo do mapa fica em `app/src/mapa/`, `app/public/tilesets/`, `app/tools/gerar-tileset.mjs` e `docs/mapa/`.
- **Testando o mapa no navegador:** em desenvolvimento, `window.__mapa` expõe o controlador, o renderizador e o tileset no console.
