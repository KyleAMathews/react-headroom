# react-headroom

`src/core.js` holds the behavior; `src/index.js` (the `<Headroom>` component)
and `src/useHeadroom.js` (the hook) are views over it. `src/shouldUpdate.js`
decides what one animation frame does. The README documents every prop and
behavior; the oracle states each one as a law.

- `pnpm unit-test`: the `shouldUpdate` unit tests.
- `pnpm test:oracles`: the oracle (`test/headroom.oracle.js`), under the React
  version installed (CI also runs it under React 19).
- `pnpm lint`: ESLint, with the oracle rules for oracle files.

<!-- BEGIN @tanstack/oracles (template 3) -->

## Oracle tests

This repository tests its laws with `@tanstack/oracles`.

**Who owns what.** The laws belong to the people who maintain this
repository: what the code promises, the authority for each promise, and its
limits. Propose a law, but do not adopt or change one without their
approval. The production code that the oracles own is yours. How it is built
is your call, and you will keep building on it. Make it the smallest, clearest
code that satisfies the oracles: merge repeated code, remove code that no law
needs (after the checks in `oracles-design` step 8), and restructure freely while the oracles pass.

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
  `test/headroom-oracle-harness.js` and `test/oracle-frames.js`). Gap check:
  `pnpm test:gaps`.

<!-- END @tanstack/oracles -->
