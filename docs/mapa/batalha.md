# Mapa de batalha

Segunda tela do mapa, ao lado do mapa hexagonal de viagem: o mestre põe uma imagem de fundo (um mapa de masmorra, uma cidade, o que for), a grade é desenhada por cima e os tokens se movem sobre ela. Código em `app/src/batalha/`, tela registrada em `tela.ts` (aba "Batalha", ordem 22).

## O que existe hoje

Tudo local, neste navegador. A cena e a imagem ficam no IndexedDB (`discordvtt-batalha`), e ainda não vão para o servidor. Dá para levar a cena a outro navegador por arquivo.

- **Fundo:** PNG, JPEG ou WebP, até 40 MB. Imagem de até 4096 pixels no lado maior fica como veio (pixel art não é reamostrada). Maior que isso é reduzida para 4096. Sem imagem, o plano é infinito e a grade vale do mesmo jeito.
- **Grade:** quadrada, hexágono pontudo, hexágono chato ou sem grade. Tamanho da célula, deslocamento horizontal e vertical, cor (clara, escura ou framboesa) e força ajustáveis, e dá para escondê-la. O tamanho é o lado da quadrada, ou a distância entre dois lados paralelos do hexágono.
- **Calibrar a grade na imagem:** a ferramenta **Medir a célula** (arraste ao longo de N células, e o tamanho sai da conta) e a ferramenta **Alinhar a grade** (arraste para encostar a grade nas linhas da imagem). Os campos numéricos dão o ajuste fino.
- **Tokens:** **Adicionar token** põe um no centro da tela. Arraste para mover, toque para escolher e editar nome, tamanho (0,5 a 4 células) e cor. Delete tira o token escolhido, e Esc tira a seleção. Até 200 por mapa.
- **Encaixe:** ligado, o token assenta na célula ao ser movido. Na grade quadrada, tamanho ímpar centra na célula e tamanho par centra no cruzamento das linhas. Nos hexágonos, sempre no centro da célula. Desligado, o token fica onde foi solto.
- **Régua:** arraste de um ponto a outro. Com grade, mede célula a célula, de centro a centro. Sem grade, mede em linha reta pelo tamanho de referência. Mostra as células e o valor no mundo do jogo (por padrão 1 célula = 1,5 m, com valor e unidade ajustáveis). Na grade quadrada há três regras de diagonal: vale 1, alterna 1 e 2 (1, 2, 1, 2), ou linha reta. Nos hexágonos não há diagonal. A régua é só local, como a do mapa hexagonal.
- **Exportar e importar:** o painel tem a seção **Arquivo**. **Exportar a cena** baixa um JSON (`batalha-<nome>-<data>.json`) com a cena inteira (grade, medida, encaixe e tokens) e a imagem de fundo em base64. **Importar uma cena** lê o arquivo, mostra o resumo (tokens, imagem e tipo de grade) e só troca a cena de agora depois de **Trocar a cena**. A troca vale para a imagem, a grade e os tokens, e não tem desfazer, então o aviso sugere exportar antes. O arquivo é validado: token quebrado ou repetido fica de fora e é contado, campo ruim da grade volta ao padrão, imagem que não é PNG, JPEG ou WebP (ou com base64 quebrado) faz o arquivo ser recusado com o motivo, e versão mais nova que a do app também. O tamanho do fundo vem da imagem de verdade, não do que o arquivo diz. Arquivo de mais de 80 MB não é lido, e imagem com mais de 16384 pixels de lado é recusada.
- **Câmera:** arrastar o fundo, roda do mouse e pinça com dois dedos para o zoom, botões de aproximar, afastar e mostrar a imagem inteira.

## Como o código se organiza

```
tipos.ts        Cena, Grade, TokenBatalha, Medida, RepositorioBatalha
grade.ts        geometria das grades: célula de um ponto, centro, encaixe, distância, contorno (puro)
regua.ts        medir entre dois pontos e o texto da medida (puro)
operacoes.ts    editar a cena sem alterar a original, e validar o que vem de fora (puro)
repositorio.ts  RepositorioBatalhaLocal (IndexedDB) e RepositorioBatalhaMemoria (testes)
arquivo.ts      montar, ler e validar o arquivo da cena (puro)
arquivo-navegador.ts  imagem para base64 e de volta, e baixar o arquivo
desenho.ts      pinta a cena no canvas
fundo.ts        prepara a imagem escolhida (canvas)
TelaBatalha.tsx a tela: barra, canvas, painel, mouse e toque
batalha.test.ts testes da geometria, da régua, das operações e do repositório
arquivo.test.ts  testes do arquivo da cena
```

Os dados são JSON simples em coordenadas da imagem (pixels). O arquivo tem `formato: "batalha-vtt"`, `versao`, `exportadoEm`, `cena` e `imagem` (`{ tipo, dados }` ou `null`). A câmera é a mesma do mapa hexagonal (`mapa/camera.ts`).

## Decisões

- **A mesma área do mapa.** O mapa de batalha é do GrifoCaolho como o mapa hexagonal, então não ganhou área nova: a linha `mapa` da tabela de áreas do `CLAUDE.md` passou a incluir `app/src/batalha/`.
- **Uma cena por vez, por enquanto.** O modelo já tem `id`, então várias cenas (um encontro por cena) entram junto com o servidor.
- **A imagem fica fora da cena.** A cena é um JSON pequeno gravado a cada movimento, e a imagem é um arquivo grande gravado só quando se escolhe.
- **Hexágonos medidos lado a lado.** O tamanho da célula hexagonal é a distância entre dois lados paralelos, como o lado da célula quadrada, para o mesmo número servir nas duas grades.

## O que falta

- Ligar ao servidor: uma cena por campanha, só o mestre muda o fundo e a grade, tokens com dono, e a coleção correspondente no PocketBase (pedido ao Pedro).
- Várias cenas por campanha.
- Névoa de guerra e tokens ligados às fichas.
