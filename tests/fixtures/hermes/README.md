# Hermes Agent fixtures

Each folder is named after a NousResearch/hermes-agent release tag and holds:

- `MEMORY.md` and `USER.md`, written by hermes-agent's own `MemoryStore.add()` at that tag
  (not by hand), from the entries in `scripts/hermes-compat/cases.json`;
- `expected.json`, the entries those files were written from.

`tests/hermes-compat.test.ts` reads every folder here, so a new tested release only needs a new folder.

To (re)generate a folder, build the package and run the compatibility check with `--write-fixtures`
(it shallow-clones the tag into a temporary directory; Python 3.11 or newer):

```bash
npm ci && npm run build
bash scripts/hermes-compat/run.sh v0.23.0 --write-fixtures
```

CI (`hermes-compat` job) runs the same script for every tag in `compat/hermes-agent.json` and fails if a
committed fixture no longer matches what upstream writes.
