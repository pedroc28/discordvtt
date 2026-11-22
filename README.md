# DiscordVtt

Mesa virtual própria para o nosso grupo de RPG: fichas editáveis para qualquer sistema, mesa com mapa e tokens e ferramentas para o mestre. A conversa, por voz e texto, continua no Discord. Roda no navegador do computador e do celular, sem pagar nenhum serviço.

## Estrutura

```
app/         app web (Vite, React e TypeScript)
  src/ficha/ editor de fichas, já funcionando
pocketbase/  (próxima etapa) backend: login, campanhas, fichas e tempo real
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
- [ ] Fórmulas e rolagens: campos calculados e botões como `roll@forca`
- [ ] Base no PocketBase: login, campanhas, mestre e jogadores
- [ ] Fichas sincronizadas: todos editando e vendo a mesma ficha em tempo real
- [ ] Painel do mestre: os campos importantes de todos os jogadores numa tela só
- [ ] Mesa: mapa com grade, tokens ligados às fichas, névoa de guerra e régua de distância
- [ ] Extras: ordem de iniciativa, relógios de ameaça do mestre, imagens e anotações da campanha
- [ ] Hospedagem: deixar no ar para o grupo, de graça, com Cloudflare Tunnel ou Tailscale

Voz e transmissão de tela ficam fora: a conversa acontece no Discord.
