# Roteiro

O que já está pronto e o que vem depois. O Claude marca os itens ao terminar cada tarefa.

## Pronto

- [x] Editor de fichas: layout livre, tipos de campo, páginas, modo escuro, barra de vida, relógio do Apocalypse World
- [x] Mapa hexagonal infinito: pintar terreno, desfazer por jogador, sincronia entre abas, toque e mouse (fases 0 e 1)
- [x] Mapa hexagonal: nome e nota por hexágono, regiões com hierarquia e marcadores (fase 2)
- [x] Mapa hexagonal: rios, estradas, token do grupo e régua de distância (fase 3)
- [x] Reorganização do repositório: áreas, telas automáticas, regras para os Claudes, entrega automática e site de teste
- [x] Base do servidor no PocketBase: contas, campanhas, mestres e jogadores
- [x] Aba Campanha: login, escolha da campanha e quem participa, atualizando em tempo real

## Mapa (GrifoCaolho)

- [x] Fase 3: rios, estradas, token do grupo e régua
- [x] Token do grupo arrastável
- [x] Aba lateral recolhível de viagem e provisões, com ferramenta Rota
- [x] Campo, geleira e cânion retrabalhados
- [x] Exportar e importar o mapa em arquivo JSON (mesclar ou substituir, com desfazer)
- [ ] Fase 4: mapa no servidor, papéis, camada privada do mestre e presença (depende da base no PocketBase)
- [x] Paleta de terrenos com pastas e pesquisa por tag (mínimo 3 tags por terreno)
- [x] Arte final dos terrenos em pixel art (PixelLab): os 45 terrenos feitos, guia e lista em `docs/mapa/arte.md`
- [x] Ícones de marcador em pixel art (12 ícones de 64 × 64, na pasta `pixel`)
- [x] Token do grupo em pixel art, e rios e estradas desenhados pixel a pixel
- [x] Transições entre terrenos por pontilhado: feitas e **desligadas** no tileset `pixel` (decisão de 22/11/2026: não agradaram). O código fica, e liga-se com `"transicoes": true`
- [ ] Mesa com tokens ligados às fichas e névoa de guerra

## Servidor (Pedro)

- [x] Base no PocketBase: contas, campanhas, mestres e jogadores, com regras de acesso testadas
- [x] Login no app e escolha da campanha, com gerenciamento de participantes e tempo real
- [x] Hospedagem: no ar para o grupo, de graça, com Tailscale Funnel no PC do Pedro e backup copiado para o Google Drive
- [ ] `RepositorioPocketBase` para o mapa
- [ ] Fichas sincronizadas: todos editando e vendo a mesma ficha em tempo real
- [ ] Rodízio de anfitrião, se o grupo decidir: qualquer membro hospeda o servidor, um por vez, com troca de dados automática pelo Google Drive

## Fichas (os dois, congelada)

- [ ] Fórmulas e rolagens: campos calculados e botões como `roll@forca`
- [ ] Painel do mestre: os campos importantes de todos os jogadores numa tela só

## Extras

- [ ] Ordem de iniciativa
- [ ] Relógios de ameaça do mestre compartilhados
- [ ] Imagens e anotações da campanha
