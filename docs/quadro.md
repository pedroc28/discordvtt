# Quadro

Dono: Pedro. Um quadro de cortiça por campanha, que todos veem: imagens de itens achados na campanha e notas dos jogadores, para organizar as ideias. As imagens ficam numa biblioteca da campanha e podem ser presas no quadro quando quiserem.

**Situação:** o servidor e o repositório estão prontos (ver `docs/servidor/README.md`, seção "Quadro", e `docs/contratos.md`, "Quadro e servidor"). A aba vem a seguir.

## Combinado

- Um quadro por campanha. Sem campanha aberta, não há quadro: ele existe para ser compartilhado.
- Todos enviam imagens e prendem, movem e mudam o tamanho de qualquer item.
- A nota só quem escreveu edita, nem o mestre.
- Tirar um item do quadro: quem prendeu ou o mestre. Renomear e apagar imagens da biblioteca: quem enviou ou o mestre. Apagar uma imagem tira ela do quadro.
- Imagens PNG, JPEG ou WebP. O app reduz para 1600 px no lado maior antes de enviar, e o servidor aceita até 2 MB por imagem e 50 MB por campanha.
- Depois: itens secretos do mestre e barbante ligando itens.
