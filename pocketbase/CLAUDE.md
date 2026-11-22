# Área do servidor (PocketBase)

Dono: Pedro (pedroc28). Aqui ficam as migrações (`pb_migrations/`) e os hooks (`pb_hooks/`) do PocketBase. O executável e os dados (`pb_data/`) nunca entram no Git. O plano está em [`docs/servidor/README.md`](../docs/servidor/README.md).

## Regras da área

- Toda coleção nova ou alterada vira uma migração versionada, nunca uma mudança feita só pelo painel.
- Regras de acesso de cada coleção ficam na migração e são revisadas com cuidado: o repositório é público e o servidor fica na internet.
- Dado secreto do mestre fica em coleção própria, que jogadores não conseguem ler.
- Senha de administrador, tokens e chaves nunca entram no Git.
- A versão do PocketBase é fixa e fica em `VERSAO`. Mudar de versão é uma tarefa própria, porque o PocketBase ainda muda a API entre versões.
- Toda mudança de regra ou hook ganha verificação em `testar-regras.mjs`, e o script passa antes da entrega: `node pocketbase/testar-regras.mjs caminho/do/pocketbase`. O executável da versão certa está nas versões do PocketBase no GitHub.
- O servidor precisa continuar portátil, para um dia trocar de PC ou entrar o rodízio de anfitrião (ver `docs/servidor/README.md`): tudo o que ele guarda fica no `pb_data`, e nada específico de um PC vai para o banco. Configuração de um PC só fica em arquivo fora do Git, como o `copia-backup.txt`.
- Handlers de hook rodam isolados e não enxergam nada declarado fora deles. Funções auxiliares ficam em arquivos sem `.pb` (como `pb_hooks/campanhas.js`) e entram com `require` dentro do handler.
