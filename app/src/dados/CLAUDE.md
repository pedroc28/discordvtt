# Área dos dados

Dono: Pedro (pedroc28). A aba Dados: um botão para cada dado, a última rolagem em cima do feltro e o histórico da campanha. O que ela faz e como funciona está em [`docs/dados.md`](../../../docs/dados.md).

## Regras da área

- Quem sorteia é sempre um `RepositorioDados`: o servidor, na campanha, ou o gerador criptográfico do navegador, na rolagem local. Nenhum outro código escolhe um resultado, e o `Math.random` não serve para sorteio.
- O sorteio, as coleções e o repositório do servidor são da área do servidor (`pocketbase/` e `app/src/servidor/`). Esta pasta só fala com o servidor por `abrirRepositorioDados()` e `useServidor()`.
- A rolagem secreta só existe para o mestre. Esconder na tela não conta: quem garante é a regra da coleção `rolagens_secretas`.
- O estado da aba fica em `mesa.ts`, fora do React, com teste. O componente só lê o estado e chama `rolar`.
- O que fica em cima do feltro usa as cores claras fixas de `dados.css` (`--dados-giz`, `--dados-marfim`), porque o feltro é escuro nos dois temas. O resto usa as variáveis do tema.
- Animação sempre com `prefers-reduced-motion` respeitado, no CSS e no tempo mínimo de giro da mesa.
- Os dados 3D por cima do mapa só entram depois de o GrifoCaolho aprovar o visual. Até lá, nada desta área aparece na tela do mapa.
