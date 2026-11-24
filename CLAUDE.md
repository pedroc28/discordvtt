# Regras do projeto DiscordVtt

Este arquivo vale para o Claude do Pedro e para o Claude do GrifoCaolho. As pessoas só conversam com o Claude: criar branch, testar, abrir e juntar pull request é trabalho do Claude, seguindo os passos abaixo. Antes de mexer numa área, leia também o `CLAUDE.md` dela.

Se uma regra atrapalhar, mude-a aqui, numa tarefa `geral`, e registre o motivo em `docs/decisoes.md`.

## O projeto

Mesa virtual própria para um grupo de RPG: fichas editáveis para qualquer sistema, mapa e mesa compartilhados e ferramentas para o mestre. Roda no navegador do computador e do celular, sem pagar nenhum serviço. É um hobby: o objetivo é gastar o tempo dos dois com RPG, não com administração.

Fora do escopo: chat de voz, chat de texto e transmissão de tela. A conversa acontece no Discord. Não proponha LiveKit, WebRTC, Docker nem serviços pagos sem os dois combinarem antes.

Site de teste, atualizado sozinho a cada mudança na `main`: https://pedroc28.github.io/discordvtt/

## Áreas e donos

| Área | O que é dela | Dono |
| --- | --- | --- |
| `mapa` | `app/src/mapa/`, `app/public/tilesets/`, `app/tools/gerar-tileset.mjs`, `docs/mapa/` | GrifoCaolho |
| `servidor` | `pocketbase/`, `app/src/servidor/`, `docs/servidor/`, hospedagem | Pedro (pedroc28) |
| `dados` | `app/src/dados/`, `docs/dados.md` | Pedro (pedroc28) |
| `quadro` | `app/src/quadro/`, `docs/quadro.md` | Pedro (pedroc28) |
| `ficha` | `app/src/ficha/`, `docs/fichas.md` | os dois, **congelada** |
| `geral` | `app/src/nucleo/`, configurações do app, `.github/`, `scripts/`, `CLAUDE.md`, `README.md`, o resto de `docs/` | os dois |

- Cada pessoa trabalha na própria área. A responsabilidade pela divisão é delas, não há bloqueio automático.
- A ficha só recebe mudanças quando os dois voltarem a ela juntos. Exceção: correção de algo que impeça o app de funcionar.
- Se você não souber com quem está falando, pergunte antes de começar.

## Como toda tarefa funciona

1. **Começar.** Clone o repositório se ainda não tiver e rode `scripts/comecar.sh <area> <nome-da-tarefa>`. Ele cria a branch `area/nome` a partir da `main` mais recente. Uma tarefa, uma branch.
2. **Trabalhar.** Faça a mudança seguindo as regras deste arquivo e do `CLAUDE.md` da área. Commits em português, no imperativo, com título curto ("Adiciona régua de distância").
3. **Documentar.** No mesmo trabalho, atualize:
   - `docs/roteiro.md`, marcando o que ficou pronto
   - a documentação da área (`docs/mapa/`, `docs/servidor/`, `docs/dados.md`, `docs/quadro.md` ou `docs/fichas.md`)
   - `docs/decisoes.md`, se houve uma decisão que muda o rumo do projeto
   - `docs/contratos.md`, se mudou algo que outra área usa
4. **Entregar.** Escreva a descrição do pull request seguindo `.github/pull_request_template.md` num arquivo temporário e rode `scripts/entregar.sh "Título" /tmp/descricao.md`. O script:
   - traz a `main` mais recente
   - roda lint, build e testes
   - envia a branch e abre o pull request
   - espera a verificação do GitHub e junta na `main` com squash. A verificação roda lint, build e testes do app, o teste das regras do servidor (`pocketbase/testar-regras.mjs`) e os testes do app que precisam de um servidor de verdade (`*.servidor.test.ts`, contra o `pocketbase/servidor-de-teste.mjs`).

   Não existe revisão humana: se a verificação passa, entra.
5. **Responder.** Diga à pessoa o que mudou, o link do pull request e o link do site de teste.

Se o script parar, conserte o que ele apontar e rode de novo. Conflito com a `main`: rode `git merge origin/main`, resolva preservando o trabalho dos dois lados, faça o commit e entregue de novo.

## Quando a tarefa mexe na área do outro

Isso não é proibido, mas nunca acontece em silêncio. Antes de alterar qualquer arquivo de outra área (ou da ficha congelada):

1. Pare e analise os riscos e as implicações: o que pode quebrar, que comportamento muda para o outro, se algum contrato de `docs/contratos.md` é afetado, se o trabalho em andamento do outro pode conflitar.
2. Explique isso à pessoa em poucas linhas e pergunte se deve seguir.
3. Se ela confirmar, faça a mudança mínima necessária e preencha a seção "Mexe na área do outro" da descrição do pull request com a análise. O outro fica sabendo pelo histórico de pull requests.

Mudanças em `geral` afetam os dois: faça a mesma análise e registre na descrição.

## Arquitetura

- **Telas.** Cada área registra suas telas num arquivo `tela.ts` na própria pasta, exportando `tela` (ver `app/src/nucleo/telas.ts`). O núcleo encontra sozinho: criar uma tela nova não exige mexer em arquivo compartilhado.
- **Tema.** Variáveis de cor, temas claro e escuro e botões comuns (`.botao-icone`, `.botao-topo`, `.grupo-botoes`, `.espaco`) ficam em `app/src/nucleo/tema.css`. O tema atual vem de `useAparencia()` em `app/src/nucleo/aparencia.ts`. Use as variáveis (`--ui-papel`, `--ui-tinta`, `--ui-linha`, `--acento`, `--feltro` e as demais) para tudo funcionar nos dois temas.
- **Dados.** JSON simples e serializável, com tipos explícitos no `tipos.ts` da área.
- **Mudanças.** Sempre por funções puras (`operacoes.ts`) que devolvem o estado novo ou a lista de mudanças, sem alterar o que receberam.
- **Interface.** Componentes React só leem o estado e chamam operações. Não fazem `fetch`, não falam com o PocketBase e não mexem no `localStorage` direto.
- **Armazenamento.** Fica atrás de uma interface, como a `RepositorioMapa`. A versão do servidor entra como mais uma implementação, sem mudar o resto.
- **Lógica sem React.** Fica fora dos componentes e ganha teste no Vitest (`*.test.ts` ao lado do código).
- **Dados de fora.** Arquivo importado, servidor e `localStorage` são validados antes de usar.

Os contratos entre áreas estão em `docs/contratos.md`.

## Código

- App em `app/`: Vite, React 19, TypeScript, Vitest e oxlint. Comandos em `app/`: `npm run dev`, `npm run lint`, `npm run build`, `npm test`.
- Nomes em português, sem acento nos identificadores (`moverToken`, `chaveDoChunk`). Termos técnicos consagrados podem ficar em inglês.
- Comentários em português, explicando o porquê.
- TypeScript estrito: sem `any` e sem `@ts-ignore`. Use `unknown` e valide.
- Estilo: sem ponto e vírgula no fim das linhas, aspas simples, dois espaços. Siga o código existente.
- Sem bibliotecas de interface (MUI, Tailwind, Bootstrap). Dependência nova só perguntando antes à pessoa, com o motivo na descrição do pull request.
- O CSS é global: prefixe as classes com o nome da área (`.mapa__...`, `.servidor__...`).

## Interface e textos

- Todo texto visível em português do Brasil, com acentos corretos.
- Nos textos da interface e na documentação, não use ponto e vírgula nem travessão. Prefira frases curtas, vírgulas e dois-pontos.
- Botões dizem o que fazem ("Exportar modelo", não "OK"). Mensagens de erro dizem o que aconteceu e como resolver.
- Nada de cara de app gerado por IA: sem gradientes roxos, cards genéricos com sombra, emojis como ícone ou textos de marketing. A identidade é mesa de feltro verde, papel e acento framboesa.
- Ícones são SVG desenhados à mão, no traço dos que já existem.
- Tudo funciona no celular: toque, telas a partir de 360 px, alvos de pelo menos 32 px, Pointer Events.
- Botões só com ícone têm `aria-label`. Foco do teclado sempre visível. Respeite `prefers-reduced-motion`.

## Segredos

- O repositório é público. Nunca coloque senha, token ou chave nele, nem em commit antigo.
- Configuração local fica em `app/.env`, ignorado pelo Git. O modelo é `app/.env.example`.
- Variáveis `VITE_` são visíveis no navegador: nunca ponha segredo nelas.
- Dado secreto do mestre fica em coleção protegida pelas regras de acesso do PocketBase. Esconder só na tela não conta.

## Nunca

- Commit ou push direto na `main`, ou push forçado em qualquer branch.
- Mexer em branch que não é da tarefa atual.
- Alterar configurações do repositório no GitHub (só o Pedro, pelo site).
- Juntar um pull request com a verificação falhando.

Branches juntadas são apagadas sozinhas pelo GitHub. O Claude não consegue apagar branches nem mudar configurações daqui: se algo assim for necessário, peça ao Pedro.
