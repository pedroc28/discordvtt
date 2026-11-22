# Área do servidor (lado do app)

Dono: Pedro (pedroc28). Esta pasta guarda tudo o que o app usa para falar com o PocketBase: cliente, login e as implementações de repositório (ex.: `RepositorioPocketBase` para o mapa). O plano da área está em [`docs/servidor/README.md`](../../../docs/servidor/README.md).

## Regras da área

- Nenhum outro arquivo do app fala com o PocketBase: as outras áreas usam as interfaces descritas em `docs/contratos.md`.
- O endereço padrão do PocketBase vem de `import.meta.env.VITE_POCKETBASE_URL` (modelo em `app/.env.example`). A pessoa pode trocar na tela de login, e `endereco.ts` normaliza o que ela digitar.
- `conexao.ts` é o único arquivo que usa o SDK do PocketBase. A tela e as outras áreas leem o estado com `useServidor()`. O `RepositorioPocketBase` recebe um `ClienteMapa` criado pelo `conexao.ts`, preso à sessão, e não importa o SDK.
- O mapa recebe os lotes na ordem do servidor, inclusive o eco do próprio lote, sem repetir e sem pular (`fila-lotes.ts`). Se o lote que falta foi apagado pela limpeza, o repositório avisa em vez de seguir com o mapa errado.
- Trocar de campanha, sair ou trocar de servidor fecha os mapas abertos e as assinaturas deles.
- Toda resposta do servidor passa por `validacao.ts`, e toda mensagem de erro por `erros.ts`, que diz o que aconteceu e como resolver.
- Resposta atrasada não pode trazer de volta dados de quem já saiu ou trocou de servidor: `conexao.ts` confere a geração antes de mudar o estado.
- Lógica de conversão e validação de dados do servidor fica fora de componentes e ganha teste no Vitest.
- Gravação de lote é atômica: ou entra tudo, ou nada.
- Teste que precisa de um PocketBase de verdade termina em `.servidor.test.ts` e usa `teste-servidor.ts`. Ele roda contra o `pocketbase/servidor-de-teste.mjs` na verificação do GitHub e é pulado sem `DISCORDVTT_SERVIDOR_TESTE`.
