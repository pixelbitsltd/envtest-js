# Contributing

## Commands

- `npm test` — full vitest suite (unit + e2e; e2e boots a real control plane, ~30MB binary download on first run, cached after)
- `npm run test:unit` — unit tests only (sub-second)
- `npm run test:bun` — the same suite under Bun's test runner
- `npm run typecheck` / `npm run build`

Run both `npm test` and `npm run test:bun` before pushing: Node and Bun are
both first-class targets, and several bugs in this repo's history were
runtime-specific.

## Changing dependencies on Windows or macOS

npm has a long-standing bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828)):
running `npm install <pkg>` on one platform prunes *other* platforms'
optional dependencies from a lockfile that was generated elsewhere (e.g. by
Dependabot on Linux). Your machine won't notice — but `npm ci` on the Linux
CI runners will fail with `Missing: <pkg> from lock file`.

After adding or updating dependencies locally, regenerate the lockfile from
scratch and commit it:

```sh
rm -rf node_modules package-lock.json
npm install
```

A from-scratch install records the complete cross-platform graph;
incremental installs don't. For routine version bumps, prefer merging
Dependabot's PRs — its lockfiles are generated on Linux and are always
complete.
