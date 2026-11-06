#!/usr/bin/env bash
# Check hermes-memory-engine's Hermes adapter against NousResearch/hermes-agent
# at a tagged release, using upstream's own memory code as the oracle.
#
#   bash scripts/hermes-compat/run.sh v0.23.0                     # check
#   bash scripts/hermes-compat/run.sh v0.23.0 --write-fixtures    # also (re)write tests/fixtures/hermes/<tag>/
#
# Needs: a built package (npm run build), git, Python >= 3.11 (HERMES_COMPAT_PYTHON
# picks the interpreter; default python3). Upstream is shallow-cloned into a
# temporary directory and removed afterwards; nothing upstream is kept here.
set -euo pipefail

tag="${1:?usage: run.sh <hermes-agent tag, e.g. v0.23.0> [--write-fixtures]}"
write_fixtures="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cli="$root/dist/cli/index.js"
dist="$root/dist/index.js"
py="${HERMES_COMPAT_PYTHON:-python3}"
[ -f "$cli" ] && [ -f "$dist" ] || { echo "dist/ missing: run npm run build first" >&2; exit 2; }

upstream="$("$py" -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"])' "$root/compat/hermes-agent.json")"
"$py" -c 'import sys; sys.exit(sys.version_info < (3, 11))' || { echo "$py is older than 3.11 (hermes-agent needs >= 3.11)" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0
pass() { echo "  ok   $*"; }
bad() { echo "  FAIL $*"; fail=1; }

echo "hermes-compat: $upstream $tag"
git -c advice.detachedHead=false clone -q --depth 1 --branch "$tag" "https://github.com/$upstream.git" "$work/upstream"
echo "  upstream commit $(git -C "$work/upstream" rev-parse HEAD)"

# Private venv for upstream's import-time dependency (ruamel.yaml via utils ->
# hermes_yaml), pinned to the version upstream's own lockfile resolves.
if command -v uv >/dev/null 2>&1; then
  uv venv -q -p "$py" "$work/venv"
  install() { uv pip install -q -p "$work/venv/bin/python" "$@"; }
else
  "$py" -m venv "$work/venv"
  install() { "$work/venv/bin/python" -m pip install -q "$@"; }
fi
ruamel="$(awk '/^name = "ruamel-yaml"$/ { getline; gsub(/version = |"/, ""); print; exit }' "$work/upstream/uv.lock" 2>/dev/null || true)"
install "ruamel.yaml${ruamel:+==$ruamel}"
oracle() { "$work/venv/bin/python" -I "$here/oracle.py" --upstream "$work/upstream" "$@"; }

cases="$here/cases.json"
for t in memory user; do
  "$py" -c 'import json,sys; json.dump(json.load(open(sys.argv[1]))[sys.argv[2]], open(sys.argv[3], "w"), ensure_ascii=False)' \
    "$cases" "$t" "$work/$t.json"
done
expected_sorted="$("$py" -c 'import json,sys; d=json.load(open(sys.argv[1])); print(json.dumps({k: sorted(v) for k, v in d.items()}, ensure_ascii=False))' "$cases")"
same_json() { "$py" -c 'import json,sys; sys.exit(json.loads(sys.argv[1]) != json.loads(sys.argv[2]))' "$1" "$2"; }

# Upstream writes MEMORY.md / USER.md into H1.
h1="$work/h1"
for t in memory user; do oracle write "$h1" "$t" "$work/$t.json"; done

# Fixtures for the offline vitest suite: the files upstream wrote, plus the entries.
fixtures="$root/tests/fixtures/hermes/$tag"
if [ "$write_fixtures" = "--write-fixtures" ]; then
  mkdir -p "$fixtures"
  cp "$h1/memories/MEMORY.md" "$h1/memories/USER.md" "$fixtures/"
  "$py" -c 'import json,sys; d=json.load(open(sys.argv[1])); open(sys.argv[2],"w").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")' "$cases" "$fixtures/expected.json"
  echo "  wrote $fixtures"
fi
if [ -d "$fixtures" ]; then
  for f in MEMORY.md USER.md; do
    if cmp -s "$h1/memories/$f" "$fixtures/$f"; then pass "fixture $tag/$f matches what upstream writes"; else bad "fixture $tag/$f is stale (rerun with --write-fixtures)"; fi
  done
  if same_json "$(cat "$fixtures/expected.json")" "$(cat "$cases")"; then pass "fixture $tag/expected.json matches cases.json"; else bad "fixture $tag/expected.json differs from cases.json"; fi
fi

# (a) import-hermes --home reads exactly the entries upstream wrote.
mkdir -p "$work/w1"
(cd "$work/w1" && node "$cli" import-hermes --home "$h1" >/dev/null)
got="$(node "$here/store-dump.mjs" "$dist" "$work/w1/.hermes-memory")"
if same_json "$got" "$expected_sorted"; then pass "(a) import-hermes --home: entries match upstream"; else bad "(a) import-hermes --home: expected $expected_sorted, got $got"; fi

# (b) export-hermes writes files upstream parses back to the same list, in order,
#     byte-identical to what upstream itself wrote.
h2="$work/h2"
(cd "$work/w1" && node "$cli" export-hermes --home "$h2" >/dev/null)
for t in memory user; do
  got="$(oracle read "$h2" "$t")"
  want="$("$py" -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), ensure_ascii=False))' "$work/$t.json")"
  if same_json "$got" "$want"; then pass "(b) export-hermes $t: upstream reads the same entries in order"; else bad "(b) export-hermes $t: expected $want, got $got"; fi
done
for f in MEMORY.md USER.md; do
  if cmp -s "$h1/memories/$f" "$h2/memories/$f"; then pass "(b) $f byte-identical to upstream's"; else bad "(b) $f differs from upstream's"; fi
done

# (c) Without --home the CLI resolves HERMES_HOME like upstream get_hermes_home().
fakehome="$work/fakehome"
mkdir -p "$fakehome"
for form in plain tilde var; do
  case "$form" in
    plain) value="$fakehome/plain" ;;
    tilde) value="~/tilde" ;;
    var)   value="\${HMEC_COMPAT_ROOT}/var" ;;
  esac
  memdir="$(HOME="$fakehome" HMEC_COMPAT_ROOT="$fakehome" HERMES_HOME="$value" oracle memdir)"
  mkdir -p "$memdir"
  cp "$h1/memories/MEMORY.md" "$h1/memories/USER.md" "$memdir/"
  mkdir -p "$work/w-$form"
  (cd "$work/w-$form" && HOME="$fakehome" HMEC_COMPAT_ROOT="$fakehome" HERMES_HOME="$value" node "$cli" import-hermes >/dev/null)
  got="$(node "$here/store-dump.mjs" "$dist" "$work/w-$form/.hermes-memory")"
  if same_json "$got" "$expected_sorted"; then pass "(c) HERMES_HOME=$value resolves to upstream's $memdir"; else bad "(c) HERMES_HOME=$value: upstream uses $memdir, CLI imported $got"; fi
done

# Missing and empty files: nothing to import, nothing invented.
mkdir -p "$work/h3/memories" "$work/w3"
: > "$work/h3/memories/MEMORY.md"
(cd "$work/w3" && node "$cli" import-hermes --home "$work/h3" >/dev/null)
got="$(node "$here/store-dump.mjs" "$dist" "$work/w3/.hermes-memory")"
if same_json "$got" '{"memory":[],"user":[]}' && [ "$(oracle read "$work/h3" memory)" = "[]" ]; then
  pass "empty MEMORY.md and missing USER.md import nothing"
else
  bad "empty/missing files: got $got"
fi

if [ "$fail" -ne 0 ]; then echo "hermes-compat $tag: FAILED"; exit 1; fi
echo "hermes-compat $tag: passed"
