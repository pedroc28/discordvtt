# Mapa hexagonal infinito

Mapa compartilhado, construído pelos jogadores: pintar terreno hoje, e depois notas por hexágono, regiões, marcadores, rios, estradas, token do grupo e régua. Pensado desde o começo para vários jogadores ao mesmo tempo, no computador e no celular.

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
| Tamanho do pincel | 1, 7 ou 19 hexágonos (teclas `[` e `]`) | idem |
| Desfazer, refazer | Ctrl+Z, Ctrl+Shift+Z | botões |
| Grade, início | G, 0 | botões |

Desfazer é **por jogador**: só desfaz o que você fez, e pula hexágonos que outra pessoa mexeu depois (o app avisa quantos).

## Padrões

**Geometria** (`hex.ts`). Hexágonos *pointy-top* (ponta para cima), coordenadas axiais `(q, r)`: `q` cresce para leste, `r` para sudeste. A chave de um hexágono é `"q,r"`. As 6 direções, em sentido horário a partir do leste, são um contrato: arestas e cantos usam a mesma ordem.

**Mapa esparso e chunks.** Só existe o que foi construído. Os hexágonos são agrupados em *chunks* de 16×16 coordenadas axiais (`chunkDe`), que são a unidade de carregar, guardar e, no futuro, sincronizar. O renderizador só pede ao controlador os chunks da área visível.

**Arestas.** Rios e estradas (fase 3) passam pelas arestas. Cada aresta é compartilhada por dois hexágonos, então só o "dono" a identifica: a aresta leste, sudeste ou sudoeste de cada hexágono (`arestaCanonica`). As outras três pertencem ao vizinho.

**Lotes.** Quem edita nunca altera o mapa direto. As operações puras (`operacoes.ts`) devolvem *mudanças* (`antes` e `depois` de cada hexágono), e uma pincelada vira um **lote** (`Lote`). O lote é a unidade de rede, de gravação e de desfazer. Cada hexágono tem uma revisão (`rev`) que sobe a cada alteração: o desfazer só reverte o hexágono se a revisão ainda for a que o lote deixou.

**Segredo do mestre.** Quando existir a camada privada do mestre (notas e hexágonos ocultos), ela deve ficar em **coleções separadas, protegidas no servidor** (regras de acesso do PocketBase). Esconder só na tela deixaria o dado exposto na rede.

## Organização

```
hex.ts               matemática de hexágonos, chunks e arestas (pura)
camera.ts            posição e zoom da câmera (pura)
tipos.ts             Hexagono, Mudanca, Lote, MapaMeta
operacoes.ts         pintar, apagar, fundir mudanças, desfazer seletivo (puras)
armazem.ts           hexágonos carregados, por chunk. É o que o desenho lê
repositorio.ts       interface RepositorioMapa + versão em memória
repositorio-local.ts IndexedDB + BroadcastChannel (avisa as outras abas)
controlador.ts       junta tudo: traço, histórico por jogador, lotes recebidos
tileset.ts           carrega o tileset (manifesto + imagens)
renderizador.ts      desenha no canvas 2D
entrada.ts           mouse, toque e caneta (Pointer Events)
armazenamento.ts     validação de dados externos e preferências locais
MapaHex.tsx          tela: barra de ferramentas, paleta, canvas
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
  aplicar(lote: Lote): Promise<void>
  assinar(ouvinte: (lote: Lote) => void): () => void
}
```

Para o servidor, basta uma classe nova (`RepositorioPocketBase`) e trocar a linha `new RepositorioLocal(...)` em `MapaHex.tsx`. Pontos de atenção:

- `aplicar` deve ser atômico por lote (a API de batch do PocketBase serve).
- `assinar` recebe lotes de **outros** clientes. O servidor pode devolver o próprio lote, que o controlador ignora pelo `id`.
- A ordem em que os lotes chegam do servidor é a verdade: o armazém aplica sem conferir revisão.
- Hoje, se um chunk falha ao carregar, o controlador o trata como vazio para não repetir o pedido a cada quadro. Com servidor isso precisa mudar: um chunk vazio por falha de rede não pode ser gravado por cima do verdadeiro.
- O PocketBase assina por coleção, não por chunk: o cliente filtra o que não está visível.

## Tilesets (trocar a arte)

Um tileset é uma pasta em `public/tilesets/<id>/` com um `tileset.json` e as imagens. **Trocar a arte não exige mexer em código**: ponha as imagens novas, ajuste o JSON e (para usar de verdade) troque a constante `URL_TILESET` em `MapaHex.tsx`.

```jsonc
{
  "id": "padrao",
  "nome": "Padrão (gerado por script)",
  "orientacao": "pointy",   // por enquanto só pointy-top
  "largura": 256,           // largura do hexágono na imagem, em px
  "altura": 296,            // altura do hexágono SEM o extra, em px
  "terrenos": [
    {
      "id": "floresta",             // é o que fica gravado no mapa. Não renomeie depois que houver mapas
      "nome": "Floresta",
      "cor": "#5f8f45",             // cor de reserva: pinta o hexágono antes da imagem e esconde frestas
      "extra": 0,                   // px a mais no topo da imagem (montanhas, torres)
      "arquivos": ["floresta-1.svg", "floresta-2.svg", "floresta-3.svg"]
    }
  ]
}
```

**Formato das imagens.** PNG, WebP ou SVG. O hexágono pointy-top deve ocupar a imagem inteira de ponta a ponta: **256 px de largura por 296 de altura** (a altura é `2 × largura / √3`), com os cantos transparentes. Se o terreno tem algo que passa por cima do hexágono de cima (picos, árvores altas), some `extra` px **no topo** da imagem: a imagem fica `256 × (296 + extra)` e o hexágono continua alinhado à base. Dê mais de uma variante por terreno: cada hexágono sempre usa a mesma, escolhida pela posição, então o mapa não pisca nem repete um padrão visível.

**Tileset gerado.** A arte atual é provisória e vem de `tools/gerar-tileset.mjs` (`npm run tileset`), que desenha 13 terrenos com 3 variantes cada em SVG. Rodar de novo apaga e refaz `public/tilesets/padrao/`, então **não edite esses arquivos à mão**: copie a pasta com outro nome para a arte nova.

## Testes

```bash
npm test            # uma vez
npm run test:watch  # a cada alteração
```

Cobrem a matemática de hexágonos (ida e volta pixel↔hex, anéis, linhas, arestas), a câmera, as operações, o desfazer entre dois jogadores e a validação de dados.

## Próximas fases

- **2.** Painel do hexágono (nome, nota), regiões (cor, borda, rótulo, hierarquia), marcadores, painel que sobe da base no celular.
- **3.** Rios e estradas pelas arestas, token do grupo, régua de distância.
- **4.** Servidor: `RepositorioPocketBase`, papéis (jogador e mestre), camada privada do mestre, presença (cursores).
- **Depois.** Se desenhar pesar com mapas grandes, guardar cada chunk num bitmap (cache invalidado ao editar).
