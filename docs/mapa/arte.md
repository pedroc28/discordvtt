# Arte dos hexágonos

Guia para quem gera a arte dos terrenos do mapa com o PixelLab (o agente de arte, ou uma pessoa). É autossuficiente: com este arquivo e o `docs/mapa/manual.md` dá para fazer todos os tiles sem perguntar nada. O formato técnico do tileset está no manual, na seção "Tilesets". Aqui está o que desenhar, como pedir ao PixelLab, como conferir e onde guardar.

Estado: **44 de 45 tiles feitos** (43 da lista mais 2 extras, `praia-inteira` e `falesia-inteira`): água, planície e montanha (teste) e os lotes 1 a 13 (`campo`, `colina`, `savana`, `estepe`, `charneca`, `pomar`, `floresta`, `floresta-densa`, `bosque`, `taiga`, `floresta-outono`, `floresta-nevada`, `selva`, `floresta-morta`, `pico-nevado`, `rochoso`, `planalto`, `canion`, `vulcao`, `campo-de-lava`, `deserto`, `dunas`, `oasis`, `salar`, `pantano`, `mangue`, `agua-rasa`, `recife`, `tundra`, `geleira`, `mar-congelado`, `praia`, `falesia`, `delta`, `cidade`, `ruinas`, `terra-arrasada`, `floresta-encantada`, `cogumelos`). Falta 1 da lista da seção 7, `cristais`. Os 13 terrenos do tileset gerado por script já têm arte em pixel art, e a pasta `pixel` não tem mais SVG de terreno.

## 1. Estilo

Pixel art de mapa de mundo, vista de cima, com cara de jogo de estratégia fantasia dos anos 90 feito com capricho de hoje.

- **Luz** sempre vindo do canto superior esquerdo. Faces e relevos voltados para a esquerda são claros, os da direita ficam em sombra fria (azulada), nunca preta.
- **Vista:** de cima para o chão (terrenos planos) e três quartos para o que tem volume (montanhas, árvores, construções). Nada de lateral pura nem isométrico.
- **Cor:** saturação média e alegre, sombras com tom frio, luzes com tom quente. Sem preto puro e sem branco puro, exceto neve, espuma e flores bem pequenas.
- **Detalhe:** tufos e ondas de 1 a 3 pixels, nada de ruído aleatório nem pontilhado (dithering) pesado. Cada pixel precisa ter motivo.
- **Contorno:** nenhum contorno escuro em volta do hexágono. Dentro do tile, formas grandes (picos, árvores, casas) podem ter contorno suave de tom mais escuro da própria cor, nunca preto.
- **Nada de texto, letras, setas ou ícones** no tile. Marcadores, nomes, rios e estradas são desenhados pelo mapa por cima.

### Terrenos contínuos e terrenos com objetos

- **Contínuos** (água, planície, deserto, neve, tundra, pântano): o tom médio do tile vai **até a borda**, sem anel claro nem escuro, para vários hexágonos iguais lado a lado formarem uma superfície só. Os detalhes (ondas, tufos) ficam espalhados e não encostam na borda de um jeito que se repita na emenda.
- **Com objetos** (montanhas, florestas, cidade, ruínas, vulcão): o objeto fica **inteiro dentro do hexágono**, com margem de pelo menos 6 pixels da borda, sobre um chão do mesmo tom do terreno vizinho mais provável (em geral, o verde da planície). Assim as emendas não mostram objeto cortado.
- Cada tipo de terreno tem **2 variantes** (3 é o ideal) com o mesmo tom médio e objetos em posições diferentes. O mapa escolhe a variante pela posição do hexágono, então elas precisam combinar entre si.

### Âncoras de cor

Os três tiles de teste já definem a família de cada cor. Os novos devem parecer da mesma casa. Cor média medida nos tiles aprovados:

| Terreno | Cor média | Uso |
| --- | --- | --- |
| Planície | `#5a9a37` | verde base de tudo que é grama |
| Água | `#428fa3` | azul-petróleo de toda a água rasa e funda (a funda é mais escura, a rasa mais clara e esverdeada) |
| Montanha | `#67915f` | cinza-azulado da pedra sobre chão verde |

## 2. Formato do arquivo

- **PNG de 128 × 128 px**, fundo transparente nos cantos fora do hexágono.
- O hexágono é *pointy-top* (ponta para cima e para baixo) e **preenche o quadrado de ponta a ponta**. Ele sai "achatado" do PixelLab, e isso é de propósito: o mapa estica a imagem para o hexágono regular de 256 × 296 px e liga a opção `pixelart` do tileset, que amplia sem suavizar. Os pixels ficam cerca de 15% mais altos do que largos, e na prática ninguém percebe.
- Não redimensione, não suavize, não recorte. O PNG de 128 × 128 que o PixelLab entrega é o arquivo final.
- Nome: `<id>-<n>.png`, por exemplo `floresta-1.png` e `floresta-2.png`. O `id` é o da lista da seção 6 e **nunca muda depois** (fica gravado nos mapas).

## 3. Como pedir ao PixelLab

Ferramenta: `create_tiles_pro`. Configuração que funcionou:

| Parâmetro | Valor | Por quê |
| --- | --- | --- |
| `tile_type` | `hex_pointy` | hexágono com ponta para cima |
| `tile_size` | `128` | tamanho máximo, mais detalhe |
| `tile_view` | `top-down` | sem espessura. Outras vistas desenham uma "laje" escura embaixo do hexágono |
| `outline_mode` | `segmentation` | sem contorno escuro em volta, o chão vai limpo até a borda |
| `tile_height` | **não usar** | acrescenta a laje de espessura e deforma o hexágono |
| `palette` | não usar no começo | o estilo vem dos tiles de referência (seção 4) |

**Rendimento:** uma chamada com 3 descrições numeradas devolve **6 imagens** (em geral 2 por descrição, às vezes de 1 a 3) e custa 15 gerações. Peça **3 terrenos por chamada**. Para os 40 tiles são cerca de 14 chamadas, perto de 210 gerações. Se um terreno sair com menos de 2 variantes, ou com variantes parecidas demais, refaça só ele numa chamada com **3 descrições do mesmo terreno com detalhes diferentes** (por exemplo, "duas acácias", "três acácias e pedras", "uma acácia e um cupinzeiro"). O mapa repete a variante em grade, então quanto mais variantes melhor: 2 é o mínimo, 3 a 6 é o ideal para terrenos que cobrem áreas grandes (planície, savana, água).

**Como escrever a descrição** (em inglês, o PixelLab entende melhor). Numere cada tile e use sempre esta estrutura:

> `N). <nome> hex tile, <o que é, visto de cima>, <2 ou 3 detalhes concretos>, <regra de luz e cor>, <regra de borda>`

**Erros que já aconteceram, para não repetir:**

- Descrever **um objeto só** ("one large acacia tree") faz o PixelLab desenhar o objeto solto, sem chão e sem hexágono. Sempre diga `ground fully covering the whole hexagon`.
- **Não use `style_images` com `hex_pointy`.** O modo de estilo ignora a forma, devolve `square_topdown` e acrescenta uma laje escura embaixo do hexágono, que não serve para o mapa. O estilo se mantém repetindo no prompt a cor e a luz das âncoras (seção 1).
- **Florestas e qualquer terreno cheio de árvores:** a descrição "a cluster of tree crowns" gerou copas soltas sem chão (4 de 6 imagens) e, nas florestas densas, um bloco com laterais (laje). O que funcionou foi pedir `flat hexagonal terrain tile, top-down terrain texture completely filled edge to edge with ...` e `flat tile with no thickness and no side walls`. Para terreno com chão e poucas árvores, descreva o chão primeiro (`bright mid-green grass ground completely filling the hexagon edge to edge, with sparse small trees`).
- Floresta "densa" sem dizer `broadleaf oak and beech, NOT pine trees` sai de pinheiros, e isso se confunde com a taiga. Pinheiros ficam para `taiga`.
- Cuidado com trilhas: uma variante de bosque saiu com um caminho de pedra de lado a lado e foi descartada, porque o mapa já desenha estradas por cima.
- **Terreno que precisa se encaixar com ele mesmo** (manguezal, pântano, floresta): a primeira versão do manguezal tinha árvores grandes cortadas pela borda e lama escura, e no mapa os hexágonos ficavam feios juntos. A versão refeita pede `many small ... evenly spread across the whole tile` e `similar density everywhere`, com a água de tom único até a borda. Escrever `seamless tileable` e `small shrubs` sem descrever o chão faz o PixelLab devolver arbustos soltos, sem hexágono. Sempre teste o terreno pintado em massa antes de aprovar (seção 5, item 5).
- **Cidade e ruínas** saíram sempre como objeto solto sem chão (12 imagens em 2 chamadas, mesmo com `grass ground completely filling the hexagon`). Solução que funcionou: **compor por script** (`PIL`): colar o objeto sobre um tile de planície já aprovado e recortar pelo hexágono. O chão fica idêntico ao da planície vizinha. Vale para qualquer objeto solto (castelo, torre, templo).
- Sombras azul-esverdeadas fortes demais fazem relevo parecer lago (aconteceu nas colinas). Peça `gentle darker green shadows`.

Frases de borda e luz que devem aparecer sempre:

- Contínuos: `same mid <cor> tone reaching the edges so neighbouring tiles join without a visible border, no rim`
- Com objetos: `<cor do chão> ground around the base that reaches the tile edges, object fully inside the hexagon`
- Luz: `light from the top-left, cool blue shadows on the right`

Exemplo real (o que gerou os três tiles de teste, job `d2d59d22-b0f4-4ed8-96f5-3ff232ecc1e5`):

```
1). ocean water hex tile, medium teal-blue water seen from directly above, small pixel wave crests and a few lighter foam dashes, even mid-blue tone all the way to the edges so neighbouring water tiles join without a visible border, no rim, no shoreline
2). grassland plains hex tile, rich green meadow seen from directly above, short grass tufts, a few tiny wildflowers in white and yellow, subtle lighter and darker grass patches, same mid-green tone reaching the edges so neighbouring grass tiles join without a visible border, open and flat
3). mountain hex tile, rugged grey rock mountain range with a three-quarter view of two or three jagged peaks with white snow caps, light from the top-left so left faces are lit and right faces are in cool blue shadow, scree and small foothills at the base, grass-green ground around the base that reaches the tile edges
```

## 4. Manter o estilo igual entre os 40

O risco de uma série longa é cada lote sair com uma "mão" diferente. Para evitar:

1. Os 6 tiles de teste (já em `app/public/tilesets/pixel/`) são a **referência de estilo**.
2. **Não use o modo de estilo** (`style_images`): foi testado no lote 1 e quebra o formato (ver "Erros que já aconteceram" na seção 3). Use sempre o modo de forma da seção 3 e escreva no prompt as cores e a luz das âncoras.
3. Depois de aprovar cada lote, acrescente ao grupo de referência um tile novo de cada família (floresta, deserto, neve...).
4. Se o estilo derivar mesmo assim, extraia a paleta dos tiles aprovados com `pixelart_workbench` (`extract-palette`) e passe como `palette` nas chamadas seguintes.

## 5. Conferir antes de aceitar

Para cada tile, em ordem. Reprovou em algum item, descarte e gere de novo (cada nova chamada custa 15 gerações, então vale reprovar com critério e juntar vários defeitos numa chamada só).

1. **Formato:** 128 × 128, canto superior esquerdo `(0, 0)` transparente, centro opaco.
2. **Hexágono completo:** as 6 bordas estão limpas, sem laje escura embaixo e sem pedaço transparente dentro.
3. **Lido a 100%:** o terreno é reconhecível em dois segundos, sem legenda.
4. **Lido a 30%:** é como o mapa aparece afastado, com o hexágono de uns 50 px. A silhueta e a cor ainda dizem o terreno.
5. **Emenda:** monte 3 × 3 hexágonos do mesmo tile (e das duas variantes misturadas) e veja se aparece grade, anel ou repetição óbvia. Nos terrenos contínuos não pode aparecer.
6. **Vizinhança:** ponha o tile ao lado da planície e da água. O choque de cor é aceitável (as transições suaves ficam para depois), mas a luz e a escala dos detalhes precisam combinar.
7. **Luz:** vem do alto à esquerda, em todas as variantes.
8. **Cores:** no máximo uns 32 cores por tile e nenhum preto puro.

Dica de teste rápido: `lint` e `score` do `pixelart_workbench` apontam pixels soltos e contornos quebrados. Não substituem o olho, mas pegam defeito de graça.

## 6. Onde guardar e como testar

1. Baixe os PNGs e guarde em `app/public/tilesets/pixel/` como `<id>-1.png`, `<id>-2.png`.
2. No `tileset.json` dessa pasta, no terreno de mesmo `id`, troque `arquivos` pelos PNGs, ajuste `cor` para a **cor média** do tile (é o que aparece enquanto a imagem carrega e esconde frestas) e deixe `extra` em `0`. O tileset já tem `"pixelart": true`.
3. Terreno novo (que não existe ainda): acrescente um item em `terrenos` com `id`, `nome`, `cor`, `extra`, `arquivos`, `pasta` e `tags`. A `pasta` e as `tags` de cada um dos 43 terrenos já estão prontas em `app/tools/catalogo-terrenos.json`: **copie de lá**, sem inventar (ver a seção 8). Cada terreno tem no mínimo 3 tags.
4. O mapa já usa a pasta `pixel` como padrão (função `urlDoTileset()` em `MapaHex.tsx`), então a arte aprovada aparece sozinha, sem parâmetro. Para comparar com o tileset gerado por script, abra com `?tileset=padrao` no fim do endereço.

Registre no `docs/mapa/diario.md` o job do PixelLab de cada lote (para repetir ou ajustar) e marque na lista abaixo o que ficou pronto.

## 7. Os tiles que faltam (40)

São 40 terrenos úteis para um mapa de mundo de fantasia, **além dos 3 de teste** (`oceano`, `planicie`, `montanha`). Dez deles já existem no tileset gerado por script com estes mesmos `id` (marcados com `existe`), então **o `id` não pode mudar**: a arte nova só substitui a antiga. Os outros 30 são terrenos novos.

Ordem sugerida: faça por família, 3 por chamada, na ordem da tabela. Cada linha traz o prompt em inglês pronto para colar depois do número. Todos assumem as frases de luz e de borda da seção 3 (acrescente-as). **Contínuo** e **objetos** dizem qual regra de borda vale.

### Terra aberta

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 1 | `campo` (existe) | Campos de cultivo | contínuo | farmland hex tile, patchwork of plowed furrows and golden wheat strips in green and yellow, tiny fence lines, seen from above |
| 2 | `colina` (existe) | Colinas | objetos | rolling green hills hex tile, three or four soft rounded hills with lit left slopes and blue-green shadowed right slopes, a few small trees and bushes |
| 3 | `savana` | Savana | contínuo | dry savanna hex tile, golden-yellow grass with tall dry tufts, two or three flat-topped acacia trees with long shadows, warm tone |
| 4 | `estepe` | Estepe | contínuo | cold steppe hex tile, pale olive-brown short grass, scattered grey stones and dry shrubs, wind-swept look, muted colours |
| 5 | `charneca` | Charneca | contínuo | heathland moor hex tile, purple heather patches over olive-green grass, a few grey boulders and gorse bushes |
| 6 | `pomar` | Pomar e vinhedo | objetos | orchard hex tile, neat rows of small round fruit trees and a strip of vineyard, green grass between rows, tiny red and orange fruit dots |

### Florestas

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 7 | `floresta` (existe) | Floresta | objetos | temperate forest hex tile, a cluster of round green broadleaf trees with lit left sides and dark blue-green right sides, grass visible between the trees |
| 8 | `floresta-densa` (existe) | Floresta densa | objetos | dense dark forest hex tile, tightly packed deep green tree crowns overlapping, very little ground showing, shadowy and old |
| 9 | `bosque` | Bosque claro | objetos | light woodland hex tile, sparse scattered trees, bright green grass with small clearings and bushes, a lot of ground showing |
| 10 | `taiga` | Floresta de coníferas | objetos | conifer forest hex tile, pointed dark green spruce and pine trees in a cluster, a thin dusting of snow on the tops, pale green-grey ground |
| 11 | `floresta-outono` | Floresta de outono | objetos | autumn forest hex tile, trees in orange, red and gold, fallen leaves on the ground, warm and golden |
| 12 | `floresta-nevada` | Floresta nevada | objetos | snowy forest hex tile, conifer trees heavily covered in snow, white ground with soft blue shadows, a few dark green gaps |
| 13 | `selva` | Selva tropical | objetos | tropical jungle hex tile, huge bright green broadleaf and palm crowns, hanging vines, a tiny glint of a stream, very lush and saturated |
| 14 | `floresta-morta` | Floresta morta | objetos | dead haunted forest hex tile, bare twisted grey trees with no leaves, grey-brown dirt and pale fog patches, eerie and cold |

### Altos e rochosos

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 15 | `pico-nevado` (existe) | Picos nevados | objetos | towering snow-capped peaks hex tile, two tall jagged mountains almost fully white at the top with blue shadows, bare rock below, snow-dusted ground around |
| 16 | `rochoso` | Terreno rochoso | contínuo | rocky highland hex tile, grey and brown boulders and flat rock slabs, sparse tough grass tufts, cracks, no peaks |
| 17 | `planalto` | Planalto | objetos | mesa plateau hex tile, a flat-topped brown-red rock plateau with steep lit left cliff and dark right cliff, green grass around the base |
| 18 | `canion` | Cânion | contínuo | canyon hex tile, red-orange rock layers with a deep dark crack running through it, stepped cliff edges, a thin ribbon of water at the bottom |
| 19 | `vulcao` | Vulcão | objetos | volcano hex tile, a dark grey cone with a glowing orange crater, a thin plume of smoke, glowing lava streaks down the right side, black ash ground around |
| 20 | `campo-de-lava` | Campo de lava | contínuo | lava field hex tile, black cooled rock crust with bright orange glowing cracks, a few small glowing pools, ember dots |

### Áridos

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 21 | `deserto` (existe) | Deserto | contínuo | desert hex tile, warm sand with soft wind ripples and two or three small low dunes, a few tiny pebbles, light from the top-left giving lit and shadowed dune faces |
| 22 | `dunas` | Dunas altas | contínuo | tall dunes hex tile, big sweeping sand dunes with sharp crests, bright yellow-orange lit sides and violet shadowed sides, wind lines |
| 23 | `oasis` | Oásis | objetos | desert oasis hex tile, a small blue pond ringed by green grass and three palm trees, surrounded by warm sand |
| 24 | `salar` | Planície de sal | contínuo | salt flat hex tile, almost white cracked salt crust with polygon cracks, pale pink and blue tint, a shallow glint of water, very flat |

### Úmidos, água e gelo

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 25 | `pantano` (existe) | Pântano | contínuo | swamp hex tile, murky green-brown water with moss patches, reeds and cattails, a dead tree stump, small bubbles, damp and dark |
| 26 | `mangue` | Manguezal | objetos | mangrove hex tile, tangled mangrove trees on stilt roots standing in shallow greenish-brown water, mud banks |
| 27 | `agua-rasa` (existe) | Água rasa | contínuo | shallow water hex tile, light turquoise-green clear water with visible sandy bottom ripples, a few small light wave marks, brighter than the deep water |
| 28 | `recife` | Recife de coral | contínuo | coral reef hex tile, turquoise shallow water seen from above with pink, orange and purple coral shapes under the surface, light caustic sparkles |
| 29 | `tundra` (existe) | Tundra | contínuo | tundra hex tile, pale grey-green mossy ground with patches of snow, small frozen puddles and tough lichen, cold muted colours |
| 30 | `geleira` | Geleira | contínuo | glacier hex tile, blue-white ice with deep blue crevasses and crack lines, snow patches, cold and glossy |
| 31 | `mar-congelado` | Mar congelado | contínuo | frozen sea hex tile, broken pack ice floes of white and pale blue drifting on dark teal water, thin cracks |

### Costa

Além dos três abaixo, a pasta tem dois extras sem direção, pedidos depois: `praia-inteira` (Praia, tile inteiro) e `falesia-inteira` (Falésia, tile inteiro). São areia e rocha cobrindo o hexágono todo, sem faixa de mar, e se emendam em qualquer ordem.

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 32 | `praia` | Praia | contínuo | beach hex tile, pale warm sand with a few shells and a strip of foamy turquoise shallows along one side, driftwood bits |
| 33 | `falesia` | Falésia | objetos | sea cliff hex tile, grass-topped plateau ending in a lit grey-brown cliff face with crashing white foam below on the right, dark blue water at the base |
| 34 | `delta` | Delta de rio | contínuo | river delta hex tile, several branching shallow turquoise channels through mud-brown and green sandbars and reeds |

### Obra humana

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 35 | `cidade` | Cidade murada | objetos | walled city hex tile, dense cluster of small medieval houses with red and brown roofs inside a round grey stone wall with a gate and one tower, green ground outside |
| 36 | `ruinas` | Ruínas antigas | objetos | ancient ruins hex tile, broken white-grey stone columns, a crumbled wall and a fallen arch overgrown with green moss and grass, scattered stones |
| 37 | `terra-arrasada` (existe) | Terra arrasada | contínuo | scorched wasteland hex tile, black and brown burnt earth with ash grey patches, charred stumps, faint orange embers, cracks |

### Fantasia

| # | `id` | Nome | Tipo | Prompt |
| --- | --- | --- | --- | --- |
| 38 | `floresta-encantada` | Floresta encantada | objetos | enchanted forest hex tile, trees with blue-green and pink leaves, glowing yellow and cyan fireflies and sparkles, mossy ground, magical soft mood |
| 39 | `cogumelos` | Floresta de cogumelos | objetos | giant mushroom forest hex tile, tall red-spotted and violet glowing mushrooms of different sizes, dark purple-blue mossy ground, spore sparkles |
| 40 | `cristais` | Planície de cristais | objetos | crystal plain hex tile, tall translucent cyan, violet and pink crystal clusters growing from pale grey-lilac stone ground, glints of light |

### Quadro de andamento

Marque aqui ao aprovar (`[x]`) e anote o job do PixelLab.

- [x] Teste: `oceano`, `planicie`, `montanha` (2 variantes cada), job `d2d59d22-b0f4-4ed8-96f5-3ff232ecc1e5`
- [x] Lote 1: `campo` (3 variantes), `colina` (3), `savana` (6). Jobs `8ec2399c-36ab-48e3-b990-04fd7f42799c` (campo), `85eca2ec-a1df-4e09-b0ca-80b536d0ff7e` (colina) e `b623aeb6-9cd0-4937-acb9-d0409fe86a9a` (savana). Pontos fracos: o chão verde do `campo` é liso e as colinas ainda têm pouco relevo
- [x] Lote 2: `estepe` (5 variantes), `charneca` (5), `pomar` (2). Jobs `561500e6-6639-4cc6-b93c-a78641d30135` (os três) e `1dd001e5-585b-4718-90e5-ebb5f9246a72` (variantes extras de estepe e charneca). Receita que funcionou: pedir os três terrenos e, se algum sair com poucas variantes, uma segunda chamada com descrições do mesmo terreno mudando o detalhe (poça congelada, sem pedras grandes, arbustos amarelos)
- [x] Lote 3: `floresta` (5 variantes), `floresta-densa` (2), `bosque` (2). Jobs `c198dde2-cc18-4e38-80c5-5e8880f95a4c` e `978b3710-1498-4330-a3de-da0022773c33`. A primeira tentativa (job `e3809673-c29c-48e5-9a98-ddc95b9fc459`) foi descartada. As duas florestas de pinheiros que saíram na primeira rodada (job `c198dde2-...`, imagens 1 e 4) servem de ponto de partida para a `taiga`
- [x] Lote 4: `taiga` (2 variantes), `floresta-outono` (2), `floresta-nevada` (2). Job `f600b8f5-93cb-4457-ab3c-064415f2426c`, uma chamada só (15 gerações), usando a receita de floresta do lote 3. Ponto fraco: o outono mostra uma fina borda escura nas arestas de baixo, que desenha o contorno do hexágono quando há muitos juntos
- [x] Lote 5: `selva` (2 variantes), `floresta-morta` (2), `pico-nevado` (2). Job `413dd74c-956e-44b5-874f-cd6bb1d082f6`, uma chamada (15 gerações). Ponto fraco: as duas variantes de `pico-nevado` são quase iguais e os picos formam uma grade quando há muitos hexágonos juntos. Vale refazer com 3 descrições de composições diferentes (um pico grande, dois picos, cordilheira baixa)
- [x] Lote 6: `rochoso` (2 variantes), `planalto` (2), `canion` (2). Job `92a20a44-1fd2-4c7a-88d9-16f401e557c4`, uma chamada (15 gerações). Limites que ficam: o planalto é um objeto por hexágono e aparece em grade se pintado em massa (o certo é usar poucos), e a fenda do cânion não continua de um hexágono para o vizinho. Para cânions longos, vale testar a transição `tile_feature="tileset"` (seção 9)
- [x] Lote 7: `vulcao` (1 variante, é um marco isolado), `campo-de-lava` (2), `deserto` (2). Job `1658043d-26c1-4348-9056-3f8d5168440a`, uma chamada (15 gerações). A outra variante do vulcão saiu com a fumaça como um cano cinza reto e foi descartada. As duas variantes do deserto são bem diferentes entre si (areia com dunas pequenas e dunas onduladas grandes), então a segunda já adianta a ideia do `dunas`
- [x] Lote 8: `dunas` (2 variantes), `oasis` (2), `salar` (2). Job `30db8647-c146-4cee-a8bf-840b97211562`, uma chamada (15 gerações). Ponto fraco: cada tile de dunas é uma duna enorme só, então pintar vários juntos forma uma grade de curvas em S. Funciona melhor misturado com `deserto`. Vale gerar mais 3 variantes de dunas menores e de direções diferentes
- [x] Lote 9: `pantano` (2 variantes), `mangue` (2), `agua-rasa` (2). Job `e094f1a9-3144-4909-8154-ad2558957c43`, uma chamada (15 gerações). Atenção: a arte antiga em SVG de `pantano` e `agua-rasa` foi removida da pasta `pixel`
- [x] Lote 10: `recife` (2 variantes), `tundra` (2), `geleira` (2). Job `da2c9373-b579-4519-b9c8-5a6a5a0e79e2`, uma chamada (15 gerações). A arte antiga em SVG da `tundra` foi removida da pasta `pixel`. Ponto fraco: as rachaduras da geleira não continuam de um hexágono para o vizinho
- [x] Lote 11: `mar-congelado` (3 variantes), `praia` (2), `falesia` (3). Jobs `12210478-cae9-4772-ae42-fa9b7f9075c2` e `ec190cd1-879a-4b33-bc20-f260709afe8e`. O `mangue` do lote 9 foi **refeito** (job `ec190cd1-...`, 3 variantes) porque as árvores grandes não se encaixavam entre hexágonos. A `praia` e a `falesia` têm o lado do mar fixo, então só encaixam bem em costas viradas para o mesmo lado, e pedem o uso com cuidado
- [x] Lote 12: `delta` (2 variantes), `cidade` (4), `ruinas` (2), mais dois extras: `praia-inteira` (4 variantes: 2 de areia e 2 de seixos) e `falesia-inteira` (2), sem lado do mar fixo, para costas em qualquer direção. Jobs `5d7d1d32-2ad4-4a0f-b03e-10ec5a4223db` (delta), `57bed18f-897d-422a-843e-1d74b403a0c2` (praia e falésia inteiras) e `f9fd6844-17eb-4cf9-afa9-65136e3e8c45` (objetos de cidade e ruínas, compostos sobre a planície). Três chamadas, 45 gerações
- [x] Lote 13: `terra-arrasada` (2 variantes), `floresta-encantada` (2), `cogumelos` (2). Job `96215f89-3338-4cfb-bd61-89248c7ea90e`, uma chamada (15 gerações), sem nenhuma reprovação
- [ ] Lote 14: `cristais`

## 8. Pastas e tags na paleta

A paleta de terrenos do mapa divide os tiles em **pastas** e tem **pesquisa por nome ou tag**. A pasta e as tags de cada terreno vêm do `tileset.json` (campos `pasta` e `tags`, e a lista `pastas` no topo). O catálogo dos 43 terrenos, que é a fonte única, fica em `app/tools/catalogo-terrenos.json`, e o gerador do tileset padrão lê dele.

- **Pastas:** Terra aberta, Florestas, Montanhas e rochas, Desertos e áridos, Águas e pântanos, Gelo e frio, Costa, Obra humana, Fantasia e perigo.
- **Tags:** minúsculas, em português, com acento, de 3 a 5 por terreno. Servem para achar o tile por **clima** (`frio`, `quente`, `temperado`, `tropical`), **relevo ou material** (`rocha`, `areia`, `neve`, `lama`, `água`), **uso no jogo** (`perigoso`, `difícil`, `navegável`, `civilizado`, `caça`, `magia`) e **o nome do bioma** (`savana`, `taiga`, `deserto`).
- **Terreno novo fora da lista:** acrescente primeiro ao catálogo (pasta existente e pelo menos 3 tags, reaproveitando as tags já usadas antes de criar uma nova) e depois ao `tileset.json`. Tag nova só se nenhuma existente serve.
- A pesquisa ignora acento e maiúsculas, aceita várias palavras (todas precisam casar com o nome, o nome da pasta ou uma tag) e há chips de tag clicáveis, que combinam entre si (o terreno precisa ter todas as tags marcadas).

## 9. Depois dos 43

- **Transições.** Hoje, onde dois terrenos se encontram há um corte seco na borda do hexágono. O PixelLab tem `tile_feature="tileset"` com `hex_pointy`, que gera um conjunto de 32 tiles de costa que se encaixam (por exemplo grama para água). Vale testar para a costa, que é a emenda mais visível.
- **Objetos que passam do hexágono.** Montanhas e árvores altas podem ganhar `extra` (pixels a mais no topo da imagem) para os picos subirem por cima do hexágono de cima. Hoje todos ficam dentro do hexágono.
- **Ícones de marcador e peças** (cidade, castelo, masmorra, token do grupo) também podem virar pixel art no mesmo estilo.
