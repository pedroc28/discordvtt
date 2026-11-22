# Servidor

Dono: Pedro. Passos 1, 2 e 3 prontos: o PocketBase tem contas, campanhas e participantes (mestre ou jogador), com regras de acesso testadas, o app tem a aba Campanha, e o servidor está no ar pelo Tailscale Funnel no PC do Pedro, com backup a cada hora copiado para o Google Drive. O passo 4 está pela metade: o servidor já guarda o mapa de cada campanha e o app já tem o `RepositorioPocketBase`, mas o mapa do app ainda não está ligado nele. As fichas ainda não usam o servidor.

Para jogar, o PC do Pedro precisa estar ligado, acordado e com o `iniciar.bat` aberto. Os amigos entram pelo link de convite da aba Campanha.

## Peças

- **PocketBase**: um único executável com banco de dados, login, regras de acesso e tempo real. Fica em `pocketbase/`, com migrações e hooks no Git e o executável e os dados fora dele. A versão é fixa e fica em `pocketbase/VERSAO` (hoje, 0.40.6).
- **Lado do app**: `app/src/servidor/`, com a conexão, o login, a aba Campanha e, mais adiante, as implementações de repositório que as outras áreas usam (ver `docs/contratos.md`). Usa o SDK oficial (`pocketbase` no npm, 0.29).
- **Hospedagem**: o PocketBase roda no PC de quem hospeda e fica acessível pela internet com o Tailscale Funnel. O porquê está em `docs/decisoes.md`.

## Rodar no Windows

1. Baixe o `pocketbase_0.40.6_windows_amd64.zip` na [página da versão 0.40.6](https://github.com/pocketbase/pocketbase/releases/tag/v0.40.6) do PocketBase no GitHub.
2. Tire o `pocketbase.exe` do zip e coloque na pasta `pocketbase` do repositório, ao lado do `iniciar.bat`. O Git ignora o executável e os dados.
3. Dê dois cliques no `iniciar.bat`. Na primeira vez, o PocketBase abre o navegador (ou mostra um endereço na janela) para criar a conta de administrador. Guarde essa senha num lugar seguro, fora do repositório.
4. O painel fica em http://127.0.0.1:8090/_/ e só abre neste PC. Para desligar o servidor, feche a janela do `iniciar.bat`.

Cuidados:

- Não use o comando `pocketbase update`. A partir da 0.40.6 ele busca versões em outro site, e o projeto só troca de versão numa tarefa própria.
- Não mude coleções nem regras pelo painel. Peça ao Claude: toda mudança vira migração. Se aparecer um arquivo novo em `pocketbase/pb_migrations/` que ninguém pediu, foi o painel que gerou. Avise o Claude.
- Os dados ficam em `pocketbase/pb_data/`. Levar o servidor para outro PC é copiar essa pasta com o servidor desligado.

## Contas

- **Cadastro fechado.** O administrador cria a conta de cada pessoa pelo painel, na coleção `users`, com nome, e-mail e senha. Ninguém se cadastra pelo app, mesmo achando o endereço do servidor.
- **Uma conta por pessoa** vale para todas as campanhas. Depois de criada, o mestre de cada campanha só adiciona a pessoa a ela.
- **Login por e-mail e senha.** Cada pessoa troca a própria senha na aba Campanha, em "Sua conta", informando a senha atual. O servidor não envia e-mails, então senha esquecida se troca no painel. Se um dia configurarem um e-mail no painel, o "esqueci a senha" passa a funcionar sozinho.

## Coleções

| Coleção | Campos | Observações |
| --- | --- | --- |
| `users` | `name` (obrigatório, até 60 letras), `email`, `avatar` | A coleção de contas que já vem no PocketBase. Os outros veem o nome, nunca o e-mail. |
| `campanhas` | `nome` (obrigatório, até 80 letras) | |
| `participantes` | `campanha`, `usuario`, `papel` (`mestre` ou `jogador`) | Uma pessoa entra uma vez só em cada campanha. Apagar a campanha ou a conta apaga as participações. |
| `mapas` | `campanha`, `nome`, `ultimaOrdem` | Um por campanha, por enquanto (índice único). Nasce com a campanha. `ultimaOrdem` é o número do último lote gravado. |
| `hexagonos` | `mapa`, `q`, `r`, `chunk`, `dados` | Um registro por hexágono (índice único em mapa, q e r). `dados` é o hexágono inteiro, no formato do contrato. `chunk` é calculado pelo servidor. |
| `regioes` | `mapa`, `regiaoId`, `dados` | `regiaoId` é o id da região no app. `dados` é a região inteira. |
| `tokens_grupo` | `mapa`, `q`, `r`, `ts`, `autor`, `presente` | Um por mapa (índice único), criado junto com ele. `presente` falso é o token fora do mapa. |
| `lotes` | `mapa`, `ordem`, `loteId`, `autor`, `ts`, `mudancas`, `regioes` | O histórico recente de edições do mapa. `ordem` e `autor` são dados pelo servidor. Apagados depois de 7 dias. |

Todas têm `created` e `updated`. Apagar a campanha apaga o mapa e, em cascata, tudo o que é dele.

## Regras de acesso

| Coleção | Ver e listar | Criar | Alterar | Apagar |
| --- | --- | --- | --- | --- |
| `users` | quem está logado | só o administrador | a própria conta | só o administrador |
| `campanhas` | quem participa | qualquer conta, que vira mestre | mestre | mestre |
| `participantes` | quem participa da mesma campanha | mestre | mestre troca o papel, sem mudar a campanha nem a pessoa | mestre, ou a própria pessoa saindo |
| `mapas` | quem participa da campanha | ninguém (nasce com a campanha) | ninguém | ninguém (sai com a campanha) |
| `hexagonos` e `regioes` | quem participa da campanha do mapa | ninguém: só o hook dos lotes | ninguém | ninguém |
| `tokens_grupo` | quem participa da campanha do mapa | ninguém (nasce com o mapa) | quem participa, sem mudar de mapa | ninguém |
| `lotes` | quem participa da campanha do mapa | quem participa da campanha do mapa | ninguém | ninguém (só a limpeza) |

Visitante sem login não vê nada. O administrador, pelo painel, passa por cima de todas as regras.

"Mestre" quer dizer mestre **daquela** campanha. A regra usa o alias `@collection.participantes:mestre` para que campanha, pessoa e papel sejam conferidos na mesma participação. Sem o alias, quem é mestre em uma campanha e jogador em outra conseguiria mandar nas duas.

Por enquanto, quem participa da campanha lê e edita o mapa, mestre ou jogador. A camada privada do mestre ainda não existe.

Hooks, em `pocketbase/pb_hooks/campanhas.pb.js`:

- Toda campanha nasce com o seu mapa e o token do grupo dele, inclusive a criada pelo painel. Quem cria uma campanha pelo app vira mestre dela. Tudo na mesma transação: ou entra tudo, ou nada.
- Uma campanha nunca fica sem mestre. Tirar ou rebaixar o último mestre é recusado com a mensagem "A campanha precisa de pelo menos um mestre. Torne outra pessoa mestre antes."

Configurações, em `pocketbase/pb_migrations/1795321001_configuracoes.js`: nome do app e limite de tentativas ligado (padrão do PocketBase, com login limitado a 2 tentativas a cada 3 segundos por IP).

## Mapa

O servidor guarda o mapa de cada campanha. O contrato com a área do mapa (formato dos dados, `RepositorioMapa` e o que o servidor garante) está em `docs/contratos.md`.

**Sincronia por lotes.** Cada edição do mapa (uma pincelada, um nome, uma região) é um lote, como no navegador. O app grava o lote inteiro na coleção `lotes`, e o hook `pb_hooks/mapa.pb.js` faz o resto numa transação só:

1. Confere o lote inteiro. Um item errado recusa o lote todo, com uma mensagem que diz qual hexágono ou região estava errado.
2. Se um lote com o mesmo id já foi gravado (o app reenviou depois de a conexão cair), responde com o lote que já estava gravado, sem aplicar de novo.
3. Dá o número de ordem: o `ultimaOrdem` do mapa mais 1. O PocketBase grava uma transação de cada vez, então dois lotes nunca recebem o mesmo número.
4. Aplica o "depois" de cada mudança em `hexagonos` e `regioes`, calculando o chunk de cada hexágono.
5. Grava o lote com o "antes" real do servidor no lugar do que o app achava, e com o autor sendo a conta logada.

Se algo falhar, nada muda, nem o número de ordem. Só esse hook grava hexágonos e regiões: as regras de acesso não deixam ninguém gravar direto. O tempo real avisa cada lote novo a quem participa da campanha, e a ordem dos números é a verdade do mapa.

**O que o servidor confere.** Posição inteira e até um milhão de hexágonos do centro, terreno, região, nome (até 500 letras), nota (até 20 mil), marcadores (até 100 por hexágono), rios e estradas só nas direções 0, 1 e 2, cor de região no formato `#rrggbb` e região pai diferente da própria. Campos que o servidor não conhece passam como vieram, para o mapa poder ganhar campos novos sem esperar o servidor. Quando isso acontecer, vale avisar o Pedro para validar o campo novo.

**Tamanho do lote.** Até 20 mil hexágonos e 16 MB por lote. Medido em 22/11/2026: um mapa inteiro de 5 mil hexágonos, com nome, nota e marcador em cada um, dá 1,3 MB e leva 1,6 s no servidor. Importado por cima de um mapa existente, com o "antes" preenchido, dá 2,8 MB e 1,6 s. 20 mil hexágonos com "antes" dão 11,2 MB e 5,4 s. Enquanto um lote grande grava, os outros esperam a vez.

**Chunk.** O servidor calcula a chave do chunk de cada hexágono do mesmo jeito que o `chaveChunk` do mapa (16 × 16, `Math.floor`, chave `"cq,cr"`), e o app carrega os hexágonos por chunk. Os casos conferidos dos dois lados, com coordenadas negativas, ficam em `app/src/servidor/casos-chunk.json`.

**Token do grupo.** Quem participa move o token. Vale o `ts` mais recente: um pedido atrasado responde com o token atual, sem mudar nada. Um `ts` mais de 1 minuto à frente da hora do servidor (relógio errado num celular) é trazido para a hora do servidor, senão o token ficaria preso nele para os outros. O autor é a conta logada.

**Limpeza dos lotes.** Os lotes entram em todo backup e servem para quem está conectado buscar o que perdeu e para o mestre reverter edições, porque o estado do mapa fica nos hexágonos e nas regiões. A cada hora com o servidor ligado, o hook apaga os lotes com mais de 7 dias. O prazo foi combinado com o GrifoCaolho e pode mudar se precisar: é a constante `DIAS_PADRAO_LOTES` em `pb_hooks/mapa.js`. Medido em 22/11/2026: 2.000 pinceladas de 1 a 20 hexágonos aumentam o banco em 7 MB e o backup em 0,9 MB. Com sessões semanais, o histórico da sessão anterior some perto da sessão seguinte, e uma aba esquecida aberta de uma semana para outra precisa recarregar o mapa. A numeração continua de onde parou, porque o contador fica no mapa. Um app que precise de um lote já apagado avisa que o mapa tem de ser recarregado (ver o lado do app, abaixo). A variável `DISCORDVTT_DIAS_LOTES` troca o prazo e só existe para o teste das regras: num servidor normal ela fica vazia.

**Limite de pedidos.** O limite padrão do PocketBase para criar registros (20 a cada 5 segundos por pessoa) barraria quem pinta tocando rápido, porque cada pincelada é um lote. Para lotes vale o limite geral da API: 300 a cada 10 segundos por pessoa.

### Lado do app

`RepositorioPocketBase`, em `app/src/servidor/repositorio-mapa.ts`, é a implementação da `RepositorioMapa` que fala com o servidor. A área do mapa pega um pronto com `abrirRepositorioMapa()`, de `conexao.ts`, que devolve o mapa da campanha aberta, ou null sem login ou sem campanha.

- **Abrir.** No primeiro pedido, acha o mapa da campanha, assina o tempo real dos lotes e do token e só então lê o `ultimaOrdem`. Assim nenhum lote gravado no meio do caminho se perde: os que já estavam gravados estão nos hexágonos que o mapa carrega, e os seguintes chegam como lotes.
- **Lotes na ordem.** Todo lote passa por `fila-lotes.ts`, inclusive o eco do próprio lote e a resposta da gravação: o lote N só é entregue depois do N - 1, e repetidos são ignorados. Se falta um, o repositório espera meio segundo e busca no servidor. Quando o tempo real reconecta, busca o que perdeu.
- **Mapa desatualizado.** Se o lote que falta já foi apagado pela limpeza, o mapa local não tem como ficar certo. O repositório para de entregar lotes, `desatualizado` vira verdadeiro, quem assinou `aoDesatualizar` é avisado, e ler o mapa passa a falhar com "Recarregue o mapa". Gravar continua funcionando.
- **Erros de verdade.** `carregarChunk` falha quando o servidor não responde, em vez de devolver um chunk vazio. As mensagens dizem a causa e o que fazer, começando em minúscula, porque o mapa as mostra depois do que tentava ("Não consegui salvar: o servidor em ... não respondeu.").
- **Fechar.** Trocar de campanha, sair ou trocar de servidor fecha sozinho os repositórios abertos: as assinaturas do tempo real são canceladas, e os pedidos seguintes falham com "o mapa foi fechado porque você trocou de campanha ou saiu do servidor". `fechar()` faz o mesmo na hora.
- **Sem o SDK.** O repositório recebe um `ClienteMapa`, que o `conexao.ts` cria preso à sessão. Os testes usam um servidor falso com o mesmo comportamento do hook, e o SDK continua num arquivo só.

### Para combinar com o GrifoCaolho

1. **Ligar o mapa ao servidor.** Trocar o `new RepositorioLocal(MAPA_ID)` do `MapaHex.tsx` por `abrirRepositorioMapa()` quando houver login e campanha, com o autor sendo o id da conta (`useServidor().usuario.id`). Criar outro controlador quando a campanha mudar, e decidir o que a tela faz com `aoDesatualizar` (o mais simples é recarregar o mapa). Sem login, o mapa continua no navegador.
2. **Eco do próprio lote.** Investigado e confirmado com o PocketBase de verdade: Ana e Bruno pintam o mesmo hexágono quase juntos, o lote da Ana recebe o número maior, e o servidor fica com o terreno dela. Bruno vê o mesmo, mas a Ana fica vendo o terreno do Bruno até recarregar. O motivo: o controlador aplica a pincelada na hora, recebe depois o lote do Bruno (número menor) por cima e ignora o eco do próprio lote, que traria o valor certo de volta. Proposta para o controlador: quando chegar um lote de outra pessoa, reaplicar por cima as próprias edições que ainda não voltaram como eco. O repositório já entrega o eco na ordem do servidor, que é o que essa correção precisa.
3. **Chunk que falha.** O `carregarChunk` do servidor agora falha de verdade, mas o controlador ainda trata a falha como chunk vazio, e uma edição nele pode gravar por cima do mapa verdadeiro. Precisa tentar de novo depois, sem deixar editar até o chunk chegar.
4. **Prazo da limpeza.** Combinado: 7 dias, sem o limite de 5.000 lotes por enquanto. Uma aba aberta e sem conexão por mais de 7 dias cai em `aoDesatualizar`. Falta decidir o que a tela mostra nesse caso.
5. **Camada privada do mestre.** Fica de fora até definirmos o que é privado (nota, hexágonos escondidos, marcadores, regiões). Vai para coleções próprias, que jogadores não leem, e `exportarTudo` respeita o que cada um pode ver.
6. **Viagem e provisões.** Hoje ficam no `localStorage` de cada navegador. Decidir se passam a ser da campanha, iguais para todos.
7. **Quem edita o mapa.** Hoje qualquer participante lê e edita. Decidir se jogador só lê, só move o token, ou edita tudo.
8. **Token e relógios.** O contrato compara o `ts` do relógio de cada aparelho. O servidor limita o relógio adiantado, mas o controlador ignora um token com `ts` menor que o dele, então um celular com o relógio muito adiantado pode deixar de ver os movimentos dos outros até recarregar. E `gravarToken(null)` não leva `ts` no contrato: o repositório põe a hora na hora de gravar.
9. **Tamanho da importação.** Até 20 mil hexágonos ou 16 MB num lote. Uma importação maior recebe a mensagem pedindo para dividir.
10. **Cor da região.** Arrastar o seletor de cor grava um lote a cada movimento. Cabe no limite de pedidos, mas gravar ao soltar pouparia o servidor e o histórico.
11. **Campos novos no hexágono.** Passam pelo servidor sem validação. Avisar o Pedro quando entrar um, para o servidor validar.

## Aba Campanha

- **Entrar:** servidor, e-mail e senha. O endereço vem preenchido com o `VITE_POCKETBASE_URL` (no site de teste, `http://127.0.0.1:8090`) e pode ser trocado, por exemplo pelo endereço `.ts.net` do Funnel. Sem esquema, endereço local vira `http://` e o resto vira `https://`. O app guarda o endereço e a sessão no navegador, separados por servidor.
- **Sem entrar,** as fichas e o mapa continuam funcionando só no navegador.
- **Campanhas:** a lista mostra as campanhas da pessoa e o papel dela em cada uma. A escolhida fica aberta e é lembrada. Qualquer pessoa cria uma campanha e vira mestre dela.
- **Campanha aberta:** o mestre renomeia, chama pessoas (escolhendo entre as contas do servidor), troca papéis, tira pessoas e apaga a campanha. Todos podem sair, menos a única pessoa mestre. Sair e apagar pedem confirmação.
- **Tempo real:** quando alguém muda uma campanha ou quem participa, a tela dos outros atualiza sozinha.
- **Sua conta:** "Trocar senha" pede a senha atual, a nova e a confirmação. O PocketBase encerra todas as sessões da conta quando a senha muda, então o app entra de novo sozinho com a senha nova, e nos outros aparelhos a pessoa entra de novo.
- **Servidor caiu:** aparece um aviso, e o app reconecta sozinho quando ele volta. Se o servidor estiver desligado ao abrir o app, a sessão fica guardada e o botão "Tentar de novo sem digitar a senha" retoma sem pedir a senha.

Arquivos em `app/src/servidor/`:

| Arquivo | O que faz |
| --- | --- |
| `conexao.ts` | Único arquivo que usa o SDK. Login, sessão, leitura, ações e tempo real. Exporta `conexao` e `useServidor()`. |
| `endereco.ts` | Endereço padrão e normalização do que a pessoa digita. |
| `validacao.ts` | Converte e valida tudo o que chega do servidor. |
| `erros.ts` | Mensagens de erro em português, por ação. |
| `operacoes.ts` | Funções puras: campanhas com papel, ordem dos participantes, único mestre, contas disponíveis, mapa que continua aberto. |
| `repositorio-mapa.ts` | O `RepositorioPocketBase` do mapa (ver a seção "Mapa"). |
| `fila-lotes.ts` | Põe os lotes do servidor na ordem antes de entregar ao mapa. |
| `casos-chunk.json` | Casos de chunk conferidos pelo app e pelo servidor. |
| `TelaCampanha.tsx`, `servidor.css`, `tela.ts` | A aba Campanha. |

Respostas atrasadas não voltam a mudar a tela: cada login, saída ou troca de servidor muda a "geração" da conexão, e cada recarga tem um número. Só a resposta da geração e da recarga atuais vale.

No site de teste, que é HTTPS, o Chrome pode perguntar se o site pode acessar dispositivos da rede local quando o endereço é `http://127.0.0.1:8090`. É preciso permitir. Com o Funnel isso não acontece, porque o endereço também é HTTPS.

## No ar com o Tailscale Funnel

O PocketBase escuta só em `127.0.0.1:8090`. O Tailscale Funnel publica essa porta na internet com um endereço HTTPS fixo, como `https://nome-do-pc.tailXXXX.ts.net`, e os amigos só abrem o site. No PC que hospeda, uma vez só:

1. Criar uma conta grátis no Tailscale, com login do Google ou do GitHub, e instalar o Tailscale para Windows.
2. No ícone do Tailscale, perto do relógio: **Preferences**, depois **Run unattended**. Assim ele continua ligado depois de reiniciar o PC, mesmo antes de alguém entrar no Windows.
3. Dar ao PC um nome neutro no painel do Tailscale. O nome aparece no endereço e fica em registros públicos de certificados.
4. No Prompt de Comando: `tailscale funnel --bg 8090`. Na primeira vez, ele pede para ativar o HTTPS e o Funnel no navegador. O `--bg` deixa o Funnel ligado até alguém desligar, inclusive depois de reiniciar.
5. `tailscale funnel status` mostra o endereço público.

Depois disso, o servidor fica no ar sempre que o `iniciar.bat` estiver aberto e o PC acordado. Para tirar do ar sem desligar o PocketBase: `tailscale funnel reset`.

Proteções que valem atrás do Funnel (migração `1795321002_hospedagem.js`):

- **IP de cada pessoa.** O Tailscale avisa o IP de quem acessou no cabeçalho `X-Forwarded-For`, e o PocketBase usa o último IP da lista, que é o que o Tailscale acrescentou. Assim o limite de tentativas vale por pessoa, e não para o grupo inteiro.
- **Painel de administrador só no PC do servidor.** A configuração "Superuser IPs" aceita o administrador só de `127.0.0.1` e `::1`. Pela internet, nem a senha nem uma sessão roubada funcionam. Para desfazer, se um dia for preciso: `pocketbase.exe superuser ips`, sem nada depois, limpa a lista.
- **Convite:** na aba Campanha, entrando pelo endereço do Funnel, o botão "Copiar link para os amigos" copia o link do site com o servidor já preenchido (`?servidor=`).

## Backup

- O PocketBase faz um backup por hora enquanto está ligado e guarda os 24 mais novos em `pocketbase/pb_data/backups`.
- Para guardar uma cópia fora do PC, crie o arquivo `pocketbase/copia-backup.txt` com uma linha só: o caminho de uma pasta sincronizada com a nuvem (Google Drive, OneDrive), por exemplo `C:\Users\pedro\Google Drive\DiscordVtt`. O `iniciar.bat` lê esse arquivo, e o hook `pb_hooks/backup.pb.js` copia cada backup para lá, guardando os 48 mais novos. O arquivo fica fora do Git.
- Backup na hora: painel, **Settings**, **Backups**, **Initialize new backup**. A cópia para a pasta de fora também acontece.
- **Restaurar no Windows:** o botão de restaurar do painel só funciona em Linux e macOS. No Windows, feche o `iniciar.bat`, renomeie a pasta `pb_data` para `pb_data-antiga`, crie uma `pb_data` vazia, extraia nela o zip do backup e ligue o servidor de novo.
- **Ensaiar a restauração** sem tocar no servidor de verdade, de vez em quando, para ter certeza de que o backup serve:
  1. Crie uma pasta fora do repositório (por exemplo, `ensaio-restauracao` na Área de Trabalho) e copie para ela o `pocketbase.exe`.
  2. Copie para ela o zip mais recente da pasta de cópia (a do `copia-backup.txt`), crie uma `pb_data` dentro e extraia o zip nela.
  3. Na pasta, crie um `ensaio.bat` com `pocketbase.exe serve --http=127.0.0.1:8091 --dir=pb_data`. A porta 8091 não atrapalha o servidor de verdade, e sem `pb_hooks` na pasta a cópia não manda backups para a nuvem.
  4. Ligue o `ensaio.bat`, entre no painel em http://127.0.0.1:8091/_/ com a conta de administrador e confira as contas, as campanhas e os participantes.
  5. Feche a janela e apague a pasta, que tem uma cópia dos dados.

  Feito em 22/11/2026 com o backup automático das 18h copiado para o Google Drive: contas, campanhas e participações voltaram completas.

## Testar as regras

```
node pocketbase/testar-regras.mjs caminho/do/pocketbase
```

O script sobe um PocketBase com dados temporários, cria contas de teste e confere 119 situações: quem vê, cria, altera e apaga o quê, a troca de senha, o limite de tentativas por pessoa, o administrador barrado vindo de fora, a cópia do backup e o mapa (lotes, gravações ao mesmo tempo, lote recusado, lote repetido, chunk com negativos, tempo real, token, um lote de 5 mil hexágonos com a medição do tempo). Numa segunda rodada, ele sobe um servidor como os de antes do mapa, com campanhas, aplica a migração do mapa, confere que as campanhas antigas ganharam mapa e testa a limpeza dos lotes. No fim, apaga tudo. Ele nunca toca no `pb_data` de verdade. Sem caminho, usa o executável da pasta `pocketbase`. A verificação do GitHub roda o script em todo pull request, baixando o PocketBase da versão de `pocketbase/VERSAO` e conferindo o checksum publicado, então uma regra quebrada impede a entrada na `main`.

## Próximos passos

1. ~~Base: contas, campanhas e participantes, com migrações e regras.~~ Pronto.
2. ~~Login no app e escolha da campanha, com o endereço do servidor configurável.~~ Pronto.
3. ~~Hospedagem com Tailscale Funnel e backup.~~ Pronto e testado em 22/11/2026: login pelo celular no 4G e de um amigo, IP público de cada pessoa nos logs e backup copiado para o Google Drive. A restauração do backup do Google Drive foi ensaiada no mesmo dia (ver "Backup").
4. **Mapa no servidor.** A base está pronta (22/11/2026): coleções, regras, sincronia por lotes, limpeza e o `RepositorioPocketBase` (ver a seção "Mapa"). Falta ligar o mapa nele e a camada privada do mestre, combinados com o GrifoCaolho (ver "Para combinar com o GrifoCaolho").
5. **Fichas sincronizadas**, quando a ficha descongelar. Com a ficha inteira num registro só, duas pessoas editando campos diferentes apagariam a edição uma da outra. Precisa de um registro por valor ou por chave.
6. **Rodízio de anfitrião**, se o grupo decidir. Fica para depois dos passos 4 e 5 testados em sessões reais, para não misturar problemas de sincronia com problemas de troca de anfitrião. O detalhamento está na seção abaixo.

## Rodízio de anfitrião (futuro)

O objetivo é permitir que qualquer membro hospede o servidor num dia em que o Pedro não puder. O PocketBase não sincroniza com outra cópia, então a regra é **um servidor por vez**: o rodízio passa os dados de um PC para outro, e não liga vários servidores juntos.

Uma pasta do Google Drive compartilhada entre quem pode hospedar vira o lugar oficial dos dados, e o `iniciar.bat` faz sozinho a troca:

- **Ao ligar:**
  - Confere o arquivo de trava na pasta compartilhada e recusa se o servidor estiver ligado em outro PC, dizendo onde e desde quando.
  - Restaura o backup mais recente da pasta, se ele for mais novo que os dados locais, esperando o Drive terminar de sincronizar o último backup.
  - Grava a trava com o nome de quem hospeda.
- **Enquanto está ligado:** backup a cada 15 minutos para a pasta compartilhada e trava renovada a cada minuto.
- **Ao desligar:** um último backup sobe para a pasta, e a trava é liberada. Esse é o "devolver os dados".
- **Endereço:** o app guarda a lista dos endereços do Funnel de quem pode hospedar e usa o que estiver no ar. Os amigos continuam com o mesmo link.
- **Falha:** se um PC desligar de repente, perde-se o que foi feito desde o último backup, de até 15 minutos. A trava fica velha, e o próximo anfitrião assume depois de confirmar.
- **Preparação de cada anfitrião, uma vez só:** clonar o repositório, baixar o PocketBase, configurar o Tailscale e ter acesso à pasta compartilhada.

Cuidados que valem desde já, para o rodízio não exigir retrabalho:

- Tudo o que o servidor guarda fica dentro do `pb_data`, sem arquivos espalhados pelo PC.
- Toda mudança de coleção continua por migração, para qualquer PC chegar ao mesmo resultado.
- Nada específico de um PC vai para o banco. O que é de cada PC, como a pasta da cópia de backup, fica fora dele, em arquivos como o `copia-backup.txt`.
- O app pega o endereço do servidor de um lugar só (`endereco.ts` e `conexao.ts`), que depois pode virar a lista de anfitriões.

A alternativa ao rodízio continua sendo o servidor na nuvem: a mudança é a mesma operação, restaurar o `pb_data` lá, feita uma vez só.
