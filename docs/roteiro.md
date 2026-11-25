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
- [x] Fase 4, parte 1: mapa ligado ao servidor (repositório por campanha, conta como autor, eco, chunk que falha, token na ordem de chegada, mapa desatualizado, edição recusada)
- [x] Fase 4, parte 2: camada do mestre na tela (notas privadas, hexágonos ocultos, ocultar e revelar, ver como jogador)
- [x] Fase 4, parte 3: trava do mapa e levar o mapa do navegador para a campanha, com importação como lote do servidor
- [x] Fase 4, parte 4a: viagem da campanha (o mestre edita regras e estoque, os jogadores leem e simulam), ligada ao servidor desde que o `RepositorioPocketBase` ganhou os três métodos (24/11/2026)
- [x] Fase 4, parte 4b: exportar e importar a camada do mestre (botão próprio, arquivo à parte, ocultos e notas no mesmo lote de importação)
- [ ] Presença (fora por enquanto: o PocketBase não tem mensagem efêmera)
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
- [x] Ligar o mapa ao servidor, com o GrifoCaolho: parte 1 feita (lista do que combinar em `docs/servidor/README.md`). A camada do mestre na tela e o resto seguem em entregas do mapa.
- [x] Viagem da campanha no servidor, pedida pelo GrifoCaolho: coleção `viagens`, um registro por campanha que só o mestre grava, com regras testadas, e `carregarViagem`, `gravarViagem` e `assinarViagem` no `RepositorioPocketBase`
- [ ] Fichas sincronizadas: todos editando e vendo a mesma ficha em tempo real
- [ ] Ensaio de restauração do backup com um clique: um script no PC do anfitrião que confere se o último backup volta, sem seguir passos à mão
- [ ] Rodízio de anfitrião, se o grupo decidir: qualquer membro hospeda o servidor, um por vez, com troca de dados automática pelo Google Drive

## Dados (Pedro)

- [x] Aba Dados: um botão para cada dado (d2 a d20), sorteio no servidor, histórico da campanha e rolagem secreta do mestre
- [ ] Dados 3D na aba Dados: o dado cai no feltro e para na face que o servidor sorteou (precisa do ok para a dependência Three.js)
- [ ] Dados 3D caindo sobre o mapa (depende do GrifoCaolho aprovar o visual)

## Quadro (Pedro)

- [x] Servidor do quadro: imagens protegidas da campanha, itens e notas, com regras testadas e limite de espaço, e o `RepositorioQuadroPocketBase`
- [x] Aba Quadro: quadro de cortiça por campanha, biblioteca de imagens e notas, em tempo real
- [x] Imagens de exemplo para testar o quadro, e a Mesa de teste com o quadro montado
- [ ] Itens secretos do mestre: imagens enviadas antes de serem achadas, numa parte que só o mestre vê, reveladas na hora certa
- [ ] Barbante ligando itens

## Fichas (os dois, congelada)

- [ ] Fórmulas e rolagens: campos calculados e botões como `roll@forca`
- [ ] Painel do mestre: os campos importantes de todos os jogadores numa tela só

## Extras

- [ ] Ordem de iniciativa
- [ ] Relógios de ameaça do mestre compartilhados
- [x] Imagens e anotações da campanha: feito como a aba Quadro
- [ ] Abas baixadas sob demanda: o pacote principal do app está perto do aviso de 500 KB do Vite, e cada aba baixada só ao abrir deixa o app mais rápido no celular
