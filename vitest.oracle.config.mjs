// Vitest config for the oracle files only (test/**/*.oracle.js). The repository's own
// `vitest run` keeps its defaults and does not pick these files up.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // src/ is JSX in .js files; Vite only transforms JSX in .jsx/.tsx by default.
  oxc: {
    include: /\.jsx?$/,
    exclude: /node_modules/,
    lang: 'jsx',
    jsx: { runtime: 'automatic' },
  },
  test: { include: ['test/**/*.oracle.js'], environment: 'jsdom' },
})
