/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0
  const catalogReady = Promise.withResolvers<void>()

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await catalogReady.promise
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  catalogReady.resolve()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('private imports and evaluation stay within the owning account', async ({ users }) => {
  test.setTimeout(90_000)
  const [owner, other] = await users(2)
  const externalExport = process.env.DOCLENS_TEST_JSONL
  const fixture = externalExport
    ? { name: 'local-extraction.jsonl', path: externalExport }
    : { name: 'catalog-test.jsonl', path: '' }
  const { readFile } = await import('node:fs/promises')
  const buffer = fixture.path ? await readFile(fixture.path) :
    Buffer.from((await readFile(new URL('../src/datasets/dbutils/method-contexts.jsonl', import.meta.url), 'utf8')).split('\n')[0])

  await owner.page.goto('/home')
  await owner.page.getByText('Add private Java input').click()
  await expect(owner.page.getByRole('heading', { name: 'Methods 18' })).toBeVisible()
  await owner.page.getByLabel('Project name').fill('Uploaded method test')
  await owner.page.getByLabel('CoCoMUT file').setInputFiles({ name: fixture.name, mimeType: 'application/x-ndjson', buffer })
  const [savedUpload] = await Promise.all([
    owner.page.waitForResponse((response) => response.url().endsWith('/save-java-input')),
    owner.page.getByRole('button', { name: 'Save private project' }).click(),
  ])
  expect(await savedUpload.json()).toMatchObject({ success: true, data: { methodCount: fixture.path ? 10 : 1 } })
  await expect(owner.page.getByRole('heading', { name: fixture.path ? 'Methods 10' : 'Methods 1' })).toBeVisible()

  await owner.page.getByLabel('Input type').selectOption('paste')
  await owner.page.getByLabel('Project name').fill('Pasted method test')
  await owner.page.getByLabel('Java method').fill('public int doubleValue(int value) { return value * 2; }')
  await owner.page.getByLabel('Javadoc').fill('/** Returns three times the input.\n * @param wrongName input\n * @see MissingType#run()\n */')
  await owner.page.getByRole('button', { name: 'Save private project' }).click()
  await owner.page.getByRole('button', { name: 'doubleValue (value)' }).click()
  const privateUrl = owner.page.url()
  const methodId = new URL(privateUrl).searchParams.get('method')
  const [evaluationResponse] = await Promise.all([
    owner.page.waitForResponse((response) => response.url().endsWith('/evaluate-java'), { timeout: 60_000 }),
    owner.page.getByRole('button', { name: 'Evaluate', exact: true }).click(),
  ])
  const result = await evaluationResponse.json()
  expect(result).toMatchObject({ success: true, data: { completeness: { score: 1 / 3 } } })
  const evaluation = owner.page.getByRole('region', { name: 'Documentation evaluation' })
  await expect(evaluation).toContainText('@param wrongName · invalid')
  await expect(evaluation).toContainText('MissingType#run() · unresolved')
  if (process.env.DOCLENS_REQUIRE_AI === '1') {
    expect(result.data.warnings).toEqual([])
    expect(result.data.helpfulness.score).toBeGreaterThanOrEqual(1)
    expect(result.data.behavior.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'contradicted', evidence: expect.arrayContaining([
        expect.objectContaining({ quote: expect.stringContaining('value * 2') }),
      ]) }),
    ]))
  }
  await owner.page.reload()
  await expect(evaluation).toContainText('Completeness · 33%')

  const requestId = 'private-method-write-denied'
  let writeAck: unknown
  let privateRead: unknown
  await other.page.routeWebSocket(/\/ws\/app(?::|%3A)/i, (socket) => {
    const server = socket.connectToServer()
    let checked = false
    socket.onMessage((message) => {
      server.send(message)
      if (checked || typeof message !== 'string' || JSON.parse(message).type !== 'core.subscribe') return
      checked = true
      server.send(JSON.stringify({ type: 'core.put', payload: {
        collection: 'private_methods', recordId: methodId, data: { code: 'unauthorized update' }, requestId,
      } }))
      server.send(JSON.stringify({ type: 'core.subscribe', payload: {
        subscriptionId: requestId, query: { collection: 'private_methods', where: { projectId: new URL(privateUrl).searchParams.get('project') } },
      } }))
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const { type, payload } = JSON.parse(message)
        if (type === 'records.ack' && payload.requestId === requestId) writeAck = payload
        if (type === 'core.query_result' && payload.subscriptionId === requestId) privateRead = payload.records
      }
      socket.send(message)
    })
  })
  await other.page.goto(privateUrl)
  await expect(other.page.getByText('Private project pending or unavailable.')).toBeVisible()
  await expect(other.page.getByText('Pasted method test')).toHaveCount(0)
  await expect.poll(() => writeAck).toMatchObject({ success: false })
  await expect.poll(() => privateRead).toEqual([])
  await other.page.goto('/home')
  // This uses the other account's real bearer token and the owner's method ID.
  await other.page.route('**/api/actions/evaluate-java', (route) =>
    route.continue({ postData: JSON.stringify({ methodId, private: true }) }))
  const [denied] = await Promise.all([
    other.page.waitForResponse((response) => response.url().endsWith('/evaluate-java')),
    other.page.getByRole('button', { name: 'Evaluate', exact: true }).click(),
  ])
  expect(await denied.json()).toMatchObject({ success: false, code: 'not_found' })
})
