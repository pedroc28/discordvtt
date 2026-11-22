#!/usr/bin/env bash
# Entrega a tarefa: verifica, envia, abre o pull request, espera a verificação
# do GitHub e junta na main com squash. Se algo falhar, o script para e diz o quê.
#
# Uso: scripts/entregar.sh "Título do pull request" [arquivo-com-a-descricao.md]
#   O título segue as regras de commit: português, imperativo, curto.
#   A descrição segue o modelo de .github/pull_request_template.md.
set -euo pipefail

REPO="pedroc28/discordvtt"
DONO="${REPO%%/*}"
SITE="https://pedroc28.github.io/discordvtt/"

titulo="${1:-}"
corpo="${2:-}"
raiz="$(git rev-parse --show-toplevel)"
branch="$(git rev-parse --abbrev-ref HEAD)"

if [ "$branch" = "main" ] || [ "$branch" = "HEAD" ]; then
  echo "Você não está numa branch de tarefa. Comece com scripts/comecar.sh." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Há alterações sem commit. Faça o commit antes de entregar." >&2
  exit 1
fi
[ -n "$titulo" ] || titulo="$(git log -1 --format=%s)"
if [ -n "$corpo" ] && [ ! -f "$corpo" ]; then
  echo "Arquivo de descrição não encontrado: $corpo" >&2
  exit 1
fi

verificar() {
  (
    cd "$raiz/app"
    [ -d node_modules ] || npm ci --silent
    npm run --silent lint
    npm run --silent build > /dev/null
    npm test --silent
  )
}

echo "1/4 Trazendo a main mais recente..."
git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main
if ! git merge-base --is-ancestor origin/main HEAD; then
  if ! git merge --no-edit origin/main > /dev/null 2>&1; then
    git merge --abort
    echo "Conflito com a main. Rode 'git merge origin/main', resolva os conflitos, faça o commit e entregue de novo." >&2
    exit 1
  fi
fi

echo "2/4 Verificando (lint, build e testes)..."
verificar

echo "3/4 Enviando e abrindo o pull request..."
git -c push.negotiate=true push --quiet -u origin "$branch" 2>&1 | grep -v -i -e negotiat -e acknowledg || true
numero="$(gh api "repos/$REPO/pulls?head=$DONO:$branch&state=open" --jq '.[0].number // empty')"
if [ -z "$numero" ]; then
  if [ -n "$corpo" ]; then
    numero="$(gh api "repos/$REPO/pulls" -X POST -f title="$titulo" -f head="$branch" -f base=main -F body=@"$corpo" --jq .number)"
  else
    lista="$(git log origin/main..HEAD --format='- %s')"
    numero="$(gh api "repos/$REPO/pulls" -X POST -f title="$titulo" -f head="$branch" -f base=main -f body="$lista" --jq .number)"
  fi
fi
echo "    https://github.com/$REPO/pull/$numero"

echo "4/4 Esperando a verificação do GitHub..."
sha="$(git rev-parse HEAD)"
estado=""
for _ in $(seq 1 90); do
  estado="$(gh api "repos/$REPO/commits/$sha/check-runs" \
    --jq '[.check_runs[] | select(.name == "verificar")][0] | "\(.status):\(.conclusion)"' 2> /dev/null || true)"
  case "$estado" in
    completed:success) break ;;
    completed:*)
      echo "A verificação falhou. Veja em https://github.com/$REPO/pull/$numero/checks, conserte e entregue de novo." >&2
      exit 1
      ;;
  esac
  sleep 10
done
if [ "$estado" != "completed:success" ]; then
  echo "A verificação ainda não terminou. Rode o script de novo daqui a pouco." >&2
  exit 1
fi

gh api "repos/$REPO/pulls/$numero/merge" -X PUT -f merge_method=squash -f commit_title="$titulo (#$numero)" --jq .message > /dev/null
git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main
echo "Pronto: o pull request #$numero entrou na main."
echo "O site de teste atualiza em alguns minutos: $SITE"
