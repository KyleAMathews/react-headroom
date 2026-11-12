# react-headroom

`src/core.js` holds the behavior; `src/Headroom.js` (the `<Headroom>` component)
and `src/useHeadroom.js` (the hook) are views over it. `src/shouldUpdate.js`
decides what one animation frame does. The README documents every prop and
behavior; the oracle states each one as a law.

- `pnpm unit-test`: the `shouldUpdate` unit tests.
- `pnpm test:oracles`: the oracles (`test/headroom.oracle.js`, the first
  render in `test/headroom-server.oracle.js`, and the packed package in
  `test/headroom-package.oracle.js`), under the React version installed (CI
  also runs them under React 16.9, 17 and 19).
- `pnpm test:oracles:chrome`: the behavior oracle with its histories played in
  Chrome through Playwright (the installed Chrome), instead of jsdom's
  stand-ins. The gap check runs in jsdom: `@tanstack/oracles` runs only in
  Node (TanStack/oracles#49).
- `pnpm lint`: ESLint, with the oracle rules for oracle files.

<!-- BEGIN @tanstack/oracles (template 3) -->

## Oracle tests

This repository tests its laws with `@tanstack/oracles`.

**Who owns what.** The laws belong to the people who maintain this
repository: what the code promises, the authority for each promise, and its
limits. Propose a law, but do not adopt or change one without their
approval. The production code that the oracles own is yours, and you are
judged on it: fast, small, and elegant. Think of yourself as an optimizing
compiler for the oracle. Anything that keeps every oracle passing is allowed,
so make big refactors without caution: merge repeated code, remove code that
no law needs (after the checks in `oracles-design` step 8), change data
structures and algorithms, and rewrite whole modules. The oracle is the
review. You will keep building on this code, so leave it better than you
found it.

- To find where an oracle would help, or to propose a new one, read
  `node_modules/@tanstack/oracles/skills/oracles-start/SKILL.md` in full and
  follow it.
- Before you create or change an oracle, or change production code that an
  oracle owns, read `node_modules/@tanstack/oracles/skills/oracles-design/SKILL.md`
  in full and follow it.
- Before you review oracle work, read
  `node_modules/@tanstack/oracles/skills/oracles-review/SKILL.md` in full.
- Before you act on review findings, read
  `node_modules/@tanstack/oracles/skills/oracles-evaluate-review/SKILL.md` in
  full.
- Lint each oracle file and each changed production file after you edit it.
  Fix every report. Do not disable a rule.
- Oracle files: `test/**/*.oracle.js` (with the test-free harness
  `test/headroom-oracle-harness.js`, the drivers `test/oracle-driver.js`, the
  pages `test/oracle-page-jsdom.js` and `test/oracle-page-chrome.js`, and
  `test/oracle-*.js`). Gap check:
  `pnpm test:gaps`.

<!-- END @tanstack/oracles -->
