# Servidor

Dono: Pedro. Ainda não começou. Este é o plano.

## Peças

- **PocketBase**: um único executável com banco de dados, login, regras de acesso e tempo real. Fica em `pocketbase/`, com migrações e hooks no Git e o executável e os dados fora dele.
- **Lado do app**: `app/src/servidor/`, com o cliente do PocketBase, o login e as implementações de repositório que as outras áreas usam (ver `docs/contratos.md`).
- **Hospedagem**: o PocketBase rodando no PC do Pedro ou numa máquina gratuita, exposto com HTTPS por Cloudflare Tunnel ou Tailscale. Sem voz, tudo passa por HTTPS normal, então funciona mesmo atrás de CGNAT.

## Ordem sugerida

1. Rodar o PocketBase localmente e criar as coleções de usuários, campanhas e participantes (mestre ou jogador), com migrações.
2. Login no app e escolha da campanha.
3. `RepositorioPocketBase` para o mapa, seguindo o contrato do mapa.
4. Sincronização das fichas.
5. Hospedagem para o grupo.
