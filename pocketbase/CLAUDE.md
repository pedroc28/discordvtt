# Área do servidor (PocketBase)

Dono: Pedro (pedroc28). Aqui ficam as migrações (`pb_migrations/`) e os hooks (`pb_hooks/`) do PocketBase. O executável e os dados (`pb_data/`) nunca entram no Git. O plano está em [`docs/servidor/README.md`](../docs/servidor/README.md).

## Regras da área

- Toda coleção nova ou alterada vira uma migração versionada, nunca uma mudança feita só pelo painel.
- Regras de acesso de cada coleção ficam na migração e são revisadas com cuidado: o repositório é público e o servidor fica na internet.
- Dado secreto do mestre fica em coleção própria, que jogadores não conseguem ler.
- Senha de administrador, tokens e chaves nunca entram no Git.
