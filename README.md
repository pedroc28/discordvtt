# DiscordVtt

Mesa virtual própria para o nosso grupo de RPG: fichas editáveis para qualquer sistema, mapa e mesa compartilhados e ferramentas para o mestre. A conversa, por voz e texto, continua no Discord. Roda no navegador do computador e do celular, sem pagar nenhum serviço.

**Site de teste:** https://pedroc28.github.io/discordvtt/ (atualiza sozinho a cada mudança)

## Como trabalhamos

Cada um conversa com o próprio Claude, que cuida de Git, testes e entrega. O passo a passo está em [docs/como-trabalhar.md](docs/como-trabalhar.md), e as regras que os Claudes seguem estão no [CLAUDE.md](CLAUDE.md).

| Área | Dono |
| --- | --- |
| Mapa e mesa | GrifoCaolho |
| Servidor, conexão e hospedagem | Pedro |
| Dados | Pedro |
| Fichas | os dois (congelada por enquanto) |

## Estrutura

```
app/                  app web (Vite, React e TypeScript)
  src/nucleo/         moldura do app, abas das telas e tema (geral)
  src/ficha/          editor de fichas (congelada)
  src/mapa/           mapa hexagonal (GrifoCaolho)
  src/servidor/       conexão com o PocketBase (Pedro)
  src/dados/          rolagem de dados (Pedro)
pocketbase/           migrações e hooks do PocketBase (Pedro)
docs/                 toda a documentação
scripts/              comecar.sh e entregar.sh, usados pelo Claude
.github/              verificação automática e publicação do site
```

## Documentação

- [Roteiro](docs/roteiro.md): o que está pronto e o que vem depois
- [Decisões](docs/decisoes.md): o que foi decidido e por quê
- [Contratos](docs/contratos.md): o que uma área oferece para as outras
- [Fichas](docs/fichas.md), [mapa](docs/mapa/manual.md), [dados](docs/dados.md) e [servidor](docs/servidor/README.md)
