# Como trabalhar no projeto

Vocês só conversam com o Claude. Ele cuida de branch, testes, pull request e entrega.

## Pedir uma tarefa

1. Abra uma conversa nova no claude.ai.
2. Diga em qual repositório trabalhar e o que quer, por exemplo: "No repositório pedroc28/discordvtt, área do mapa, adicione a régua de distância."
3. O Claude lê as regras, faz a tarefa e entrega sozinho. No fim, ele responde com o link do pull request e do site de teste.
4. Teste em https://pedroc28.github.io/discordvtt/ alguns minutos depois. Funciona no computador e no celular.

Se a tarefa precisar mexer na área do outro, o Claude explica os riscos e pergunta antes de seguir.

## Se algo der errado

Conte ao Claude o que aconteceu ("a verificação falhou", "o mapa não abre no celular") e peça para consertar. Ele segue o mesmo caminho de sempre.

## Rodar no próprio computador (opcional)

Só para quem quiser testar sem esperar o site. Precisa do Node.js e do GitHub Desktop.

1. No GitHub Desktop, clone `pedroc28/discordvtt`. Se já tiver, clique em Fetch origin e Pull origin.
2. Repository, Open in Command Prompt.
3. `cd app`, depois `npm install` (só quando mudarem as dependências) e `npm run dev`.
4. Abra http://localhost:5173.

Não faça commits pelo GitHub Desktop: as mudanças entram pelo Claude.

## Só o Pedro

Configurações do repositório no GitHub (Settings) ficam com o Pedro, que é o dono. O Claude não consegue mudá-las.
