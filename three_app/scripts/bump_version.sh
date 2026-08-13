#!/usr/bin/env bash
set -euo pipefail

# bump_version.sh
# - reads index.html in the current directory
# - finds the version badge like: <div id="version">vX.Y.Z</div>
# - increments the patch number (Z -> Z+1)
# - writes the file back, commits, and pushes to gh-pages
# Usage: GITHUB_TOKEN=... ./bump_version.sh

FILE="index.html"
if [ ! -f "$FILE" ]; then
  echo "index.html not found in $(pwd)" >&2
  exit 1
fi

orig=$(cat "$FILE")
if ! echo "$orig" | grep -qE 'id="version">v[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "version badge not found in $FILE" >&2
  exit 1
fi

cur=$(echo "$orig" | sed -n 's/.*id="version">v\([0-9]\+\)\.\([0-9]\+\)\.\([0-9]\+\)<.*$/\1.\2.\3/p')
if [ -z "$cur" ]; then
  echo "failed to parse current version" >&2
  exit 1
fi

major=$(echo "$cur" | cut -d. -f1)
minor=$(echo "$cur" | cut -d. -f2)
patch=$(echo "$cur" | cut -d. -f3)
newpatch=$((patch + 1))
newver="${major}.${minor}.${newpatch}"

echo "Bumping version: v${cur} -> v${newver}"

# replace in file
sed -E "s/(id=\"version\">v)[0-9]+\.[0-9]+\.[0-9]+/\1${newver}/" "$FILE" > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

# git commit & push
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repo. Please run this script in the repository clone." >&2
  exit 1
fi

# configure user if missing
git config user.name >/dev/null 2>&1 || git config user.name "automation-bot"
git config user.email >/dev/null 2>&1 || git config user.email "bot@local"

git add "$FILE"
git commit -m "chore: bump version to v${newver} [auto]" || true

# push using remote origin; prefer GITHUB_TOKEN if provided
if [ -n "${GITHUB_TOKEN:-}" ]; then
  # get origin and convert to an https URL if needed
  ORIG_URL=$(git config --get remote.origin.url || true)
  if [ -z "$ORIG_URL" ]; then
    git push origin gh-pages --force
  else
    if echo "$ORIG_URL" | grep -q "^https://"; then
      STRIP=${ORIG_URL#https://}
      AUTH_URL="https://x-access-token:${GITHUB_TOKEN}@${STRIP}"
    elif echo "$ORIG_URL" | grep -q "^git@github.com:"; then
      # convert ssh style to https
      STRIP=${ORIG_URL#git@github.com:}
      AUTH_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${STRIP}"
    else
      AUTH_URL="$ORIG_URL"
    fi
    git push "$AUTH_URL" gh-pages --force
  fi
else
  git push origin gh-pages --force
fi

echo "Bumped to v${newver} and pushed to gh-pages"
