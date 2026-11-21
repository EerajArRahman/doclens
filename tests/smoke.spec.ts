import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Smoke tests covering both page kinds this template ships:
 *   - '/'      → the static landing (top level of src/pages/): no providers,
 *                so no auth fetch and no records WebSocket on load.
 *   - '/home'  → a dynamic page (under src/pages/(app)/): the providers mount,
 *                the nav shell renders, and the records WebSocket connects.
 *
 * The "static contract" test is the guardrail for the per-page opt-out: if
 * someone moves the providers back up into _app.tsx, it fails.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('static landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByTestId('static-landing')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('landing carries one title, one description, one canonical', async ({ page }) => {
    // <Seo> (src/pages/index.tsx, values from src/seo.ts) hoists these into
    // <head>. Exactly one of each: index.html ships no static description or
    // canonical, because React 19 would not dedupe against them on mount.
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await expect(page).toHaveTitle(/\S/)
    expect(await page.locator('head meta[name="description"]').count()).toBe(1)
    expect(await page.locator('head link[rel="canonical"]').count()).toBe(1)
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('dynamic app boundary mounts on /home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})

test('persisted catalog loads and an overloaded method is retained on reload', async ({ page }) => {
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Methods 18' })).toBeVisible()
  const close = page.getByRole('button', { name: 'DbUtils.close (stmt)', exact: true })
  await close.click()
  const detail = page.getByRole('article', { name: 'Selected method' })
  await expect(detail).toContainText('close(final Statement stmt)')
  await expect(detail.getByRole('heading', { name: 'Original Javadoc' })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Java source' })).toBeVisible()
  await expect(detail.locator('dd').filter({ hasText: 'java.sql.Statement stmt' })).toBeVisible()
  await expect(detail.locator('dd').filter({ hasText: /^void$/ })).toBeVisible()
  await expect(detail.locator('dd').filter({ hasText: 'java.sql.SQLException' })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Callers (2)' })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Callees (1)' })).toBeVisible()
  await expect(detail.getByRole('link', { name: 'Upstream source' })).toHaveAttribute('href', /DbUtils\.java#L147$/)

  await page.getByRole('button', { name: 'DbUtils.close (conn)', exact: true }).click()
  await expect(detail).toContainText('close(final Connection conn)')
  await page.reload()
  await expect(detail).toContainText('close(final Connection conn)')
  await expect(page.getByRole('heading', { name: 'Methods 18' })).toBeVisible()
})

test('signed-out visitors can inspect the demo evaluation and repair from the landing page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'View free public demo' }).click()
  await expect(page).toHaveURL(/#public-demo$/)
  const demo = page.getByRole('region', { name: 'Public demo report' })
  await expect(demo).toContainText('Completeness · 33%')
  await expect(demo).toContainText('return value * 2;')
  await expect(demo.getByRole('heading', { name: 'Reviewed repair example' })).toBeVisible()
})


test('method explorer links signed-out visitors directly to the public report on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/home')
  await page.getByRole('link', { name: 'View free public demo' }).click()
  await expect(page).toHaveURL(/\/#public-demo$/)
  await expect(page.getByRole('heading', { name: 'Public demo report' })).toBeInViewport()
  await expect(page.getByTestId('nav-sign-in-button')).toHaveCount(0)
})
