#!/usr/bin/env bash
# Começa uma tarefa: cria uma branch nova a partir da main mais recente.
#
# Uso: scripts/comecar.sh <area> <nome-da-tarefa>
#   area: mapa, servidor, ficha ou geral
#   nome: curto, minúsculo, com hífens. Ex.: notas-por-hexagono
set -euo pipefail

area="${1:-}"
tarefa="${2:-}"

case "$area" in
  mapa | servidor | ficha | geral) ;;
  *) echo "Área inválida: use mapa, servidor, ficha ou geral." >&2; exit 1 ;;
esac
if ! [[ "$tarefa" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Nome da tarefa inválido: use minúsculas, números e hífens. Ex.: notas-por-hexagono" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Há alterações sem commit. Faça commit ou descarte antes de começar outra tarefa." >&2
  exit 1
fi

git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main
branch="$area/$tarefa"
git checkout -q -B "$branch" origin/main
echo "Branch $branch criada a partir da main ($(git rev-parse --short HEAD))."
