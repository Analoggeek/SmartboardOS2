#!/usr/bin/env bash
# SmartBoardOS — one-shot publisher (v1.3.0)
# Usage:
#   ./scripts/publish.sh <github-username> [repo-name] [token]
# or non-interactive:
#   GH_TOKEN=ghp_xxx ./scripts/publish.sh <github-username>
set -euo pipefail

USER_NAME="${1:-}"
REPO="${2:-smartboardOS}"
TOKEN="${3:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"

if [[ -z "$USER_NAME" ]]; then
  echo "Usage: ./scripts/publish.sh <github-username> [repo-name] [token]"
  echo "Tip:  export GH_TOKEN=ghp_xxx   then run it with just your username."
  exit 1
fi

cd "$(dirname "$0")/.."

echo "→ repo:        ${USER_NAME}/${REPO}"
echo "→ branch:      $(git branch --show-current 2>/dev/null || echo main)"

if [[ -n "$(git status --porcelain)" ]]; then
  git add .
  git commit -m "chore: sync before publish" || true
fi

if [[ -n "$TOKEN" ]]; then
  REMOTE="https://${USER_NAME}:${TOKEN}@github.com/${USER_NAME}/${REPO}.git"
else
  REMOTE="https://github.com/${USER_NAME}/${REPO}.git"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi

# create the repo first if the GitHub CLI is available
if command -v gh >/dev/null 2>&1 && ! gh repo view "${USER_NAME}/${REPO}" >/dev/null 2>&1; then
  echo "→ creating repo with gh…"
  gh repo create "${USER_NAME}/${REPO}" --public --source=. --remote=origin --push || true
fi

echo "→ pushing main…"
git push -u origin main

echo
echo "✅ Pushed:   https://github.com/${USER_NAME}/${REPO}"
echo "   Pages:    https://github.com/${USER_NAME}/${REPO}/settings/pages"
echo "             → Source: GitHub Actions  (workflow .github/workflows/deploy.yml)"
echo "   Live URL: https://${USER_NAME}.github.io/${REPO}/"
echo
echo "   Token needs scopes: repo + workflow (because this repo ships a Pages workflow)."
