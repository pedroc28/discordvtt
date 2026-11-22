# Regras do projeto DiscordVtt

Este arquivo vale para as pessoas e para o Claude de cada um. Leia antes de mexer no código. Se uma regra atrapalhar, mude a regra aqui, num pull request próprio, em vez de ignorá-la.

## O que é o projeto

Mesa virtual própria para o grupo de RPG: fichas editáveis para qualquer sistema, mapa e mesa compartilhados e ferramentas para o mestre. Roda no navegador do computador e do celular, sem pagar nenhum serviço.

Fora do escopo: chat de voz, chat de texto e transmissão de tela. A conversa acontece no Discord. Não proponha LiveKit, WebRTC nem Docker sem os dois combinarem antes.

## Quem cuida de quê

| Área | Pasta | Responsável |
| --- | --- | --- |
| Mapa e mesa | `app/src/mapa/` (e futuras pastas da mesa) | GrifoCaolho |
| Servidor e conexão | `pocketbase/`, `app/src/servidor/`, hospedagem | pedroc28 |
| Fichas | `app/src/ficha/` | os dois, **congelada por enquanto** |
| Arquivos compartilhados | ver abaixo | os dois |

- Trabalhe só dentro da sua área. Para mexer na área do outro, combine antes e marque a pessoa no pull request.
- A ficha não recebe mudanças até os dois voltarem a ela juntos. Correção de erro que impeça o app de funcionar é a exceção, sempre num pull request pequeno.
- **Arquivos compartilhados**: `app/src/App.tsx`, `app/src/main.tsx`, `app/package.json`, `app/package-lock.json`, `app/vite.config.ts`, os `tsconfig*.json`, `app/index.html`, `README.md`, `CLAUDE.md` e a pasta `.github/`. Mudanças neles vão em pull requests pequenos e separados, com o motivo na descrição.

## Stack

- App: Vite, React 19 e TypeScript, em `app/`.
- Testes: Vitest (`*.test.ts` ao lado do código).
- Lint: oxlint.
- Servidor (próxima etapa): PocketBase, um único executável. Sincronização em tempo real pelas assinaturas do PocketBase.
- Sem bibliotecas de interface (nada de MUI, Tailwind, Bootstrap). Componentes e CSS são feitos à mão.
- Dependência nova só com motivo claro na descrição do pull request. Prefira escrever 50 linhas a instalar um pacote.

## Comandos

Sempre dentro de `app/`:

```bash
npm install         # depois de clonar ou quando o package.json mudar
npm run dev         # app em http://localhost:5173
npm run lint        # tem que passar sem avisos
npm run build       # tem que passar (inclui a checagem de tipos)
npm test            # tem que passar
```

Antes de abrir um pull request, rode `lint`, `build` e `test`. O GitHub roda os três de novo em todo pull request.

## Fluxo no Git

- Nunca faça commit nem push direto na `main`. Toda mudança entra por pull request.
- Uma branch por tarefa, com o prefixo da área: `mapa/...`, `servidor/...`, `ficha/...` ou `geral/...`. Exemplo: `mapa/notas-por-hexagono`.
- Antes de começar, atualize a `main` (Fetch e Pull no GitHub Desktop). Se a sua branch ficar para trás, traga a `main` para ela (no GitHub Desktop: Branch, Update from default branch) e resolva os conflitos antes do merge.
- Pull requests pequenos, de uma coisa só. Descrição em português dizendo o que muda, por quê e como testar.
- Quem abre o pull request não faz o merge sozinho: o outro revisa e aprova.
- Mensagens de commit em português, no imperativo, curtas no título: "Adiciona régua de distância", "Corrige zoom no celular". No corpo, explique o porquê quando não for óbvio.

## Padrão de arquitetura

As fichas e o mapa seguem o mesmo padrão. Mantenha-o em código novo:

1. **Dados são JSON simples e serializáveis.** Tipos explícitos num `tipos.ts` da área. Nada de classes guardadas no estado.
2. **Toda mudança passa por funções puras** (`operacoes.ts`): recebem o estado e devolvem o novo, ou devolvem a lista de mudanças. Nunca alteram o objeto recebido.
3. **A interface só lê o estado e chama operações.** Componentes React não fazem `fetch`, não falam com o PocketBase e não mexem no `localStorage` direto.
4. **O armazenamento fica atrás de uma interface.** No mapa é a `RepositorioMapa` (ver `app/src/mapa/README.md`): hoje há implementações em memória e no navegador, e a do PocketBase entra como mais uma, sem mudar o resto. As fichas vão seguir o mesmo caminho quando forem sincronizadas.
5. **Lógica que não depende de React fica fora de componentes** e ganha teste no Vitest.
6. Dados que vêm de fora (arquivo importado, servidor, `localStorage`) são validados antes de usar, como em `armazenamento.ts`.

### Contrato entre o mapa e o servidor

- O servidor implementa `RepositorioMapa` (`carregarChunk`, `aplicar`, `assinar`) numa classe `RepositorioPocketBase`, dentro de `app/src/servidor/`.
- Mudanças na interface `RepositorioMapa` ou nos tipos `Lote`, `Mudanca` e `Hexagono` afetam os dois lados: discuta no pull request e marque o outro.
- Dado secreto do mestre fica em coleção separada, protegida pelas regras de acesso do PocketBase. Esconder só na tela não conta como segredo.

## Código

- Nomes em português, sem acento nos identificadores: `moverToken`, `chaveDoChunk`, `EditorDeFichas`. Termos técnicos consagrados podem ficar em inglês (`chunk`, `token`, `canvas`).
- Comentários em português, explicando o porquê, não o óbvio.
- TypeScript estrito: sem `any`, sem `@ts-ignore`. Use `unknown` e valide.
- Estilo do código: sem ponto e vírgula no fim das linhas, aspas simples, dois espaços de indentação, como no código que já existe.
- Arquivos pequenos e com uma responsabilidade. Se um componente passar de umas 300 linhas, divida.

## Interface e textos

- Todo texto visível em português do Brasil, com acentos corretos.
- Nos textos da interface e na documentação, não use ponto e vírgula nem travessão (—). Prefira frases curtas, vírgulas e dois-pontos.
- Botões dizem o que fazem: "Exportar modelo", não "OK". Mensagens de erro dizem o que aconteceu e como resolver.
- O visual não pode ter cara de app gerado por IA: nada de gradientes roxos, cards genéricos com sombra em tudo, emojis como ícone ou textos de marketing. A identidade atual é uma mesa de feltro verde com papel em cima e acento framboesa.
- Use as variáveis de tema de `app/src/ficha/ficha.css` (`--ui-papel`, `--ui-tinta`, `--ui-linha`, `--acento`, `--feltro` e as demais). Assim tudo funciona nos temas claro e escuro sem código extra.
- O CSS é global: prefixe as classes com o nome da área (`.mapa__...`, `.servidor__...`) para não colidir com as da ficha.
- Ícones são SVG desenhados à mão, no mesmo traço dos que já existem (`Icones.tsx`).

## Celular e acessibilidade

- Tudo precisa funcionar no navegador do celular: toque, telas a partir de 360 px de largura e alvos de toque de pelo menos 32 px.
- Use Pointer Events para mouse, toque e caneta juntos.
- Botões só com ícone precisam de `aria-label`. Foco do teclado sempre visível. O que dá para fazer com mouse, dá para fazer com teclado sempre que fizer sentido.
- Respeite `prefers-reduced-motion`.

## Segredos e configuração

- Nunca coloque senha, token ou chave no repositório. Isso inclui a senha de administrador do PocketBase e tokens de túnel ou de hospedagem.
- Configuração local fica em `app/.env`, que o Git ignora. O modelo, sem segredos, é `app/.env.example`.
- Variáveis que o navegador lê precisam começar com `VITE_` e são públicas: nunca ponha segredo nelas.

## Para o Claude

- Leia este arquivo e o `README.md` da área antes de mudar algo.
- Antes de editar fora da área de quem está pedindo, avise e peça confirmação.
- Não faça push na `main`. Trabalhe numa branch com o prefixo da área e entregue um pull request.
- Rode `npm run lint`, `npm run build` e `npm test` em `app/` antes de dizer que terminou, e conserte o que falhar.
- Não adicione dependências sem perguntar.
- Ao terminar uma etapa, atualize o roteiro no `README.md` e o `README.md` da área.
- Escreva nas mesmas regras de texto deste arquivo: português do Brasil com acentos, sem ponto e vírgula e sem travessão.
