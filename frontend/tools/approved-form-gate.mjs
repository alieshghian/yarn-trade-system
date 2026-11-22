import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createSocket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertGitBase, browserEvidence, frontend, lanes, readRegistry, requireEvidence, root, tapEvidence, trxEvidence, validateRegistry,
} from './approved-contract-integrity.mjs'

const [mode = 'frontend', selection, extra] = process.argv.slice(2)
const fixtures = lanes.filter(lane => !['unit', 'production', 'integration', 'theme-security'].includes(lane))
const npmCli = process.env.npm_execpath
const isBackend = lane => lane === 'integration' || lane === 'theme-security'

function run(command, args, { cwd = frontend, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; process.stdout.write(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolve(output.replace(/\r\n/g, '\n'))
      else reject(new Error(`${args.join(' ')} failed (${signal ?? code})`))
    })
  })
}

function npm(script, args) {
  if (!npmCli) throw new Error('Use npm run test:approved to run frontend suites.')
  return run(process.execPath, [npmCli, 'run', script, '--', ...args])
}

async function checkNode(suites, env) {
  const grouped = Map.groupBy(suites, suite => suite.file)
  for (const [file, checks] of grouped) {
    const unit = checks[0].lane === 'unit'
    const output = await run(process.execPath, unit ? ['--test', '--test-reporter=tap', file] : [file], { env })
    const evidence = unit ? tapEvidence(output) : browserEvidence(output)
    for (const suite of checks) requireEvidence(suite, evidence)
  }
}

const urlFor = server => `http://127.0.0.1:${server.httpServer.address().port}`

async function availablePort() {
  // Vite's development server treats zero as its default port.
  const socket = createSocket()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return port
}

async function checkFixtures(suites) {
  const { createServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  await Promise.all(['review-artifacts', 'artifacts/warehouse-check', 'artifacts/warehouse-floors', 'artifacts/yarn-operational-integration']
    .map(path => mkdir(new URL(path, root), { recursive: true })))
  const server = await createServer({
    root: fileURLToPath(frontend), configFile: false,
    cacheDir: fileURLToPath(new URL('.vite-approved', frontend)),
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] },
    plugins: [react(), {
      name: 'approved-form-fixture-boundary',
      configureServer(server) {
        server.middlewares.use('/api', (_request, response) => {
          response.writeHead(503, { 'Content-Type': 'application/json' }).end('{}')
        })
      },
    }],
    server: { host: '127.0.0.1', port: await availablePort(), strictPort: true, watch: null },
  })
  try {
    await server.listen()
    const url = urlFor(server)
    // Approved Yarn routing evidence is required in the central gate. The
    // standalone fixture also supports reviewing a design before activation.
    await checkNode(suites, {
      ...process.env, FORM_TEST_URL: url, APP_TEST_URL: url, FORM_TEST_EXPECT_ACTIVATED: '1',
    })
  } finally {
    await server.close()
  }
}

async function checkProduction(suites) {
  const { preview } = await import('vite')
  const temporary = await mkdtemp(join(tmpdir(), 'yarn-approved-build-'))
  let server
  try {
    await npm('build', ['--outDir', temporary])
    server = await preview({
      root: fileURLToPath(frontend), configFile: false, build: { outDir: temporary },
      preview: { host: '127.0.0.1', port: await availablePort(), strictPort: true },
    })
    await checkNode(suites, { ...process.env, APP_TEST_URL: urlFor(server) })
  } finally {
    if (server) await server.close()
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
}

async function checkBackend(suites, lane, targeted) {
  const integration = lane === 'integration'
  if (integration && !process.env.YARN_TRADE_SQL_TEST_CONNECTION) {
    throw new Error('Required YARN_TRADE_SQL_TEST_CONNECTION is missing. Integration tests require disposable databases.')
  }
  const filter = targeted ? [...new Set(suites.flatMap(suite => suite.required))]
    .map(name => 'FullyQualifiedName~' + name).join('|') : integration ? 'FullyQualifiedName!~LocalDevelopment' :
    'FullyQualifiedName~Theme_design|FullyQualifiedName~UserSettingsRules|FullyQualifiedName~Shared_title_list'
  const temporary = await mkdtemp(join(tmpdir(), 'yarn-approved-trx-'))
  try {
    await run('dotnet', [
      'test', 'tests/YarnTrade.Tests/YarnTrade.Tests.csproj', '--filter', filter,
      '--results-directory', temporary, '--logger', 'trx;LogFileName=approved.trx',
      '--logger', 'console;verbosity=minimal',
    ], { cwd: root, env: { ...process.env, DOTNET_ROLL_FORWARD: 'LatestPatch' } })
    const evidence = trxEvidence(await readFile(join(temporary, 'approved.trx'), 'utf8'))
    for (const suite of suites) requireEvidence(suite, evidence)
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
}

try {
  const registry = await readRegistry()
  const counts = await validateRegistry(registry)
  assertGitBase(registry, process.env.APPROVAL_BASE_REF)
  console.log('Approved contract coverage', JSON.stringify(counts))
  const argsValid = !extra && (mode === 'form' ? Boolean(selection) : !selection)
  if (!argsValid || !['startup', 'frontend', 'all', 'form', ...lanes].includes(mode)) {
    throw new Error('Usage: npm run test:approved -- [startup | frontend | all | form <id> | <CI lane>]')
  }
  let suites = registry.suites
  if (mode === 'startup') suites = []
  else if (mode === 'form') {
    const forms = registry.forms.filter(form => form.id === selection)
    if (!forms.length) throw new Error(`Unknown form: ${selection}`)
    const required = new Set(forms.flatMap(form => form.capabilities.flatMap(capability => capability.checks)))
    suites = suites.filter(suite => required.has(suite.id))
  } else if (mode === 'frontend') suites = suites.filter(suite => !isBackend(suite.lane))
  else if (mode === 'production') suites = suites.filter(suite => ['unit', 'production'].includes(suite.lane))
  else if (mode !== 'all') suites = suites.filter(suite => suite.lane === mode)
  if (mode !== 'startup' && !suites.length) throw new Error(`No required suites selected for ${mode}`)
  const groups = Map.groupBy(suites, suite => suite.lane)
  if (groups.has('unit')) await checkNode(groups.get('unit'))
  const browserSuites = suites.filter(suite => fixtures.includes(suite.lane))
  if (browserSuites.length) await checkFixtures(browserSuites)
  if (groups.has('production')) await checkProduction(groups.get('production'))
  for (const lane of ['theme-security', 'integration']) {
    if (groups.has(lane)) await checkBackend(groups.get(lane), lane, mode === 'form')
  }
  console.log(`PASS central approved-form gate: ${mode}${selection ? ' ' + selection : ''}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
