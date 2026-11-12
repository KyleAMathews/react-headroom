// Vitest config for the oracle files only (test/**/*.oracle.js). The repository's own
// `vitest run` keeps its defaults and does not pick these files up.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // src/ is JSX in .js files; Vite only transforms JSX in .jsx/.tsx by default.
  oxc: {
    include: /\.jsx?$/,
    exclude: /node_modules/,
    lang: 'jsx',
    // As the published build compiles it: the classic runtime
    // (React.createElement), without development-only props.
    jsx: { runtime: 'classic', development: false },
  },
  test: {
    include: ['test/**/*.oracle.js'],
    // With ORACLE_BROWSER=chrome the drivers run in Chrome
    // (test/oracle-chrome.js), and this side needs no DOM.
    environment: process.env.ORACLE_BROWSER === 'chrome' ? 'node' : 'jsdom',
    // A Chrome run waits for Chrome's frames; the package oracle's first test
    // builds and packs the package (about 3s alone, more beside the others).
    testTimeout: process.env.ORACLE_BROWSER === 'chrome' ? 120000 : 20000,
  },
})
