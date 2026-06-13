#!/usr/bin/env bash
# verify-gates.sh — Opus "Required Tests" live gates for refactor-redirect-cleanup.
#
# Run AFTER the redirect function is associated and the /* invalidation has
# propagated (allow a few minutes for cache lag). This script is READ-ONLY and
# safe to run repeatedly. It does NOT delete anything — the destructive delete
# is intentionally a separate, human-gated step (see the bottom of this file
# and README.md).
#
# Usage:  ./verify-gates.sh
set -uo pipefail

BASE="https://pokevault.mariellen.com.au"
BUCKET="s3://pokevault.mariellen.com.au"
PREFIX="pokevault-refactor/"
PASS=0; FAIL=0

ok(){ echo "  PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

code(){ curl -s -o /dev/null -w '%{http_code}' -I "$1"; }
loc(){ curl -sI "$1" | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2}'; }

echo "== Gate 1: /pokevault-refactor/index.html -> 301 to root =="
C=$(code "$BASE/pokevault-refactor/index.html"); L=$(loc "$BASE/pokevault-refactor/index.html")
{ [ "$C" = "301" ] && [ "$L" = "$BASE/" ]; } && ok "301 -> $L" || no "got $C loc=$L"

echo "== Gate 2: deep subpath -> 301 =="
C=$(code "$BASE/pokevault-refactor/anything/deep/path")
[ "$C" = "301" ] && ok "deep path 301" || no "deep path got $C"

echo "== Gate 3: root / -> 200 (no over-match) =="
C=$(code "$BASE/")
[ "$C" = "200" ] && ok "root 200" || no "root got $C"

echo "== Gate 4: real app routes still 200 =="
for p in /index.html /js/app.js /css/styles.css; do
  C=$(code "$BASE$p")
  [ "$C" = "200" ] && ok "$p 200" || no "$p got $C"
done

echo "== Gate 5: deploy.yml does not target the s3 prefix =="
if grep -rEq "s3://[^[:space:]'\"]*/pokevault-refactor/" "$(git rev-parse --show-toplevel)/.github/workflows/deploy.yml"; then
  no "deploy.yml targets the s3 prefix"
else
  ok "no s3 prefix destination in deploy.yml"
fi

echo "== Gate 6: capture the DRY-RUN delete list (non-destructive) =="
echo "  (review this list before any real delete)"
aws s3 rm "${BUCKET}/${PREFIX}" --recursive --dryrun | tee /tmp/pokevault-refactor-dryrun.txt
DRY_COUNT=$(grep -c '^(dryrun) delete:' /tmp/pokevault-refactor-dryrun.txt || true)
echo "  dry-run would delete: ${DRY_COUNT} object(s)"

echo
echo "==== ${PASS} passed, ${FAIL} failed ===="
[ "$FAIL" -eq 0 ] || exit 1

cat <<'EOF'

NEXT (human-gated, IRREVERSIBLE unless bucket versioning is on):
  1. Confirm versioning:  aws s3api get-bucket-versioning --bucket pokevault.mariellen.com.au
  2. Review /tmp/pokevault-refactor-dryrun.txt — every line must be under pokevault-refactor/.
  3. With explicit sign-off, run the real delete:
       aws s3 rm s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive
  4. Gate 7:  aws s3 ls s3://pokevault.mariellen.com.au/pokevault-refactor/ --recursive   # must be empty
  5. Gate 8:  re-run this script — root must still be 200.
EOF
