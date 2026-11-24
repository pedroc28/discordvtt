# Área do quadro

Dono: Pedro (pedroc28). A aba Quadro: o quadro de cortiça da campanha, com a biblioteca de imagens e as notas. O que ela faz e como funciona está em [`docs/quadro.md`](../../../docs/quadro.md).

## Regras da área

- O quadro só existe com campanha aberta. Esta pasta fala com o servidor só por `abrirRepositorioQuadro()` e `useServidor()`, e o contrato está em `repositorio.ts`.
- As coleções, as regras e o repositório do servidor são da área do servidor (`pocketbase/` e `app/src/servidor/`).
- Os números de `tipos.ts` (tamanho do quadro, cores e `LIMITES_QUADRO`) são contrato com a migração `pocketbase/pb_migrations/1795321006_quadro.js`. Mudar um lado é mudar o outro na mesma tarefa.
- Imagem só aparece por `urlDaImagem`: o link direto do servidor não abre, porque as imagens são protegidas.
- Antes de enviar, a imagem é reconvertida pelo app: reduz o tamanho e apaga os dados escondidos da foto, como a localização.
- O estado da aba fica fora do React, com teste. O componente só lê o estado e chama operações.
- As imagens de exemplo (`exemplos/`) são desenhos do projeto, nunca imagens de terceiros. Para trocar uma, edite o SVG em `exemplos/desenhos/`, gere o `.webp` e atualize a largura e a altura em `exemplos/lista.json`, que o servidor de teste também usa.
