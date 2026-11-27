# Servidor

Dono: Pedro. Passos 1, 2 e 3 prontos: o PocketBase tem contas, campanhas e participantes (mestre ou jogador), com regras de acesso testadas, o app tem a aba Campanha, e o servidor está no ar pelo Tailscale Funnel no PC do Pedro, com backup quando algo muda, copiado para o Google Drive e para um HD externo. O passo 4 está pela metade: o servidor já guarda o mapa de cada campanha e o app já tem o `RepositorioPocketBase`, mas o mapa do app ainda não está ligado nele. A aba Dados já usa o servidor: ele sorteia e guarda as rolagens de cada campanha. A aba Quadro também: o servidor guarda o quadro de cortiça de cada campanha, com as imagens e as notas. As fichas ainda não usam o servidor.

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
| `mapas` | `campanha`, `nome`, `ultimaOrdem`, `permissao` | Um por campanha, por enquanto (índice único). Nasce com a campanha. `ultimaOrdem` é o número do último lote público gravado. `permissao` é a trava: `todos` ou `mestre`. |
| `hexagonos` | `mapa`, `q`, `r`, `chunk`, `dados` | Um registro por hexágono (índice único em mapa, q e r). `dados` é o hexágono inteiro, no formato do contrato. `chunk` é calculado pelo servidor. |
| `regioes` | `mapa`, `regiaoId`, `dados` | `regiaoId` é o id da região no app. `dados` é a região inteira. |
| `tokens_grupo` | `mapa`, `q`, `r`, `ts`, `autor`, `presente` | Um por mapa (índice único), criado junto com ele. `presente` falso é o token fora do mapa. |
| `lotes` | `mapa`, `ordem`, `loteId`, `autor`, `ts`, `tipo`, `alvoId`, `mudancas`, `regioes` | O histórico recente de edições públicas do mapa. `ordem` e `autor` são dados pelo servidor. `tipo` é `edicao`, `importacao` ou `reversao`, e `alvoId` é o lote que uma reversão desfaz. Apagados depois de 7 dias. |
| `mapas_mestre` | `mapa`, `ultimaOrdem` | Um por mapa, criado junto com ele: o contador da camada do mestre. Fica fora do mapa para jogadores não verem quantas edições secretas houve. |
| `hexagonos_ocultos` | `mapa`, `q`, `r`, `chunk`, `dados` | Hexágonos que só o mestre vê, com os marcadores deles. Pode haver um público e um oculto na mesma posição. |
| `notas_mestre` | `mapa`, `q`, `r`, `chunk`, `dados` | Notas privadas do mestre, uma por posição. `dados` é `{ q, r, texto, rev }`. |
| `lotes_mestre` | `mapa`, `ordem`, `loteId`, `autor`, `ts`, `tipo`, `alvoId`, `ocultos`, `notas` | A parte privada dos lotes, com numeração própria. O `loteId` é o mesmo do lote que o app mandou. Apagados depois de 7 dias. |
| `rolagens` | `campanha`, `autor`, `lados`, `resultado` | As rolagens de dados abertas da campanha. `autor` e `resultado` são dados pelo servidor. Apagadas depois de 7 dias. |
| `rolagens_secretas` | `campanha`, `autor`, `lados`, `resultado` | As rolagens secretas dos mestres, iguais às abertas. Apagadas depois de 7 dias. |
| `quadro_imagens` | `campanha`, `autor`, `arquivo`, `nome`, `bytes`, `largura`, `altura` | A biblioteca de imagens do quadro de cortiça. `arquivo` é protegido. `autor` e `bytes` são dados pelo servidor. |
| `quadro_itens` | `campanha`, `autor`, `tipo`, `imagem`, `texto`, `cor`, `x`, `y`, `largura`, `rotacao`, `z` | O que está preso no quadro: uma imagem da biblioteca ou uma nota. `autor` é dado pelo servidor. |
| `viagens` | `campanha`, `config` | Uma por campanha (índice único), criada junto com ela. `config` guarda as regras e o estoque do painel de viagem do mapa, vazio até o mestre gravar pela primeira vez. |

Todas têm `created`, e todas menos as rolagens têm `updated`. Apagar a campanha apaga o mapa e, em cascata, tudo o que é dele.

## Regras de acesso

| Coleção | Ver e listar | Criar | Alterar | Apagar |
| --- | --- | --- | --- | --- |
| `users` | quem está logado | só o administrador | a própria conta | só o administrador |
| `campanhas` | quem participa | qualquer conta, que vira mestre | mestre | mestre |
| `participantes` | quem participa da mesma campanha | mestre | mestre troca o papel, sem mudar a campanha nem a pessoa | mestre, ou a própria pessoa saindo |
| `mapas` | quem participa da campanha | ninguém (nasce com a campanha) | mestre, só o nome e a trava | ninguém (sai com a campanha) |
| `hexagonos` e `regioes` | quem participa da campanha do mapa | ninguém: só o hook dos lotes | ninguém | ninguém |
| `tokens_grupo` | quem participa da campanha do mapa | ninguém (nasce com o mapa) | quem participa, sem mudar de mapa | ninguém |
| `lotes` | quem participa da campanha do mapa | quem participa da campanha do mapa (o hook confere o resto) | ninguém | ninguém (só a limpeza) |
| `mapas_mestre`, `hexagonos_ocultos`, `notas_mestre` e `lotes_mestre` | mestre da campanha do mapa | ninguém: só os hooks | ninguém | ninguém (só a limpeza, nos lotes) |
| `rolagens` | quem participa da campanha | quem participa da campanha, sem mandar `autor` nem `resultado` | ninguém | ninguém (só a limpeza) |
| `rolagens_secretas` | mestre da campanha | mestre da campanha, sem mandar `autor` nem `resultado` | ninguém | ninguém (só a limpeza) |
| `quadro_imagens` | quem participa da campanha | quem participa, sem mandar `autor` nem `bytes` | quem enviou ou o mestre, só o nome | quem enviou ou o mestre |
| `quadro_itens` | quem participa da campanha | quem participa, sem mandar `autor` | quem participa move. Texto e cor da nota, só quem escreveu | quem prendeu ou o mestre |
| `viagens` | quem participa da campanha | ninguém (nasce com a campanha) | mestre, sem mudar a campanha (o hook confere a configuração) | ninguém (sai com a campanha) |

Visitante sem login não vê nada. O administrador, pelo painel, passa por cima de todas as regras.

"Mestre" quer dizer mestre **daquela** campanha. A regra usa o alias `@collection.participantes:mestre` para que campanha, pessoa e papel sejam conferidos na mesma participação. Sem o alias, quem é mestre em uma campanha e jogador em outra conseguiria mandar nas duas.

Quem participa da campanha lê e edita o mapa, mestre ou jogador, a não ser que o mestre trave o mapa. A camada do mestre só o mestre lê, e o tempo real também respeita isso: jogador não recebe nada dela.

Hooks, em `pocketbase/pb_hooks/campanhas.pb.js`:

- Toda campanha nasce com o seu mapa, o token do grupo dele e a viagem, inclusive a criada pelo painel. Quem cria uma campanha pelo app vira mestre dela. Tudo na mesma transação: ou entra tudo, ou nada.
- Uma campanha nunca fica sem mestre. Tirar ou rebaixar o último mestre é recusado com a mensagem "A campanha precisa de pelo menos um mestre. Torne outra pessoa mestre antes."

Configurações, em `pocketbase/pb_migrations/1795321001_configuracoes.js`: nome do app e limite de tentativas ligado (padrão do PocketBase, com login limitado a 2 tentativas a cada 3 segundos por IP).

## Mapa

O servidor guarda o mapa de cada campanha. O contrato com a área do mapa (formato dos dados, `RepositorioMapa` e o que o servidor garante) está em `docs/contratos.md`.

**Sincronia por lotes.** Cada edição do mapa (uma pincelada, um nome, uma região) é um lote, como no navegador. O app grava o lote inteiro na coleção `lotes`, e o hook `pb_hooks/mapa.pb.js` faz o resto numa transação só:

1. Confere o lote inteiro. Um item errado recusa o lote todo, com uma mensagem que diz qual hexágono, nota ou região estava errado.
2. Se um lote com o mesmo id já foi gravado (o app reenviou depois de a conexão cair), responde com o lote que já estava gravado, sem aplicar de novo.
3. Confere o que a regra de acesso não consegue (ver "Permissões", abaixo).
4. Separa o lote em duas camadas. A parte pública (`mudancas` e `regioes`) recebe o número de ordem do mapa (`ultimaOrdem` mais 1) e é aplicada em `hexagonos` e `regioes`. A parte privada (`privado`, com `ocultos` e `notas`) recebe o número da camada do mestre (`mapas_mestre`) e é aplicada em `hexagonos_ocultos` e `notas_mestre`. O PocketBase grava uma transação de cada vez, então dois lotes nunca recebem o mesmo número.
5. Grava cada parte com o "antes" real do servidor no lugar do que o app achava, e com o autor sendo a conta logada. A parte pública vira um registro de `lotes`, e a privada, um de `lotes_mestre`, com o mesmo `loteId`. Um lote só com parte privada não cria nada em `lotes`, e a resposta é o registro de `lotes_mestre`.

Se algo falhar, nada muda, nem os números de ordem. A parte privada vem no corpo do pedido, e não num campo da coleção `lotes`, então nunca chega perto do registro que jogadores leem. Revelar um hexágono é um lote só, com o hexágono na parte pública e a saída dele na parte privada: entra tudo junto ou nada. Só esse hook grava hexágonos e regiões: as regras de acesso não deixam ninguém gravar direto. O tempo real avisa cada lote novo a quem participa da campanha, e a ordem dos números é a verdade do mapa.

**O que o servidor confere.** Posição inteira e até um milhão de hexágonos do centro, terreno, região, nome (até 500 letras), nota (até 20 mil), marcadores (até 100 por hexágono), rios e estradas só nas direções 0, 1 e 2, cor de região no formato `#rrggbb` e região pai diferente da própria. Campos que o servidor não conhece passam como vieram, para o mapa poder ganhar campos novos sem esperar o servidor. Quando isso acontecer, vale avisar o Pedro para validar o campo novo.

**Permissões.** O hook recusa, com uma mensagem que explica:

- qualquer edição de quem não é mestre, com o mapa travado (`permissao` igual a `mestre`). O token do grupo continua livre.
- parte privada mandada por quem não é mestre
- importação (`tipo` igual a `importacao`) de quem não é mestre
- reversão (`tipo` igual a `reversao`) de um lote de outra pessoa, por quem não é mestre, ou sem dizer qual lote desfaz (`alvoId`). O jogador também não desfaz um lote que já saiu do histórico de 7 dias.

O tipo é declarado pelo app, então ele não impede um jogador de apagar muito numa edição comum. Contra isso valem o limite de tamanho, o de frequência e o histórico, que deixa o mestre desfazer.

**Tamanho do lote.** Uma edição comum (ou reversão) tem até 2.000 mudanças, somando hexágonos, ocultos e notas: uma pincelada tem de 1 a 20. A importação, que é só do mestre, vai num lote só para entrar inteira ou nada e para se desfazer num passo, com até 20 mil mudanças e 16 MB. Acima disso, o mapa pede para dividir. Medido em 22/11/2026: um mapa inteiro de 5 mil hexágonos, com nome, nota e marcador em cada um, dá 1,3 MB e leva 1,6 s no servidor. Importado por cima de um mapa existente, com o "antes" preenchido, dá 2,8 MB e 1,6 s. 20 mil hexágonos com "antes" dão 11,2 MB e 5,4 s. Enquanto um lote grande grava, os outros esperam a vez.

**Chunk.** O servidor calcula a chave do chunk de cada hexágono do mesmo jeito que o `chaveChunk` do mapa (16 × 16, `Math.floor`, chave `"cq,cr"`), e o app carrega os hexágonos por chunk. Os casos conferidos dos dois lados, com coordenadas negativas, ficam em `app/src/servidor/casos-chunk.json`.

**Token do grupo.** Quem participa move o token. Vale o `ts` mais recente: um pedido atrasado responde com o token atual, sem mudar nada. Um `ts` mais de 1 minuto à frente da hora do servidor (relógio errado num celular) é trazido para a hora do servidor, senão o token ficaria preso nele para os outros. O autor é a conta logada.

**Limpeza dos lotes.** Os lotes entram em todo backup e servem para quem está conectado buscar o que perdeu e para o mestre reverter edições, porque o estado do mapa fica nos hexágonos e nas regiões. A cada hora com o servidor ligado, o hook apaga os lotes com mais de 7 dias. O prazo foi combinado com o GrifoCaolho e pode mudar se precisar: é a constante `DIAS_PADRAO_LOTES` em `pb_hooks/mapa.js`. Medido em 22/11/2026: 2.000 pinceladas de 1 a 20 hexágonos aumentam o banco em 7 MB e o backup em 0,9 MB. Com sessões semanais, o histórico da sessão anterior some perto da sessão seguinte, e uma aba esquecida aberta de uma semana para outra precisa recarregar o mapa. A numeração continua de onde parou, porque o contador fica no mapa. Um app que precise de um lote já apagado avisa que o mapa tem de ser recarregado (ver o lado do app, abaixo). A variável `DISCORDVTT_DIAS_LOTES` troca o prazo e só existe para o teste das regras: num servidor normal ela fica vazia.

**Limite de pedidos.** O limite padrão do PocketBase para criar registros (20 a cada 5 segundos por pessoa) barraria quem pinta tocando rápido, porque cada pincelada é um lote. Para lotes vale o limite geral da API: 300 a cada 10 segundos por pessoa.

### Lado do app

`RepositorioPocketBase`, em `app/src/servidor/repositorio-mapa.ts`, é a implementação da `RepositorioMapa` que fala com o servidor. A área do mapa pega um pronto com `abrirRepositorioMapa()`, de `conexao.ts`, que devolve o mapa da campanha aberta, com o papel da pessoa nela, ou null sem login ou sem campanha.

- **Abrir.** No primeiro pedido, acha o mapa da campanha, assina o tempo real dos lotes e do token e só então lê o `ultimaOrdem`. Assim nenhum lote gravado no meio do caminho se perde: os que já estavam gravados estão nos hexágonos que o mapa carrega, e os seguintes chegam como lotes.
- **Lotes na ordem.** Todo lote passa por `fila-lotes.ts`, inclusive o eco do próprio lote e a resposta da gravação: o lote N só é entregue depois do N - 1, e repetidos são ignorados. Se falta um, o repositório espera meio segundo e busca no servidor. Quando o tempo real reconecta, busca o que perdeu.
- **Mapa desatualizado.** Se o lote que falta já foi apagado pela limpeza, o mapa local não tem como ficar certo. O repositório para de entregar lotes, `desatualizado` vira verdadeiro, quem assinou `aoDesatualizar` é avisado, e ler o mapa passa a falhar com "Recarregue o mapa". Gravar continua funcionando.
- **Erros de verdade.** `carregarChunk` falha quando o servidor não responde, em vez de devolver um chunk vazio. As mensagens dizem a causa e o que fazer, começando em minúscula, porque o mapa as mostra depois do que tentava ("Não consegui salvar: o servidor em ... não respondeu.").
- **Camada do mestre.** Para o mestre, o repositório assina também `lotes_mestre`, tem uma segunda fila com a numeração da camada do mestre e entrega a parte privada como um lote à parte, com o mesmo id e só o campo `privado` (`mudancas` e `regioes` vazias). Um lote com as duas partes chega ao mestre em dois pedaços, inclusive o eco do próprio lote. `carregarChunkOculto`, `carregarNotasPrivadas` e `exportarCamadaMestre` leem a camada, e `ehMestre` diz se ela existe para quem usa. Para jogadores, os três devolvem vazio, sem perguntar ao servidor.
- **Trava.** `carregarPermissao`, `gravarPermissao` (só o mestre consegue) e `assinarPermissao`, que avisa quando o mestre trava ou destrava.
- **Contadores.** O repositório também ouve o mapa e o contador da camada do mestre. Se o número passar do último lote entregue, ele busca o que falta, mesmo que nenhum lote seguinte chegue para mostrar o buraco.
- **Fechar.** Trocar de campanha, sair, trocar de servidor ou mudar de papel na campanha fecha sozinho os repositórios abertos: as assinaturas do tempo real são canceladas, e os pedidos seguintes falham com "o mapa foi fechado porque você trocou de campanha ou saiu do servidor". `fechar()` faz o mesmo na hora.
- **Sem o SDK.** O repositório recebe um `ClienteMapa`, que o `conexao.ts` cria preso à sessão. Os testes usam um servidor falso com o mesmo comportamento do hook, e o SDK continua num arquivo só.

### Combinado com o GrifoCaolho

Fechado em 22/11/2026. O lado do mapa fica com o Grifo, e o do servidor, com o Pedro.

1. **Ligar o mapa ao servidor** (Grifo). O mapa escolhe o repositório pela campanha com `abrirRepositorioMapa()`, o autor passa a ser o id da conta, e o controlador é trocado quando a campanha muda. Sem login, o mapa continua no navegador.
2. **Eco do próprio lote** (Grifo). Investigado e confirmado com o PocketBase de verdade: quando duas pessoas pintam o mesmo hexágono quase juntas, quem gravou por último fica vendo o terreno do outro até recarregar. O controlador aplica a pincelada na hora, recebe depois o lote da outra pessoa (número menor) por cima e ignora o eco do próprio lote, que traria o valor certo de volta. A correção combinada: quando chegar um lote de outra pessoa, reaplicar por cima as próprias edições que ainda não voltaram como eco. O repositório já entrega o eco na ordem do servidor, que é o que essa correção precisa.
3. **Chunk que falha** (Grifo). Tentar de novo e não deixar editar até ele chegar, em vez de tratar como vazio.
4. **Mapa desatualizado** (Grifo). Reconectar não recarrega nada: o repositório busca os lotes que faltam sozinho. Só o `aoDesatualizar` pede recarga: sem edição pendente, o mapa recarrega sozinho com um aviso pequeno ("Mapa atualizado"). Com edição que não foi enviada, mostra um aviso com o botão Recarregar.
5. **Camada do mestre** (Pedro, pronta). Privado é só nota e hexágono oculto, com os marcadores dele. Regiões são sempre públicas. Lote misto, num lote só, com `privado`, `tipo` e `alvoId` (ver "Permissões").
6. **Quem edita** (pronto). Jogadores e mestres constroem. O mestre desfaz lotes de qualquer pessoa, importa e pode travar o mapa (`permissao`).
7. **Token** (Grifo). O controlador aplica o token na ordem em que o repositório entrega, sem comparar com o relógio local.
8. **Importação** (combinado). Num lote só, até 20 mil mudanças, só do mestre. Acima disso, o mapa pede para dividir.
9. **Levar o mapa do navegador para a campanha** (Grifo). Só o mestre, uma vez, com a campanha de mapa vazio, como um lote de importação. Antes, o app baixa uma cópia em JSON, e o mapa do navegador nunca é apagado.
10. **Cor da região** (Grifo). Gravar ao soltar o seletor, em vez de a cada movimento.
11. **Campos novos no hexágono** (Grifo avisa o Pedro). Passam pelo servidor sem validação até o Pedro validar.
12. **Viagem e provisões** (pronto em 24/11/2026). As regras de viagem e o estoque do grupo são da campanha, editados só pelo mestre, num registro por campanha com um campo JSON (ver a seção "Viagem"). Cada jogador pode simular só para si. A rota continua local.
13. **Presença** (fora por enquanto). O PocketBase não tem mensagem efêmera.
14. **Teste ao vivo com o grupo** (os dois), quando o mapa estiver ligado ao servidor.

## Dados

A aba Dados é da área `dados` (ver `docs/dados.md`). O servidor sorteia e guarda as rolagens, em `pocketbase/pb_migrations/1795321005_dados.js` e `pocketbase/pb_hooks/dados.pb.js`.

- **O servidor sorteia.** O app manda só a campanha e o dado (`lados`: 2, 4, 6, 8, 10, 12 ou 20). O hook confere o dado, grava quem rolou e sorteia o resultado com o gerador criptográfico do servidor (`$security.randomStringWithAlphabet`), que dá a mesma chance a cada face. A regra de criar recusa um pedido que traga `autor` ou `resultado`: ninguém escolhe o próprio resultado, nem mandando o pedido à mão.
- **Rolagem secreta do mestre** fica em `rolagens_secretas`, uma coleção que só os mestres da campanha leem, e não numa marcação dentro de `rolagens`: dado secreto do mestre fica em coleção própria. O tempo real respeita as regras, então jogador não recebe nem fica sabendo que houve uma rolagem secreta.
- **Rolagem feita não muda nem some** pelo app, nem pelo mestre. O administrador do painel não rola: ele não participa de campanhas.
- **Limite de pedidos:** vale o padrão do PocketBase para criar registros, 20 a cada 5 segundos por pessoa (o IP de cada um, atrás do Funnel). Para quem clica nos botões, sobra. O teste das regras confere que ele barra.
- **Limpeza:** a cada hora, o hook apaga as rolagens com mais de 7 dias, abertas e secretas, direto no banco, sem aviso pelo tempo real. O prazo muda pela variável `DISCORDVTT_DIAS_ROLAGENS`, que o teste usa para zerá-lo.
- **Apagar a campanha** apaga as rolagens dela.

### Lado do app

O `RepositorioDadosPocketBase` (`app/src/servidor/repositorio-dados.ts`) implementa a `RepositorioDados`, o contrato da área de dados (ver `docs/contratos.md`). `abrirRepositorioDados()`, em `conexao.ts`, devolve o da campanha aberta, ou null sem login ou sem campanha.

- **Rolar** cria o registro e devolve a rolagem que o servidor sorteou. Ela também é avisada a quem ouve na hora, sem esperar o tempo real, e chega de novo pelo eco com o mesmo id.
- **Ouvir:** assina `rolagens` da campanha e, para o mestre, `rolagens_secretas`. Quando o tempo real reconecta, busca as 30 mais recentes e avisa de novo, da mais velha para a mais nova: quem ouve ignora as repetidas pelo id.
- **Fechar:** trocar de campanha, sair, trocar de servidor ou mudar de papel fecha o repositório, como o do mapa. Depois disso, rolar falha com uma mensagem que explica.
- **Erros** dizem a causa e o que fazer, começando em minúscula, porque a aba mostra "Não consegui rolar: ...". Uma recusa sem motivo do servidor quase sempre é falta de permissão: na rolagem secreta, a mensagem pede para conferir se a pessoa ainda é mestre.

## Quadro

O quadro de cortiça de cada campanha, da área `quadro` (ver `docs/quadro.md`). O servidor guarda a biblioteca de imagens e os itens presos no quadro, em `pocketbase/pb_migrations/1795321006_quadro.js` e `pocketbase/pb_hooks/quadro.pb.js`.

- **Imagens protegidas.** O campo `arquivo` é protegido: o link direto não abre. Para baixar, é preciso um token de arquivo (`/api/files/token`), que vale 3 minutos, e o servidor confere a regra de ver a imagem com a conta do token. Quem está fora da campanha não abre nem com o link e um token próprio.
- **Só imagem de verdade.** O servidor aceita PNG, JPEG e WebP de até 2 MB e confere o tipo pelo conteúdo do arquivo, não pelo nome. SVG fica de fora, porque pode carregar código. Para cada imagem, ele faz uma miniatura de 320 px de largura na primeira vez que alguém pede.
- **Limite de 50 MB por campanha.** Cada backup copia todas as imagens (ver "Backup"): na nuvem, com uma cópia por dia por 7 dias, 50 MB viram até 350 MB. O hook soma o que a campanha já usa numa transação, então dois envios ao mesmo tempo não passam juntos. O limite muda pela variável `DISCORDVTT_QUADRO_LIMITE_MB`, que o teste usa para baixá-lo. O app reduz as imagens antes de enviar, então o limite comporta umas 170 imagens.
- **O servidor preenche quem fez e o tamanho.** A regra de criar recusa um pedido com `autor` ou `bytes`. Na biblioteca, só o nome muda depois: o hook recusa trocar o arquivo, as dimensões, o tamanho, a campanha ou o autor.
- **Itens:** o hook confere que uma imagem presa é da mesma campanha e que uma nota não tem imagem. Imagem presa não guarda texto nem cor, e nota sem cor fica amarela. A regra deixa qualquer pessoa da campanha mover, mudar o tamanho ou a camada de qualquer item, mas não trocar o tipo, a imagem, a campanha ou o autor. Texto e cor da nota, só quem escreveu, nem o mestre.
- **Apagar:** apagar uma imagem tira do quadro os itens que a usam. Apagar a campanha apaga a biblioteca, o quadro e os arquivos. Se uma conta for apagada, o que ela enviou e prendeu fica com a campanha, sem autor, e o mestre cuida.
- **Limite de pedidos:** vale o padrão do PocketBase para criar, 20 a cada 5 segundos por pessoa. Mover não cria nada.

### Lado do app

O `RepositorioQuadroPocketBase` (`app/src/servidor/repositorio-quadro.ts`) implementa a `RepositorioQuadro`, o contrato da área do quadro (ver `docs/contratos.md`). `abrirRepositorioQuadro()`, em `conexao.ts`, devolve o da campanha aberta, ou null sem login ou sem campanha.

- **Pedidos simples:** criar, mudar ou apagar um registro. A resposta já é avisada a quem ouve, e o eco do tempo real chega de novo com o mesmo id.
- **Tempo real:** assina `quadro_imagens` e `quadro_itens` da campanha. Quando a conexão volta, busca o quadro inteiro e avisa com um evento `tudo`.
- **Imagens:** `urlDaImagem` baixa a imagem uma vez, com o token de arquivo (renovado a cada 2 minutos), e devolve um endereço `blob:` que vale até o repositório fechar. Pedidos ao mesmo tempo esperam o mesmo download. Imagem apagada e repositório fechado liberam os endereços.
- **Fechar:** trocar de campanha, sair, trocar de servidor ou mudar de papel fecha o repositório, como o do mapa e o das rolagens.
- **Erros** dizem a causa e o que fazer, começando em minúscula. As recusas sem motivo do servidor viram uma explicação de quem pode fazer aquilo.

## Viagem

As regras do mundo e o estoque do grupo que o painel de viagem do mapa usa (ver `docs/mapa/manual.md`, "Viagem da campanha"). O mestre edita, e todos da campanha leem. Ficam em `pocketbase/pb_migrations/1795321007_viagem.js` e `pocketbase/pb_hooks/viagem.pb.js`.

- **Coleção própria, um registro por campanha.** Nasce junto com a campanha, e as campanhas que já existiam ganharam a delas na migração. O registro `mapas` ficou de fora de propósito: ele é regravado a cada lote (o contador `ultimaOrdem`), e uma gravação da viagem nele poderia escrever um contador velho por cima. O tempo real também ficaria mandando a viagem a cada pincelada.
- **Quem faz o quê.** Quem participa lê. Só o mestre grava, e vale a última gravação. Ninguém cria nem apaga pelo app, e a viagem não muda de campanha. Apagar a campanha apaga a viagem.
- **O que o servidor confere.** `config` vazio (o mestre nunca gravou, ou zerou) ou um objeto com até 32 campos, cada um com um nome de letras e números, começando por letra e com até 40 caracteres, e um valor numérico de 0 a 100 mil, com até 4 KB no total. O hook não conhece os campos um por um: o mapa pode ganhar um campo numérico novo sem mudar o servidor. Fora disso, recusa com o motivo ("o servidor recusou: estoqueAgua precisa ser um número de 0 a 100000.").
- **Limite de pedidos.** Vale o limite geral da API, 300 a cada 10 segundos por pessoa. O mestre grava 700 ms depois da última tecla, então sobra.

### Lado do app

O `RepositorioPocketBase` tem os três métodos do contrato `RepositorioComViagem` (ver `docs/contratos.md`), e o mapa passa a usar a viagem da campanha sozinho.

- **Abrir.** No primeiro pedido, à parte do mapa: assina o tempo real da viagem da campanha e só então lê o registro. Uma falha ao abrir o mapa não fecha a viagem, e vice-versa.
- **`carregarViagem()`** devolve só os números da configuração, ou null enquanto o mestre nunca gravou. O mapa confere os limites de cada campo e completa o que faltar com o padrão.
- **`gravarViagem(config)`** grava para o mestre. Para quem não é mestre, falha sem ir ao servidor, com "só o mestre da campanha muda as regras e o estoque da viagem.".
- **`assinarViagem(ouvinte)`** avisa quando a viagem muda, e de novo quando a conexão volta (lê a viagem outra vez). Um aviso mais velho que a última gravação conhecida, pela hora `updated` do servidor, é ignorado, e o eco de uma gravação já conhecida não é avisado de novo.
- **Servidor sem a migração.** Se a coleção não existe, a leitura falha com "o servidor ainda não guarda a viagem da campanha. Quem cuida do servidor precisa atualizá-lo e reiniciá-lo.", e o mapa segue com a viagem local.

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
| `repositorio-mapa.ts` | O `RepositorioPocketBase` do mapa e da viagem da campanha (ver as seções "Mapa" e "Viagem"). |
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

Feito por `pb_hooks/backup.pb.js` e `pb_hooks/backup.js`. O agendamento do próprio PocketBase fica desligado (migração `1795321008_backup.js`), porque ele fazia uma cópia igual a cada hora, mesmo sem ninguém mexendo em nada.

- **Quando sai.** A cada hora com o servidor ligado, mas só se algo mudou desde o último backup automático. O hook compara uma marca dos dados (quantos registros cada coleção tem e quando o mais novo mudou) com a do último backup, guardada em `pb_data/discordvtt-ultimo-backup.txt`. Os registros de acesso (logs) não contam.
- **No PC** (`pocketbase/pb_data/backups`): os 72 backups automáticos mais novos. Os manuais, feitos pelo painel, nunca saem sozinhos.
- **Na nuvem** (pasta do `copia-backup.txt`): todo backup é copiado para lá, e fica a cópia mais nova de cada dia, nos 7 dias mais recentes com backup. É a cópia fora de casa.
- **No HD externo** (pasta do `copia-hd.txt`): o histórico. Ficam todos os backups dos 7 dias mais recentes com backup e, antes disso, o mais novo de cada dia, por 6 meses. O servidor liga sem o HD. A cada 5 minutos, se a pasta existir, ele copia o que ainda não está lá, então a cópia sai sozinha quando o HD é conectado. Ele nunca cria a pasta: se o Windows der a mesma letra a um pendrive, o pendrive não recebe backups. Cada arquivo é copiado com um nome provisório (`.zip.parcial`) e só ganha o nome certo no fim, então um cabo solto no meio não deixa um backup quebrado.
- **Dias com backup.** Os dias contam do mais recente para trás e só os que têm backup, no fuso do PC. Uma pausa longa no jogo não apaga o histórico recente.
- **As pastas de fora** são só para backups: o hook apaga delas os `.zip` que saem do histórico e não toca no resto.
- **Configurar.** Cada pasta vem de um arquivo de uma linha só na pasta `pocketbase`, fora do Git, que o `iniciar.bat` lê:
  - `copia-backup.txt`: uma pasta sincronizada com a nuvem (Google Drive, OneDrive), por exemplo `G:\Meu Drive\DiscordVtt`.
  - `copia-hd.txt`: uma pasta no HD externo, criada antes à mão, por exemplo `E:\DiscordVtt-backups`.
- **Tamanho.** Medido em 26/11/2026: cada backup tinha menos de 1 MB, dos quais 28 KB eram o banco. No pior caso, uma campanha com o quadro cheio (50 MB) e 20 cenas de batalha de 15 MB tem uns 350 MB por backup: uns 25 GB no PC, 2,5 GB na nuvem e, com o servidor ligado sem parar, uns 120 GB no HD.
- Backup na hora: painel, **Settings**, **Backups**, **Initialize new backup**. Ele também vai para a nuvem e, na rodada seguinte, para o HD.
- As variáveis `DISCORDVTT_COPIA_BACKUP` e `DISCORDVTT_COPIA_HD` vêm dos dois arquivos. `DISCORDVTT_BACKUPS_NO_PC` troca o número de backups no PC e só existe para o teste das regras.
- **Restaurar no Windows:** o botão de restaurar do painel só funciona em Linux e macOS. No Windows, feche o `iniciar.bat`, renomeie a pasta `pb_data` para `pb_data-antiga`, crie uma `pb_data` vazia, extraia nela o zip do backup e ligue o servidor de novo. O backup pode vir do PC, do HD ou da nuvem: os três são o mesmo zip.
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

O script sobe um PocketBase com dados temporários, cria contas de teste e confere 249 situações: quem vê, cria, altera e apaga o quê, a troca de senha, o limite de tentativas por pessoa, o administrador barrado vindo de fora, o backup (só quando algo mudou, os automáticos mais novos no PC, a cópia de cada dia na nuvem e o histórico no HD, com o HD desconectado, cópia interrompida e nada copiado duas vezes), o mapa (lotes, gravações ao mesmo tempo, lote recusado, lote repetido, chunk com negativos, tempo real, token, uma importação de 5 mil hexágonos com a medição do tempo) e a camada do mestre (quem vê, tempo real, revelar, lote misto recusado inteiro, importação, reversão e trava) e os dados (o servidor sorteia, ninguém escolhe o resultado nem rola em nome de outra pessoa, dado fora dos clássicos recusado, rolagem secreta só para os mestres, inclusive no tempo real, e o limite de pedidos) e o quadro (quem envia, vê, renomeia e apaga imagens, arquivo protegido com e sem token, miniatura, arquivo que não é imagem, SVG, imagem grande demais, limite de espaço da campanha, quem prende, move, edita e tira itens, e o tempo real). Numa segunda rodada, ele sobe um servidor como os de antes do mapa, com campanhas, aplica as migrações do mapa, confere que as campanhas antigas ganharam mapa, camada do mestre e trava aberta, e testa a limpeza dos lotes, inclusive os do mestre, e a das rolagens, inclusive as secretas. No fim, apaga tudo. Ele nunca toca no `pb_data` de verdade. Sem caminho, usa o executável da pasta `pocketbase`. A verificação do GitHub roda o script em todo pull request, baixando o PocketBase da versão de `pocketbase/VERSAO` e conferindo o checksum publicado, então uma regra quebrada impede a entrada na `main`.

## Servidor de teste

Para testar o app contra um PocketBase de verdade sem tocar no servidor do grupo:

```
node pocketbase/servidor-de-teste.mjs caminho/do/pocketbase
```

O script sobe um PocketBase com dados temporários, com as migrações e os hooks do repositório, na porta 8092 (outra com `--porta=8093`). Ele cria três contas e a campanha "Mesa de teste", já com o mapa: um mestre e dois jogadores. O quadro da campanha vem montado com as imagens de exemplo do app, enviadas pelo mestre, e uma nota da jogadora. Como os hooks do quadro só aceitam contas do app, o administrador age como cada conta (`impersonate`), sem login e sem gastar o limite de tentativas. As contas e senhas ficam em `app/src/servidor/contas-de-teste.json` e só valem para esse servidor. O script mostra o endereço, as contas e a senha do painel, e fica ligado até alguém apertar Ctrl+C, que desliga o servidor e apaga os dados.

- **À mão:** com o app rodando (`npm run dev`, em `app/`), entre na aba Campanha com uma das contas e o endereço `http://127.0.0.1:8092`. Duas janelas, com contas diferentes, fazem dois jogadores.
- **Nos testes:** os testes do app que precisam de um servidor de verdade terminam em `.servidor.test.ts` e rodam quando a variável `DISCORDVTT_SERVIDOR_TESTE` tem o endereço do servidor de teste. Sem ela, como no `npm test` comum, são pulados. Em `app/`: `DISCORDVTT_SERVIDOR_TESTE=http://127.0.0.1:8092 npx vitest run .servidor.test.ts`.
- **Ajudantes** em `app/src/servidor/teste-servidor.ts`: `entrarComoTeste('mestre')` entra com uma das contas e devolve a conexão, `campanhaDeTeste(mestre, [jogadores])` cria uma campanha só para o teste e abre nela para todos, e `instalarEventSource()` dá ao Node o EventSource que o SDK usa no tempo real. Depois disso, `conexao.abrirRepositorioMapa()` devolve o `RepositorioPocketBase` daquela pessoa, e `conexao.abrirRepositorioDados()`, o `RepositorioDadosPocketBase`. Os arquivos de teste rodam ao mesmo tempo, então dois logins podem cair juntos no limite de tentativas: `entrarComoTeste` espera e tenta de novo.
- **Na verificação do GitHub:** depois do teste das regras, ela sobe o servidor de teste e roda todos os `.servidor.test.ts`. Hoje são os testes do `RepositorioPocketBase` em `repositorio-mapa.servidor.test.ts` (dois jogadores sincronizando, chunk com coordenadas negativas, lote reenviado, lote recusado, camada do mestre com revelar, trava do mapa, troca de campanha e saída do servidor) os do `RepositorioDadosPocketBase` em `repositorio-dados.servidor.test.ts` (rolagem vista na hora pela jogadora, rolagem secreta só para os mestres e saída do servidor) e os do `RepositorioQuadroPocketBase` em `repositorio-quadro.servidor.test.ts` (imagem enviada, aberta pelo token e presa no quadro, item movido por outra pessoa, nota que só a autora edita e saída do servidor).

## Próximos passos

1. ~~Base: contas, campanhas e participantes, com migrações e regras.~~ Pronto.
2. ~~Login no app e escolha da campanha, com o endereço do servidor configurável.~~ Pronto.
3. ~~Hospedagem com Tailscale Funnel e backup.~~ Pronto e testado em 22/11/2026: login pelo celular no 4G e de um amigo, IP público de cada pessoa nos logs e backup copiado para o Google Drive. A restauração do backup do Google Drive foi ensaiada no mesmo dia (ver "Backup").
4. **Mapa no servidor.** Do lado do servidor, pronto em 22/11/2026: coleções, regras, sincronia por lotes, limpeza, camada do mestre, trava e o `RepositorioPocketBase` (ver a seção "Mapa"). Falta o Grifo ligar o mapa nele e o teste ao vivo com o grupo (ver "Combinado com o GrifoCaolho").
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
