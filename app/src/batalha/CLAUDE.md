# Mapa de batalha

Dono: GrifoCaolho, a mesma área do mapa hexagonal. Leia antes de mexer aqui: [`docs/mapa/batalha.md`](../../../docs/mapa/batalha.md) e as regras de [`../mapa/CLAUDE.md`](../mapa/CLAUDE.md).

## Regras da área

- Tudo em coordenadas da imagem, em pixels. A câmera é a de `../mapa/camera.ts`.
- `grade.ts`, `regua.ts` e `operacoes.ts` são puros e testados. Contas novas entram aí, com teste, e não em `TelaBatalha.tsx`.
- Operações devolvem a cena nova e nunca alteram a que receberam. Dado de fora passa por `normalizarCena` antes de ser usado.
- A cena e a imagem de fundo ficam atrás de `RepositorioBatalha`. A tela não fala com o IndexedDB nem com o servidor direto.
- O tamanho da célula é o lado da quadrada, ou a distância entre dois lados paralelos do hexágono.
- Classes de CSS começam com `batalha__`.
