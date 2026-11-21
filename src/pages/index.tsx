/**
 * Landing page — a STATIC page.
 *
 * It lives at the top level of src/pages/ (not under (app)/), so it renders
 * with no DeepSpace providers: no auth session fetch, no records WebSocket.
 * That makes it cheap to serve and safe for logged-out / crawler traffic.
 *
 * Need live data or auth here? Move this file to src/pages/(app)/index.tsx
 * and it becomes a dynamic page. Conversely, any page you want to keep static
 * (marketing, docs, legal) belongs at this top level.
 *
 * Top-level pages are also prerendered to static HTML at build
 * (prerender.ts, via vite.config.ts) so crawlers read real content.
 * Keep them renderable without a browser: no window/document during render,
 * prose in HTML text, reveal animations in CSS keyframes rather than JS-driven
 * initial states. `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { PublicDemo } from '../components/PublicDemo'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div
        data-testid="static-landing"
        className="flex min-h-screen flex-col items-center gap-10 px-6 py-14 text-center"
      >
        <div>
          <p className="mb-3 text-sm uppercase tracking-widest text-muted-foreground">{APP_NAME}</p>
          <h1 className="mb-4 max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Explore Java documentation in context
          </h1>
          <p className="mx-auto mb-6 max-w-md text-muted-foreground">
            Browse Java methods and see how DocLens evaluates and repairs Javadocs.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="#public-demo" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
              View free public demo
            </a>
            <Link to="/home" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium">
              Open method explorer
            </Link>
          </div>
        </div>
        <PublicDemo />
      </div>
    </>
  )
}
