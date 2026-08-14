#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
# Avoid bumping if last commit was made by actions bot or already auto-bumped
LAST_AUTHOR=$(git log -1 --pretty='%an <%ae>' || echo '')
LAST_MSG=$(git log -1 --pretty='%B' || echo '')
if echo "$LAST_AUTHOR" | grep -iq "github-actions" || echo "$LAST_MSG" | grep -q "\[auto\]"; then
  echo "SKIP"
  exit 0
fi
FILE="three_app/index.html"
if [ ! -f "$FILE" ]; then echo "ERROR: $FILE not found" >&2; exit 1; fi
# extract first version occurrence like v0.1.26
OLD=$(grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' "$FILE" | head -n1 || true)
if [ -z "$OLD" ]; then echo "ERROR: no version found in $FILE" >&2; exit 1; fi
MAJ=$(echo "$OLD" | sed -E 's/v([0-9]+)\..*/\1/')
MIN=$(echo "$OLD" | sed -E 's/v[0-9]+\.([0-9]+)\..*/\1/')
PATCH=$(echo "$OLD" | sed -E 's/v[0-9]+\.[0-9]+\.([0-9]+)/\1/')
NEW_PATCH=$((PATCH + 1))
NEW="v${MAJ}.${MIN}.${NEW_PATCH}"
# replace only first occurrence
awk -v old="$OLD" -v new="$NEW" 'NR==1{found=0} { if(!found && index($0,old)){sub(old,new,$0); found=1} print }' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
# write VERSION file for easy discovery
echo "$NEW" > three_app/VERSION.txt
# commit & push if changed
if git diff --quiet -- "$FILE" >/dev/null 2>&1; then
  echo "NO_CHANGE"
  echo "$NEW"
  exit 0
fi
# configure author as actions bot
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add "$FILE" three_app/VERSION.txt
git commit -m "chore: bump version to $NEW [auto]"
# push back to the branch that triggered the workflow
git push origin HEAD:main
# emit version
echo "$NEW"
