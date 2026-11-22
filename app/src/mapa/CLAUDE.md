# Área do mapa

Dono: GrifoCaolho. Leia antes de mexer aqui: [`docs/mapa/manual.md`](../../../docs/mapa/manual.md), o manual do módulo, e [`docs/mapa/diario.md`](../../../docs/mapa/diario.md), com as decisões, o que foi feito por fase e os próximos passos.

## Regras da área

- Geometria pointy-top em coordenadas axiais `(q, r)`. A ordem das 6 direções (horária, a partir do leste) é contrato: arestas e cantos usam a mesma ordem.
- O mapa é esparso e dividido em chunks de 16 × 16. Chunk é a unidade de carregar, guardar e sincronizar.
- Ninguém altera o mapa direto: as operações puras devolvem mudanças, e uma pincelada vira um `Lote`, que é a unidade de rede, gravação e desfazer.
- Tudo até `entrada.ts` não depende de React e roda nos testes em Node.
- A arte do tileset padrão é gerada por `app/tools/gerar-tileset.mjs`. Não edite os arquivos gerados à mão.
- `RepositorioMapa`, `Lote`, `Mudanca` e `Hexagono` são contrato com o servidor (ver `docs/contratos.md`).

Ao terminar uma fase, atualize `docs/mapa/diario.md` e o `docs/roteiro.md`.
