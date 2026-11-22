# Área do servidor (lado do app)

Dono: Pedro (pedroc28). Esta pasta guarda tudo o que o app usa para falar com o PocketBase: cliente, login e as implementações de repositório (ex.: `RepositorioPocketBase` para o mapa). O plano da área está em [`docs/servidor/README.md`](../../../docs/servidor/README.md).

## Regras da área

- Nenhum outro arquivo do app fala com o PocketBase: as outras áreas usam as interfaces descritas em `docs/contratos.md`.
- O endereço do PocketBase vem de `import.meta.env.VITE_POCKETBASE_URL` (modelo em `app/.env.example`).
- Lógica de conversão e validação de dados do servidor fica fora de componentes e ganha teste no Vitest.
- Gravação de lote é atômica: ou entra tudo, ou nada.
