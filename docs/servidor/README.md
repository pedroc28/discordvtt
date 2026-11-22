# Servidor

Dono: Pedro. Passos 1, 2 e 3 prontos: o PocketBase tem contas, campanhas e participantes (mestre ou jogador), com regras de acesso testadas, o app tem a aba Campanha, e o servidor está no ar pelo Tailscale Funnel no PC do Pedro, com backup a cada hora copiado para o Google Drive. O mapa e as fichas ainda não usam o servidor.

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
- **Login por e-mail e senha.** O servidor não envia e-mails, então senha esquecida se troca no painel. Se um dia configurarem um e-mail no painel, o "esqueci a senha" passa a funcionar sozinho.

## Coleções

| Coleção | Campos | Observações |
| --- | --- | --- |
| `users` | `name` (obrigatório, até 60 letras), `email`, `avatar` | A coleção de contas que já vem no PocketBase. Os outros veem o nome, nunca o e-mail. |
| `campanhas` | `nome` (obrigatório, até 80 letras) | |
| `participantes` | `campanha`, `usuario`, `papel` (`mestre` ou `jogador`) | Uma pessoa entra uma vez só em cada campanha. Apagar a campanha ou a conta apaga as participações. |

Todas têm `created` e `updated`.

## Regras de acesso

| Coleção | Ver e listar | Criar | Alterar | Apagar |
| --- | --- | --- | --- | --- |
| `users` | quem está logado | só o administrador | a própria conta | só o administrador |
| `campanhas` | quem participa | qualquer conta, que vira mestre | mestre | mestre |
| `participantes` | quem participa da mesma campanha | mestre | mestre troca o papel, sem mudar a campanha nem a pessoa | mestre, ou a própria pessoa saindo |

Visitante sem login não vê nada. O administrador, pelo painel, passa por cima de todas as regras.

"Mestre" quer dizer mestre **daquela** campanha. A regra usa o alias `@collection.participantes:mestre` para que campanha, pessoa e papel sejam conferidos na mesma participação. Sem o alias, quem é mestre em uma campanha e jogador em outra conseguiria mandar nas duas.

Hooks, em `pocketbase/pb_hooks/campanhas.pb.js`:

- Quem cria uma campanha pelo app vira mestre dela na mesma transação: ou entram a campanha e o mestre, ou nenhum dos dois.
- Uma campanha nunca fica sem mestre. Tirar ou rebaixar o último mestre é recusado com a mensagem "A campanha precisa de pelo menos um mestre. Torne outra pessoa mestre antes."

Configurações, em `pocketbase/pb_migrations/1795321001_configuracoes.js`: nome do app e limite de tentativas ligado (padrão do PocketBase, com login limitado a 2 tentativas a cada 3 segundos por IP).

## Aba Campanha

- **Entrar:** servidor, e-mail e senha. O endereço vem preenchido com o `VITE_POCKETBASE_URL` (no site de teste, `http://127.0.0.1:8090`) e pode ser trocado, por exemplo pelo endereço `.ts.net` do Funnel. Sem esquema, endereço local vira `http://` e o resto vira `https://`. O app guarda o endereço e a sessão no navegador, separados por servidor.
- **Sem entrar,** as fichas e o mapa continuam funcionando só no navegador.
- **Campanhas:** a lista mostra as campanhas da pessoa e o papel dela em cada uma. A escolhida fica aberta e é lembrada. Qualquer pessoa cria uma campanha e vira mestre dela.
- **Campanha aberta:** o mestre renomeia, chama pessoas (escolhendo entre as contas do servidor), troca papéis, tira pessoas e apaga a campanha. Todos podem sair, menos a única pessoa mestre. Sair e apagar pedem confirmação.
- **Tempo real:** quando alguém muda uma campanha ou quem participa, a tela dos outros atualiza sozinha.
- **Servidor caiu:** aparece um aviso, e o app reconecta sozinho quando ele volta. Se o servidor estiver desligado ao abrir o app, a sessão fica guardada e o botão "Tentar de novo sem digitar a senha" retoma sem pedir a senha.

Arquivos em `app/src/servidor/`:

| Arquivo | O que faz |
| --- | --- |
| `conexao.ts` | Único arquivo que usa o SDK. Login, sessão, leitura, ações e tempo real. Exporta `conexao` e `useServidor()`. |
| `endereco.ts` | Endereço padrão e normalização do que a pessoa digita. |
| `validacao.ts` | Converte e valida tudo o que chega do servidor. |
| `erros.ts` | Mensagens de erro em português, por ação. |
| `operacoes.ts` | Funções puras: campanhas com papel, ordem dos participantes, único mestre, contas disponíveis. |
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

## Testar as regras

```
node pocketbase/testar-regras.mjs caminho/do/pocketbase
```

O script sobe um PocketBase com dados temporários, cria contas de teste e confere 53 situações: quem vê, cria, altera e apaga o quê, o limite de tentativas por pessoa, o administrador barrado vindo de fora e a cópia do backup. No fim, apaga tudo. Ele nunca toca no `pb_data` de verdade. Sem caminho, usa o executável da pasta `pocketbase`. A verificação do GitHub roda o script em todo pull request, baixando o PocketBase da versão de `pocketbase/VERSAO` e conferindo o checksum publicado, então uma regra quebrada impede a entrada na `main`.

## Próximos passos

1. ~~Base: contas, campanhas e participantes, com migrações e regras.~~ Pronto.
2. ~~Login no app e escolha da campanha, com o endereço do servidor configurável.~~ Pronto.
3. ~~Hospedagem com Tailscale Funnel e backup.~~ Pronto e testado em 22/11/2026: login pelo celular no 4G e de um amigo, IP público de cada pessoa nos logs e backup copiado para o Google Drive.
4. **`RepositorioPocketBase` para o mapa**, combinado com o GrifoCaolho. Proposta:
   - O tempo real do PocketBase avisa registro por registro, e o contrato do mapa pede lotes inteiros na ordem do servidor. Uma coleção `lotes`, com um registro por lote e número de ordem dado pelo servidor, resolve as duas coisas. Um hook atualiza os hexágonos na mesma gravação.
   - Hexágonos guardam `rios` e `estradas`. O token do grupo fica numa coleção própria, com um registro por mapa.
   - A camada privada do mestre fica em coleções próprias, com regras de mestre (ver `docs/contratos.md`).
   - A API de batch do PocketBase vem desligada e tem limite de pedidos por lote. Se for usada, a migração liga e ajusta.
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
