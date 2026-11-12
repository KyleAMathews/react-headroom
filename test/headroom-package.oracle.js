// @vitest-environment node
/*
 * This oracle owns the published package: what `npm pack` ships, and what an
 * app gets when it requires or bundles it. It owns package.json and .babelrc
 * (the build), checked on the tarball that `pnpm build` and `pnpm pack`
 * produce.
 *
 *   require('react-headroom')                      // → { default: Headroom, useHeadroom }
 *   import Headroom, { useHeadroom } from 'react-headroom' (a bundler) // → the ES module build
 *   every file in the tarball                      // → parses as ES2019 (webpack 4)
 *   import { useHeadroom } from 'react-headroom'   // → no Headroom in the bundle
 *   the app's bundle, minified and gzipped         // → at most 2,600 bytes
 *
 * Why would a build that every test passes break an app? The tests run the
 * source; an app runs dist. A new syntax in src passes through Babel's
 * modern target untouched, and webpack 4 then fails to parse dist; a stale
 * file in dist ships; a module without "sideEffects": false keeps the
 * component in a bundle that uses only the hook.
 *
 * The laws (P1-P7): every JavaScript file in the tarball parses as ES2019
 * (P1); require() of the package and a bundler's import of it both export the
 * component as the default and useHeadroom (P2); the files that export the
 * component and the hook start with 'use client' in both builds (P3); the
 * package has no dependencies (P4); a bundle that imports only useHeadroom
 * holds none of the component's code (P5); the tarball holds exactly
 * package.json, README.md, LICENSE, and a CommonJS and an ES module file for
 * each module in src (P6); and the bundle of the component and the hook,
 * minified and gzipped with React external, is at most 2,600 bytes (P7).
 *
 * The driver builds a copy of the package with its build script and packs it
 * once per run, in its own directory under .oracle-package/ (inside the
 * repository, so require() finds React), parses its files with
 * acorn at ecmaVersion 2019, requires its main entry, and bundles it with
 * esbuild as an app's bundler does (mainFields browser, module, main).
 *
 * Limits: one bundler (esbuild) stands for the others; ES2019 stands for
 * webpack 4's parser (acorn 6).
 */
import { execSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { parse } from 'acorn'
import { buildSync } from 'esbuild'
import { differs, oracleProperty, pass } from '@tanstack/oracles'

const ROOT = resolve(import.meta.dirname, '..')
// This run's own directory, inside the repository so that the build's Babel
// presets and the package's React resolve from its node_modules; removed when
// the run ends. Concurrent runs, and the developer's dist, are not touched.
const RUNS = join(ROOT, '.oracle-package')
mkdirSync(RUNS, { recursive: true })
// A run directory more than an hour old is no concurrent run's: its run ended
// without removing it.
for (const name of readdirSync(RUNS))
  if (Date.now() - statSync(join(RUNS, name)).mtimeMs > 3600 * 1000)
    rmSync(join(RUNS, name), { recursive: true, force: true })
const OUT = mkdtempSync(join(RUNS, 'run-'))
process.on('exit', () => rmSync(OUT, { recursive: true, force: true }))
const PACKAGE = join(OUT, 'package')
const BUDGET = 2600
// The modules in src: each ships as dist/<name> and dist/esm/<name>.
const MODULES = readdirSync(join(ROOT, 'src'))
  .filter(name => name.endsWith('.js'))
  .sort()

let built
// Build and pack once per run; every law reads the same tarball.
function tarball() {
  if (built) return built
  // A copy of what the build reads, built with the package's own build script.
  const source = join(OUT, 'source')
  for (const name of [
    'src',
    'package.json',
    '.babelrc',
    'README.md',
    'LICENSE',
  ])
    cpSync(join(ROOT, name), join(source, name), { recursive: true })
  // A dist left by an older build, with a module src no longer has.
  mkdirSync(join(source, 'dist'), { recursive: true })
  writeFileSync(join(source, 'dist', 'removed.js'), 'module.exports = 1\n')
  const env = {
    ...process.env,
    PATH: `${join(ROOT, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`,
  }
  const { scripts } = JSON.parse(
    readFileSync(join(source, 'package.json'), 'utf8')
  )
  execSync(scripts.build, { cwd: source, env, stdio: 'pipe' })
  execSync(
    `npm pack --ignore-scripts --pack-destination ${JSON.stringify(OUT)}`,
    {
      cwd: source,
      env,
      stdio: 'pipe',
    }
  )
  const tgz = readdirSync(OUT).find(name => name.endsWith('.tgz'))
  execSync(`tar -xzf ${JSON.stringify(tgz)}`, { cwd: OUT, stdio: 'pipe' })
  const files = execSync(`tar -tzf ${JSON.stringify(tgz)}`, { cwd: OUT })
    .toString()
    .trim()
    .split('\n')
    .map(path => path.replace(/^package\//, ''))
    .sort()
  built = { files }
  return built
}
const read = path => readFileSync(join(PACKAGE, path), 'utf8')
// An app's bundle of `source`, which imports the package by its path, written
// to .oracle-package/app.mjs.
function bundle(source) {
  const entry = join(OUT, 'app.js')
  writeFileSync(entry, source)
  const result = buildSync({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    external: ['react', 'react-dom'],
    outfile: join(OUT, 'app.mjs'),
    logLevel: 'silent',
    metafile: true,
  })
  return {
    code: readFileSync(join(OUT, 'app.mjs'), 'utf8'),
    inputs: Object.keys(result.metafile.inputs).map(path =>
      relative(OUT, resolve(path))
    ),
  }
}
const IMPORT = `import Headroom, { useHeadroom } from './package'\nexport { Headroom, useHeadroom }\n`

const LIMITS =
  'One bundler (esbuild) stands for the others; ES2019 stands for webpack 4 (acorn 6).'
const AUTHORITY =
  'Decisions by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: build for modern browsers in syntax that webpack 4 parses (review finding V2); ship an ES module build beside the CommonJS one; no runtime dependencies (raf dropped); keep the package small; cover the package in the oracles (review findings W5, W6, W7)'

const runOnce = fn => async (plan, observe) => {
  try {
    tarball()
    await fn(plan, observe)
  } catch (error) {
    observe('error', { message: String(error && error.message).slice(0, 500) })
  }
}
const failed = trace => {
  const error = trace.find(o => o.checkpoint === 'error')
  return error
    ? differs(
        'error',
        'package',
        error.value,
        null,
        'the build or a read failed'
      )
    : undefined
}

oracleProperty({
  id: 'package syntax',
  owns: ['package.json', '.babelrc'],
  law: {
    statement:
      'For every JavaScript file in the tarball, the file parses as ES2019 (a CommonJS script, or a module in dist/esm).',
    authority: `${AUTHORITY}; webpack 4 parses with acorn 6 (ES2019).`,
    limits: LIMITS,
  },
  histories: {
    enumerated: MODULES.flatMap(name => [
      { file: `dist/${name}`, sourceType: 'script' },
      { file: `dist/esm/${name}`, sourceType: 'module' },
    ]),
  },
  label: h => h.file,
  model: () => ({ parsed: true }),
  driver: runOnce((plan, observe) => {
    let parsed = true
    let message = ''
    try {
      parse(read(plan.file), { ecmaVersion: 2019, sourceType: plan.sourceType })
    } catch (error) {
      parsed = false
      message = error.message
    }
    observe('parse', { parsed, message })
  }),
  check: (plan, trace, expected) =>
    failed(trace) ??
    differs(
      'parse',
      'package syntax',
      trace.find(o => o.checkpoint === 'parse').value.parsed,
      expected.parsed,
      `${plan.file}: ${trace.find(o => o.checkpoint === 'parse').value.message}`
    ) ??
    pass,
  calibrations: [
    {
      name: 'a file that does not parse',
      law: 'package syntax',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'parse'
            ? { ...o, value: { parsed: false, message: '?.' } }
            : o
        ),
    },
  ],
})

oracleProperty({
  id: 'package entry points',
  owns: ['package.json', '.babelrc'],
  law: {
    statement:
      "For require() of the package and for a bundler's import of it, the package exports the component as its default and useHeadroom, and the bundler takes the ES module build.",
    authority: `${AUTHORITY}; package.json "main" and "module".`,
    limits: LIMITS,
  },
  histories: { enumerated: [{ entry: 'require' }, { entry: 'bundler' }] },
  label: h => h.entry,
  model: plan => ({
    exports: { default: 'function', useHeadroom: 'function' },
    build: plan.entry === 'bundler' ? 'esm' : 'cjs',
  }),
  driver: runOnce(async (plan, observe) => {
    if (plan.entry === 'require') {
      const loaded = createRequire(join(PACKAGE, 'package.json'))('./')
      observe('exports', {
        exports: {
          default: typeof loaded.default,
          useHeadroom: typeof loaded.useHeadroom,
        },
        build: 'cjs',
      })
      return
    }
    // The app's bundle, run: React resolves from the repository.
    const { inputs } = bundle(IMPORT)
    const loaded = await import(
      `${pathToFileURL(join(OUT, 'app.mjs')).href}?${inputs.length}`
    )
    observe('exports', {
      exports: {
        default: typeof loaded.Headroom,
        useHeadroom: typeof loaded.useHeadroom,
      },
      build: inputs.some(path => path.startsWith('package/dist/esm/'))
        ? 'esm'
        : 'cjs',
    })
  }),
  check: (plan, trace, expected) =>
    failed(trace) ??
    differs(
      'exports',
      'package entry points',
      trace.find(o => o.checkpoint === 'exports').value,
      expected,
      plan.entry
    ) ??
    pass,
  calibrations: [
    {
      name: 'a bundler that took the CommonJS build',
      law: 'package entry points',
      corrupt: (trace, plan) =>
        plan.entry !== 'bundler'
          ? undefined
          : trace.map(o =>
              o.checkpoint === 'exports'
                ? { ...o, value: { ...o.value, build: 'cjs' } }
                : o
            ),
    },
  ],
})

oracleProperty({
  id: "package 'use client'",
  owns: ['package.json', '.babelrc'],
  law: {
    statement:
      "For the package's entry and the files that define the component and the hook, in both builds, the first statement is the 'use client' directive.",
    authority: `${AUTHORITY}; issue #211 (Next.js App Router); README ("its files start with 'use client'").`,
    limits: LIMITS,
  },
  histories: {
    enumerated: ['index.js', 'Headroom.js', 'useHeadroom.js'].flatMap(name => [
      { file: `dist/${name}`, sourceType: 'script' },
      { file: `dist/esm/${name}`, sourceType: 'module' },
    ]),
  },
  label: h => h.file,
  model: () => ({ directive: 'use client' }),
  driver: runOnce((plan, observe) => {
    const program = parse(read(plan.file), {
      ecmaVersion: 'latest',
      sourceType: plan.sourceType,
    })
    observe('first', { directive: program.body[0]?.directive ?? null })
  }),
  check: (plan, trace, expected) =>
    failed(trace) ??
    differs(
      'first',
      "package 'use client'",
      trace.find(o => o.checkpoint === 'first').value,
      expected,
      plan.file
    ) ??
    pass,
  calibrations: [
    {
      name: "a file without 'use client'",
      law: "package 'use client'",
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'first' ? { ...o, value: { directive: null } } : o
        ),
    },
  ],
})

oracleProperty({
  id: 'package dependencies',
  owns: ['package.json'],
  law: {
    statement: 'For the packed package.json, there are no dependencies.',
    authority: `${AUTHORITY}.`,
    limits: LIMITS,
  },
  histories: { enumerated: [{ field: 'dependencies' }] },
  label: h => h.field,
  model: () => ({ dependencies: [] }),
  driver: runOnce((plan, observe) => {
    const manifest = JSON.parse(read('package.json'))
    observe('manifest', {
      dependencies: Object.keys(manifest[plan.field] ?? {}),
    })
  }),
  check: (plan, trace, expected) =>
    failed(trace) ??
    differs(
      'manifest',
      'package dependencies',
      trace.find(o => o.checkpoint === 'manifest').value,
      expected,
      'dependencies'
    ) ??
    pass,
  calibrations: [
    {
      name: 'raf back as a dependency',
      law: 'package dependencies',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'manifest'
            ? { ...o, value: { dependencies: ['raf'] } }
            : o
        ),
    },
  ],
})

oracleProperty({
  id: 'package tree-shaking',
  owns: ['package.json', '.babelrc'],
  law: {
    statement:
      "For a bundle that imports only useHeadroom, the bundle holds none of the component's code (its class names and its render).",
    authority: `${AUTHORITY}; review finding W6 ("sideEffects": false).`,
    limits: LIMITS,
  },
  histories: { enumerated: [{ imports: 'useHeadroom' }] },
  label: h => h.imports,
  model: () => ({ component: false }),
  driver: runOnce((plan, observe) => {
    const { code } = bundle(`export { ${plan.imports} } from './package'\n`)
    observe('bundle', { component: code.includes('headroom-wrapper') })
  }),
  check: (plan, trace, expected) =>
    failed(trace) ??
    differs(
      'bundle',
      'package tree-shaking',
      trace.find(o => o.checkpoint === 'bundle').value,
      expected,
      'the component in a bundle of the hook'
    ) ??
    pass,
  calibrations: [
    {
      name: 'the component kept',
      law: 'package tree-shaking',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'bundle' ? { ...o, value: { component: true } } : o
        ),
    },
  ],
})

oracleProperty({
  id: 'package contents',
  owns: ['package.json', '.babelrc'],
  law: {
    statement:
      'For the tarball, built over a dist that an older build left, the files are exactly package.json, README.md, LICENSE, and dist/<name> and dist/esm/<name> for each module in src.',
    authority: `${AUTHORITY}; review finding W7 (stale files in dist); issue #129 (config shipped).`,
    limits: LIMITS,
  },
  histories: { enumerated: [{ modules: MODULES }] },
  label: () => 'tarball',
  model: plan =>
    [
      'LICENSE',
      'README.md',
      'package.json',
      ...plan.modules.flatMap(name => [`dist/${name}`, `dist/esm/${name}`]),
    ].sort(),
  driver: runOnce((plan, observe) => observe('files', tarball().files)),
  check: (plan, trace, expected) =>
    failed(trace) ??
    differs(
      'files',
      'package contents',
      trace.find(o => o.checkpoint === 'files').value,
      expected,
      'the files in the tarball'
    ) ??
    pass,
  calibrations: [
    {
      name: 'a stale file in dist',
      law: 'package contents',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'files'
            ? { ...o, value: [...o.value, 'dist/old.js'].sort() }
            : o
        ),
    },
  ],
})

oracleProperty({
  id: 'package size',
  owns: ['package.json', '.babelrc'],
  law: {
    statement: `For an app's bundle of the component and the hook (minified, React external), the gzipped size is at most ${BUDGET} bytes.`,
    authority: `${AUTHORITY}; the budget is the size after the size pass (2,493 bytes) with about 4% to spare.`,
    limits: LIMITS,
  },
  histories: { enumerated: [{ imports: 'both' }] },
  label: h => h.imports,
  model: () => ({ withinBudget: true }),
  driver: runOnce((plan, observe) => {
    const bytes = gzipSync(bundle(IMPORT).code, { level: 9 }).length
    observe('size', { withinBudget: bytes <= BUDGET, bytes })
  }),
  check: (plan, trace, expected) => {
    const size = trace.find(o => o.checkpoint === 'size')
    return (
      failed(trace) ??
      differs(
        'size',
        'package size',
        { withinBudget: size.value.withinBudget },
        expected,
        `${size.value.bytes} bytes gzipped`
      ) ??
      pass
    )
  },
  calibrations: [
    {
      name: 'a bundle over budget',
      law: 'package size',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'size'
            ? { ...o, value: { withinBudget: false, bytes: 9999 } }
            : o
        ),
    },
  ],
})
