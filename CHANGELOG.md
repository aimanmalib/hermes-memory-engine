# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/)
(0.x: minor versions may contain breaking changes).

## [0.2.0] - 2026-10-23

### Changed

- **Breaking:** requires Node.js 22.12 or newer (`engines.node`). Node 20 reached end of life in April 2026, and
  commander 15 needs Node 22.12 (#13).
- commander 13 → 15 for the `hermes-memory` CLI. The CLI has no `--no-*` options, so commander 15's change to their
  defaults does not apply.

### Internal

- tsup 8 → 9, which brings esbuild 0.28.2 and closes the remaining `npm audit` / Dependabot advisory (esbuild before
  0.28.1, Windows development server only; it never shipped in the package).
- CI tests on Node 22 and 24; the Node 20 build-and-smoke job is gone.

## [0.1.1] - 2026-10-22

### Fixed

- `export-hermes` no longer swaps the two files. Entries imported from `USER.md` were written back into `MEMORY.md`
  and the reverse, overwriting both. Export now routes each entry by `metadata.target`, then by its target tag.
- The memory tool's `memory_add` rejects a call without usable `content` instead of storing `undefined`.
- `hermes-memory --version` reports the real package version (it was hard-coded to `0.1.0`).
- The default Hermes home is `os.homedir()/.hermes` instead of `/root/.hermes`.

### Added

- `HttpBackend` is exported from the package entry point, as the README already documented.
- Exported `MemoryToolArgs` and `MemoryToolResult` types for `handleToolCall`.

### Changed

- README rewritten against the real API: every TypeScript example type-checks against `src/`, and every CLI command
  in it was run end to end. Added a terminal demo recorded from the published package.

### Internal

- CI was red since the first pushes; it now runs typecheck, lint (0 warnings), tests, build and coverage on Node 22
  and 24, and builds plus smoke-tests the package on Node 20.
- Publishing only happens when a GitHub Release is published (it previously would have run on every push to `main`).
- vitest 3 → 5 and other dev updates: `npm audit` went from 2 critical + 6 high to a single low (esbuild, Windows dev
  server only; held until Node 20 is dropped, see #13). `sprintf-js` is no longer in the tree.
- `SECURITY.md`, Dependabot, and private vulnerability reporting.

## [0.1.0] - 2026-06-06

First release on npm: `MemoryStore` with `FileBackend` (Markdown + YAML frontmatter) and `SQLiteBackend`, multi-agent
namespaces, LLM-based compression, search, encryption, versioning and sync building blocks, Hermes Agent import/export,
and the `hermes-memory` CLI.

[0.1.1]: https://github.com/aimanmalib/hermes-memory-engine/compare/cbd18a7...v0.1.1
[0.1.0]: https://www.npmjs.com/package/hermes-memory-engine/v/0.1.0
