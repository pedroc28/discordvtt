# Roteiro

O que já está pronto e o que vem depois. O Claude marca os itens ao terminar cada tarefa.

## Pronto

- [x] Editor de fichas: layout livre, tipos de campo, páginas, modo escuro, barra de vida, relógio do Apocalypse World
- [x] Mapa hexagonal infinito: pintar terreno, desfazer por jogador, sincronia entre abas, toque e mouse (fases 0 e 1)
- [x] Mapa hexagonal: nome e nota por hexágono, regiões com hierarquia e marcadores (fase 2)
- [x] Mapa hexagonal: rios, estradas, token do grupo e régua de distância (fase 3)
- [x] Reorganização do repositório: áreas, telas automáticas, regras para os Claudes, entrega automática e site de teste
- [x] Base do servidor no PocketBase: contas, campanhas, mestres e jogadores
- [x] Aba Campanha: login, escolha da campanha, quem participa e troca de senha, atualizando em tempo real
- [x] Base do mapa no servidor: coleções, regras, sincronia por lotes numerados e `RepositorioPocketBase` (ainda não ligado ao mapa)

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
- [x] Hospedagem: no ar para o grupo, de graça, com Tailscale Funnel no PC do Pedro e backup copiado para o Google Drive, com a restauração ensaiada
- [x] Base do mapa no servidor: um mapa por campanha, hexágonos, regiões, token e lotes, com regras testadas, limpeza de lotes antigos e o `RepositorioPocketBase`
- [x] Servidor de teste local, com mestre e jogadores, e testes do `RepositorioPocketBase` contra um PocketBase de verdade na verificação do GitHub
- [x] Camada do mestre no servidor: notas privadas e hexágonos ocultos que só o mestre lê, revelar num lote só, importação e reversão conferidas pelo servidor e trava do mapa
- [x] Rolagens de dados no servidor: sorteio pelo servidor, rolagens abertas e secretas com regras testadas, limpeza depois de 7 dias e o `RepositorioDadosPocketBase`
- [ ] Ligar o mapa ao servidor, com o GrifoCaolho (lista do que combinar em `docs/servidor/README.md`)
- [ ] Fichas sincronizadas: todos editando e vendo a mesma ficha em tempo real
- [ ] Rodízio de anfitrião, se o grupo decidir: qualquer membro hospeda o servidor, um por vez, com troca de dados automática pelo Google Drive

## Dados (Pedro)

- [x] Aba Dados: um botão para cada dado (d2 a d20), sorteio no servidor, histórico da campanha e rolagem secreta do mestre
- [ ] Dados 3D caindo sobre o mapa (depende do GrifoCaolho aprovar o visual)

## Quadro (Pedro)

- [ ] Servidor do quadro: imagens protegidas da campanha, itens e notas, com regras testadas e limite de espaço
- [ ] Aba Quadro: quadro de cortiça por campanha, biblioteca de imagens e notas, em tempo real
- [ ] Barbante ligando itens e itens secretos do mestre (depois)

## Fichas (os dois, congelada)

- [ ] Fórmulas e rolagens: campos calculados e botões como `roll@forca`
- [ ] Painel do mestre: os campos importantes de todos os jogadores numa tela só

## Extras

- [ ] Ordem de iniciativa
- [ ] Relógios de ameaça do mestre compartilhados
- [ ] Imagens e anotações da campanha
