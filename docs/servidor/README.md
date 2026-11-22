# Servidor

Dono: Pedro. Passo 1 pronto: o PocketBase tem contas, campanhas e participantes (mestre ou jogador), com regras de acesso testadas. O app ainda não fala com o servidor: isso é o passo 2.

## Peças

- **PocketBase**: um único executável com banco de dados, login, regras de acesso e tempo real. Fica em `pocketbase/`, com migrações e hooks no Git e o executável e os dados fora dele. A versão é fixa e fica em `pocketbase/VERSAO` (hoje, 0.40.6).
- **Lado do app**: `app/src/servidor/`, com o cliente do PocketBase, o login e as implementações de repositório que as outras áreas usam (ver `docs/contratos.md`). Ainda vazio.
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

## Testar as regras

```
node pocketbase/testar-regras.mjs caminho/do/pocketbase
```

O script sobe um PocketBase com dados temporários, cria contas de teste e confere 45 situações: quem vê, cria, altera e apaga o quê. No fim, apaga tudo. Ele nunca toca no `pb_data` de verdade. Sem caminho, usa o executável da pasta `pocketbase`. O Claude roda o script antes de entregar qualquer mudança de regra ou hook.

## Próximos passos

1. ~~Base: contas, campanhas e participantes, com migrações e regras.~~ Pronto.
2. **Login no app e escolha da campanha.** O endereço do servidor passa a ser escolhido na tela de login e guardado no navegador, com o `VITE_POCKETBASE_URL` como valor padrão. Assim o mesmo site de teste funciona com qualquer servidor. Entra o SDK do PocketBase como dependência, combinado antes.
3. **Hospedagem com Tailscale Funnel e backup**, testados com um amigo. Conferir nesse passo:
   - Atrás do Funnel, todos podem chegar ao PocketBase com o mesmo IP, e o limite de tentativas contaria o grupo inteiro como uma pessoa. Configurar o proxy confiável (`trustedProxy`) ou ajustar o limite.
   - Backup agendado do `pb_data`, com cópia fora do PC. O painel do PocketBase só restaura backups em Linux e macOS, então no Windows a restauração é trocar a pasta `pb_data` com o servidor desligado.
   - Endereço do app (`appURL`) nas configurações.
4. **`RepositorioPocketBase` para o mapa**, combinado com o GrifoCaolho. Proposta:
   - O tempo real do PocketBase avisa registro por registro, e o contrato do mapa pede lotes inteiros na ordem do servidor. Uma coleção `lotes`, com um registro por lote e número de ordem dado pelo servidor, resolve as duas coisas. Um hook atualiza os hexágonos na mesma gravação.
   - Hexágonos guardam `rios` e `estradas`. O token do grupo fica numa coleção própria, com um registro por mapa.
   - A camada privada do mestre fica em coleções próprias, com regras de mestre (ver `docs/contratos.md`).
   - A API de batch do PocketBase vem desligada e tem limite de pedidos por lote. Se for usada, a migração liga e ajusta.
5. **Fichas sincronizadas**, quando a ficha descongelar. Com a ficha inteira num registro só, duas pessoas editando campos diferentes apagariam a edição uma da outra. Precisa de um registro por valor ou por chave.
