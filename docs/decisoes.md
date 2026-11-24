# Decisões

Registro curto das decisões que mudam o rumo do projeto. A mais nova fica em cima. Cada entrada diz o que foi decidido e por quê.

## 2026-11-24

- **Área própria para o quadro de cortiça, do Pedro.** Cada campanha ganha um quadro, que todos veem, com imagens enviadas ao servidor (itens achados na campanha) e notas dos jogadores. Ele não cabe em nenhuma área atual. Com área própria (`app/src/quadro/`), a aba entra sem mexer em arquivos de outros. As coleções, as regras e o repositório no servidor seguem na área `servidor`.

## 2026-11-23

- **O servidor sorteia os dados.** O app manda só qual dado, e o hook sorteia com o gerador criptográfico do servidor. Se o navegador sorteasse, bastaria mandar o pedido à mão para escolher o resultado. A regra recusa um pedido que traga o resultado ou quem rolou.
- **Rolagem secreta em coleção própria.** `rolagens_secretas` só os mestres leem, como as outras coisas secretas do mestre. Uma marcação dentro de `rolagens` dependeria de a regra nunca errar o filtro, e o tempo real mandaria a coleção inteira para as mesmas regras. Os jogadores não ficam sabendo nem que houve uma rolagem secreta.
- **Rolagens guardadas por 7 dias**, como os lotes do mapa: dá para rever a sessão, e o backup não cresce para sempre.
- **Sem limite de pedidos próprio para rolagens.** O padrão do PocketBase, 20 criações a cada 5 segundos por pessoa, sobra para quem clica nos botões.
- **Rolagem só no aparelho, sem campanha.** Sem servidor, a aba continua útil, com o gerador do navegador, e diz que as rolagens não são compartilhadas.
- **Dados 3D depois, com animação roteirizada.** Quando vierem, o dado gira e para na face que o servidor sorteou, sem física de verdade: com física, cada tela simularia um quique diferente, e o resultado sairia do navegador. As bibliotecas prontas de dados 3D estão paradas desde 2022 a 2024, então a base seria o Three.js, que é mantido.
- **Área própria para os dados, do Pedro.** A rolagem de dados não é de nenhuma área: o sorteio e o histórico ficam no servidor, e um dia os dados 3D vão cair por cima do mapa. Com área própria (`app/src/dados/`), a aba Dados entra sem mexer nos arquivos do mapa, e o GrifoCaolho continua decidindo o visual do mapa: os dados 3D por cima dele só entram depois de ele aprovar. O sorteio, as coleções e o repositório no servidor seguem na área `servidor`.

## 2026-11-22

- **Camada do mestre no servidor, combinada com o GrifoCaolho.** Privado é só a nota privada e o hexágono oculto, com os marcadores dele. Regiões são sempre públicas. A parte privada vai no mesmo lote, para revelar ser uma gravação só, e o servidor a separa em coleções que só o mestre lê, com numeração própria: assim jogador nenhum recebe essa parte nem percebe, pelos números, que ela existe. Um hexágono público e um oculto podem ocupar a mesma posição: se o servidor recusasse o jogador que pinta ali, ele descobriria o segredo pela recusa.
- **Tipo do lote conferido pelo servidor.** `importacao` e reversão de lote de outra pessoa são só do mestre. Edição comum tem até 2.000 mudanças, e a importação, até 20 mil num lote só, para entrar inteira e se desfazer num passo. O tipo é declarado pelo app, então não impede um jogador de apagar muito numa edição comum: contra isso valem o limite de tamanho, o de frequência e o histórico de 7 dias, que deixa o mestre desfazer.
- **Trava do mapa.** O mestre pode deixar só ele editar (`permissao` no mapa), para a mesa em que só o mestre desenha. O token do grupo continua livre.
- **Lotes guardados por 7 dias, e não 30.** Combinado com o GrifoCaolho. Backups menores, e o mestre reverte o que aconteceu na última semana. O preço: com sessões semanais, o histórico da sessão anterior some perto da seguinte, e uma aba esquecida aberta de uma semana para outra precisa recarregar o mapa. Se fizer falta, o prazo muda numa constante só.
- **Mapa sincronizado por lotes numerados pelo servidor.** O app grava o lote inteiro, e um hook do servidor, numa transação, valida, dá o número de ordem e aplica nos hexágonos e regiões. Só o servidor grava hexágonos e regiões. O tempo real do PocketBase avisa registro por registro, e o contrato do mapa pede lotes inteiros na ordem do servidor: um registro por lote resolve as duas coisas, sem a API de batch. Um lote repetido responde como gravado, para o app poder reenviar sem medo.
- **Um mapa por campanha, por enquanto, editável por quem participa.** A camada privada do mestre e quem pode editar ficam para combinar com o GrifoCaolho, junto com ligar o mapa ao servidor.
- **Lotes apagados depois de 30 dias.** O estado do mapa fica nos hexágonos, e os lotes entrariam para sempre em todo backup. A numeração fica num contador no mapa, para não recomeçar. Um app que precise de um lote já apagado avisa que o mapa tem de ser recarregado, em vez de seguir errado.
- **Tamanho do chunk e formato da chave viram contrato entre mapa e servidor.** O servidor calcula o chunk de cada hexágono para o app carregar por chunk. Os casos, com negativos, são conferidos pelos dois lados.
- **Limite de pedidos próprio para lotes.** Cada pincelada é um lote, e o limite padrão do PocketBase para criar registros barraria quem pinta tocando rápido.

- **Rodízio de anfitrião só depois de mapa e fichas no servidor.** O grupo ainda vai decidir se quer que qualquer membro possa hospedar. Se quiser, o rodízio entra depois de mapa e fichas estarem no servidor e testados, para não misturar problemas de sincronia com problemas de troca de anfitrião. Até lá, o servidor fica portátil: tudo no `pb_data`, mudanças por migração e nada específico de um PC no banco. O plano está em `docs/servidor/README.md`.
- **Painel de administrador só no PC do servidor.** Com o servidor na internet, a conta de administrador é o alvo mais valioso. A configuração "Superuser IPs" aceita o administrador só de `127.0.0.1`. O preço: administrar só no próprio PC, e não pelo celular.
- **Backup a cada hora, com cópia numa pasta sincronizada com a nuvem.** O servidor mora num notebook, que pode estragar ou sumir. A cópia usa a nuvem que a pessoa já tem, sem serviço novo.
- **Link de convite com o servidor preenchido (`?servidor=`).** Os amigos só abrem um link, sem digitar o endereço do Funnel.
- **Login numa aba, sem bloquear o app.** A aba Campanha cuida do login e da escolha da campanha. Sem entrar, as fichas e o mapa continuam funcionando só no navegador, como antes.
- **Endereço do servidor escolhido na tela de login.** O `VITE_POCKETBASE_URL` vira só o padrão. Assim o mesmo site de teste funciona com o PocketBase no próprio PC ou com o endereço do Tailscale Funnel de quem hospeda.
- **SDK oficial do PocketBase como dependência (`pocketbase` no npm).** Ele cuida do login, da renovação da sessão e do tempo real. Escrever isso à mão daria mais código e mais chance de erro.
- **Servidor no PC de quem hospeda, com Tailscale Funnel.** É de graça, dá um endereço HTTPS fixo, funciona atrás de CGNAT e não precisa de domínio. Os amigos só abrem o site. O Cloudflare saiu do plano: o túnel grátis não tem Server-Sent Events, que o tempo real do PocketBase usa, e o túnel com nome exige um domínio pago. Nuvem grátis (Oracle) e hospedagem paga (PocketBase Cloud, PocketHost) ficam para depois, se o PC ligado virar problema. Mudar é copiar a pasta `pb_data`.
- **Sem P2P.** Os dados só passariam entre quem está online ao mesmo tempo, o segredo do mestre e as permissões ficariam sem garantia, e a sincronia do mapa teria de ser refeita.
- **Contas com cadastro fechado e login por e-mail e senha.** O administrador cria cada conta pelo painel, e uma conta vale para todas as campanhas. Com o servidor na internet, ninguém de fora consegue se cadastrar. E-mail é o padrão do PocketBase e permite ligar o "esqueci a senha" no futuro.
- **Vários mestres por campanha, e nunca nenhum.** O servidor recusa tirar ou rebaixar o último mestre.
- **PocketBase 0.40.6 fixo.** A versão fica em `pocketbase/VERSAO` e só muda numa tarefa própria, porque o PocketBase ainda muda a API entre versões.
- **Rios e estradas moram no hexágono dono da aresta.** Mesma razão dos marcadores: lotes, chunks e desfazer funcionam sem código novo. O preço: só se liga onde os dois hexágonos da aresta existem. O contrato `Hexagono` ganhou os campos `rios` e `estradas` (Pedro: a coleção de hexágonos do servidor precisa guardá-los).
- **Token do grupo fora dos lotes.** É um estado só, muito mutável, e vale o mais recente. Entra no `RepositorioMapa` como três métodos opcionais (`carregarToken`, `gravarToken`, `assinarToken`), então a implementação do servidor continua compilando sem eles. Quando existir o PocketBase, vale uma coleção própria com um registro por mapa.
- **Régua só local.** Cada jogador mede o que quiser, sem sincronizar.

## 2026-11-21

- **Tudo automático na entrega.** Um pull request entra sozinho na `main` quando a verificação passa, sem revisão humana. As áreas são bem separadas, e a responsabilidade pela divisão é das pessoas. Quando uma tarefa mexe na área do outro, o Claude analisa os riscos, avisa antes e registra na descrição do pull request. Não há bloqueio automático por área.
- **Squash na entrega.** Cada tarefa vira um único commit na `main`, para o histórico ficar legível. Branches juntadas são apagadas sozinhas.
- **Repositório público e site de teste no GitHub Pages.** Libera proteção da `main` e site de teste sem custo. O código não tem segredos.
- **Sem aviso automático no Discord.** O histórico de pull requests basta por enquanto.
- **Telas descobertas automaticamente.** Cada área registra as próprias telas em `tela.ts`, e o núcleo encontra sozinho. Assim ninguém precisa editar arquivo compartilhado para criar uma tela.
- **Tema no núcleo.** Variáveis de cor, temas claro e escuro e botões comuns saíram da ficha para `app/src/nucleo/`, porque o mapa também usa.
- **Documentação em `docs/`.** Um lugar só, separado por área, com roteiro, decisões e contratos.
- **Divisão de áreas.** GrifoCaolho cuida do mapa e da mesa. Pedro cuida do PocketBase, da conexão e da hospedagem. As fichas ficam congeladas até os dois voltarem a elas juntos.
- **Conversa no Discord.** Voz, chat e transmissão de tela ficam fora do projeto. Sem LiveKit e sem Docker: o PocketBase sozinho, um único executável, dá conta de login, dados e tempo real.
