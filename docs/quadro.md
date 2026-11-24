# Quadro

Dono: Pedro. Um quadro de cortiça por campanha, que todos veem: imagens de itens achados na campanha e notas dos jogadores, para organizar as ideias. As imagens ficam numa biblioteca da campanha e podem ser presas no quadro quantas vezes quiserem.

## Como usar

- **Abrir:** aba **Quadro**, com uma campanha aberta na aba Campanha. O quadro abre mostrando os itens que já estão nele.
- **Mexer na vista:** arraste a cortiça para andar. A roda do mouse, a pinça no celular e os botões **+** e **−** dão zoom. **Ver o quadro todo** mostra o quadro inteiro.
- **Enviar imagem:** em **Imagens**, **Enviar imagem**, uma ou várias de uma vez. Cada imagem vai para a biblioteca e já entra presa no meio da tela.
- **Nova nota:** escreva até 500 caracteres, escolha a cor do papel e **Prender nota**.
- **Itens:**
  - toque ou clique num item para escolher, e arraste para mudar de lugar
  - quem é arrastado vai para cima dos outros
  - na imagem escolhida, a bolinha no canto muda o tamanho
  - com o teclado: Tab chega aos itens, as setas movem (com Shift, mais longe), Enter abre e Delete tira do quadro
- **Barra do item escolhido:**
  - **Abrir** mostra a imagem grande, para ler detalhes, ou a nota inteira
  - **Editar nota** só aparece para quem escreveu a nota
  - **Tirar do quadro** aparece para quem prendeu o item e para o mestre. Tirar uma nota pede confirmação, porque o texto se perde. Tirar uma imagem não pede: ela continua na biblioteca.
- **Biblioteca:**
  - cada imagem tem **Pôr no quadro**, que vira **Pôr outra cópia** se ela já estiver presa
  - **Renomear** e **Apagar** aparecem para quem enviou a imagem e para o mestre
  - apagar uma imagem tira ela do quadro também
  - embaixo de "Enviar imagem" aparece o espaço usado da campanha
- **Tempo real:** o que uma pessoa faz aparece para as outras. Um item arrastado muda de lugar para os outros quando a pessoa solta.

## Imagens

- O app prepara cada imagem antes de enviar: reduz o lado maior para 1600 px, converte para WebP (ou PNG e JPEG no Safari, que não gera WebP) e mantém a transparência.
- A conversão apaga os dados escondidos do arquivo, como a localização das fotos de celular, e endireita a foto conforme a orientação gravada nela.
- No teste, uma foto de 3000 por 2000 px com 2,3 MB virou 1600 por 1067 px com 480 KB.
- O servidor aceita até 2 MB por imagem e 50 MB por campanha. As imagens são protegidas: só quem participa da campanha abre, mesmo com o link.
- No quadro aparece a miniatura de 320 px. Com muito zoom num item grande, e ao abrir, o app baixa a imagem inteira.

## Como funciona

- `tipos.ts`: imagens, itens, cores e os limites, que são contrato com o servidor.
- `repositorio.ts`: o contrato `RepositorioQuadro` (ver `docs/contratos.md`, "Quadro e servidor"). A implementação é do servidor (`app/src/servidor/repositorio-quadro.ts`).
- `operacoes.ts`: funções puras.
  - aplicar o que chega do servidor
  - quem pode o quê
  - itens novos, que entram por cima de todos e levemente tortos
  - limites
  - a vista: zoom no ponto do cursor, quadro todo e itens na tela
- `estado.ts`: o estado da aba, fora do React.
  - guarda a biblioteca, os itens e as imagens baixadas, até 4 de cada vez
  - mover muda na hora, e volta se o servidor recusar
  - cria o repositório ao abrir e pode abrir de novo, como o React faz em desenvolvimento
- `preparar-imagem.ts`: a redução e a conversão no navegador.
- `TelaQuadro.tsx`: os gestos (arrastar, pinça, roda, alça, teclado) e o desenho. `Biblioteca.tsx` é o painel de imagens, e `Janela.tsx`, a janela de ver e de escrever.
- `TelaQuadroSobDemanda.tsx`: a aba só é baixada quando alguém abre o quadro, para não pesar no carregamento do resto do app.

No servidor, as coleções, as regras e o limite estão em `docs/servidor/README.md`, seção "Quadro".

## Próximos passos

- Itens secretos do mestre: imagens enviadas antes de serem achadas, numa parte que só o mestre vê, reveladas na hora certa.
- Barbante ligando itens.
- Ver o item sendo arrastado pelos outros durante o arraste, e não só quando a pessoa solta.
