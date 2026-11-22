# DiscordVtt

Mesa virtual própria para o nosso grupo de RPG: chat de voz, chat de texto, fichas editáveis e mesa com mapa, tudo no mesmo app, rodando no computador e no celular, sem pagar nenhum serviço.

## Estrutura

```
app/         app web (Vite, React e TypeScript)
  src/ficha/ editor de fichas, já funcionando
pocketbase/  (próxima etapa) backend: login, chat, fichas e tempo real
infra/       (próxima etapa) Docker Compose com PocketBase e LiveKit
```

## Rodar o app

Precisa do [Node.js](https://nodejs.org) LTS instalado.

```bash
cd app
npm install      # só na primeira vez
npm run dev      # abre em http://localhost:5173
```

Para testar no celular na mesma rede Wi-Fi, use `npm run dev -- --host` e abra o endereço "Network" que aparece no terminal.

## Como trabalhar a dois

1. Antes de começar, baixe as novidades (no GitHub Desktop: **Fetch origin** e depois **Pull origin**).
2. Crie uma branch para cada tarefa, com um nome que diga o que ela faz, como `modo-escuro` ou `campo-calculado`.
3. Faça as alterações, dê commit com uma mensagem clara e envie a branch (**Push origin**).
4. Abra um pull request no GitHub. O outro dá uma olhada e faz o merge na `main`.

Para evitar conflitos, combinem quem mexe em quais arquivos.

## Roteiro

- [x] Editor de fichas: layout livre, tipos de campo, páginas, modo escuro, barra de vida, relógio do Apocalypse World
- [ ] Base: PocketBase e LiveKit com Docker Compose
- [ ] Fichas sincronizadas entre todos (Yjs + PocketBase)
- [ ] Fórmulas, campos calculados e rolagens no chat
- [ ] Painel do mestre
- [ ] Chat de voz e de texto
- [ ] Mesa com mapa e tokens
