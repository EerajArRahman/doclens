import type { ReactNode } from 'react'
import { useQuery } from 'deepspace'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, Code2, ExternalLink } from 'lucide-react'
import type { Method, Project } from '../../datasets/cocomut'

const card = 'min-w-0 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6'
const codeBlock = 'mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed sm:text-sm'
const linkClass = 'inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:decoration-current'

export default function HomePage() {
  const projects = useQuery<Project>('projects', { orderBy: 'name', orderDir: 'asc' })
  const [params, setParams] = useSearchParams()
  const project = projects.records.find((row) => row.recordId === params.get('project')) ?? projects.records[0]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
      <div className="mb-8 border-b border-border pb-7">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Method explorer</h1>
        <p className="mt-2 text-sm text-muted-foreground">Java source, original Javadocs, and CoCoMUT call context.</p>
      </div>

      {projects.status === 'loading' && <p role="status">Loading projects…</p>}
      {projects.status === 'error' && <p role="alert">Could not load projects.</p>}
      {projects.status === 'ready' && !project && <p>No projects have been imported.</p>}
      {project && (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              Project
              <select
                className="rounded-md border border-border bg-card px-3 py-2"
                value={project.recordId}
                onChange={(event) => setParams({ project: event.target.value })}
              >
                {projects.records.map((row) => (
                  <option key={row.recordId} value={row.recordId}>{row.data.name} · {row.data.revision.slice(0, 8)}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <SourceLink href={project.data.licenseUrl}>{project.data.license}</SourceLink>
              <SourceLink href={project.data.artifactUrl}>CoCoMUT export</SourceLink>
              <SourceLink href={project.data.citationUrl}>Citation</SourceLink>
            </div>
          </div>
          <Methods key={project.recordId} projectId={project.recordId} />
        </>
      )}
    </div>
  )
}

function Methods({ projectId }: { projectId: string }) {
  const [params, setParams] = useSearchParams()
  const { records, status } = useQuery<Method>('methods', {
    where: { projectId },
    orderBy: 'signature',
    orderDir: 'asc',
  })
  const selected = records.find((method) => method.recordId === params.get('method')) ?? records[0]

  if (status === 'loading') return <p role="status">Loading methods…</p>
  if (status === 'error') return <p role="alert">Could not load methods.</p>
  if (!selected) return <p>No methods have been imported for this project.</p>

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Methods <span className="ml-2 text-muted-foreground">{records.length}</span></h2>
        <ul className="max-h-64 overflow-y-auto p-2 lg:max-h-[70vh]">
          {records.map(({ recordId, data }) => (
            <li key={recordId}>
              <button
                type="button"
                aria-pressed={recordId === selected.recordId}
                onClick={() => setParams({ project: projectId, method: recordId })}
                className="w-full rounded-md px-3 py-2.5 text-left hover:bg-muted aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-primary/50"
              >
                <span className="block break-all font-mono text-sm font-semibold">{shortName(data.qualifiedName)}</span>
                <span className="mt-1 block break-all text-xs text-muted-foreground">
                  ({data.context.parameters.map((param) => param.name).join(', ')})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <MethodDetail method={selected.data} />
    </div>
  )
}

function shortName(qualifiedName: string) {
  return qualifiedName.split('.').slice(-2).join('.')
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className={linkClass} target="_blank" rel="noreferrer">{children}<ExternalLink size={13} aria-hidden="true" /></a>
}

function MethodDetail({ method }: { method: Method }) {
  const { context } = method
  return (
    <article className="grid min-w-0 gap-4" aria-label="Selected method">
      <header className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="break-all font-mono text-xl font-semibold">{shortName(method.qualifiedName)}</h2>
          <span className="text-sm"><SourceLink href={method.sourceUrl}>Upstream source</SourceLink></span>
        </div>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{method.signature}</p>
      </header>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-semibold"><BookOpen size={17} aria-hidden="true" /> Original Javadoc</h3>
        <pre className={`${codeBlock} whitespace-pre-wrap break-words`}>{method.javadoc || 'No Javadoc extracted.'}</pre>
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-semibold"><Code2 size={18} aria-hidden="true" /> Java source</h3>
        <pre className={codeBlock}><code>{method.code}</code></pre>
      </section>

      <section className={card}>
        <h3 className="mb-4 font-semibold">Declaration</h3>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium">Parameters</dt>
            <dd>{context.parameters.length ? (
              <ul className="mt-1 space-y-1 font-mono text-xs">
                {context.parameters.map(({ name, type }) => <li className="break-all" key={name}>{type} {name}</li>)}
              </ul>
            ) : 'None'}</dd>
          </div>
          <div>
            <dt className="font-medium">Return type</dt>
            <dd className="mt-1 break-all font-mono text-xs">{method.returnType || 'Constructor'}</dd>
          </div>
          <div>
            <dt className="font-medium">Declared exceptions</dt>
            <dd>{context.exceptions.length ? (
              <ul className="mt-1 space-y-1 break-all font-mono text-xs">
                {context.exceptions.map((exception) => <li key={exception}>{exception}</li>)}
              </ul>
            ) : 'None'}</dd>
          </div>
        </dl>
      </section>

      <section className={card}>
        <h3 className="font-semibold">Static call context</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          CoCoMUT schema {context.schemaVersion} · {context.callGraph?.method_matched
            ? `Bytecode matched (${context.callGraph.algorithm ?? 'static analysis'})`
            : 'Bytecode match unavailable'}
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Calls title="Callers" edges={context.callers} />
          <Calls title={context.schemaVersion === '0.5.0' ? 'Source callees' : 'Callees'} edges={context.callees} />
        </div>
      </section>
    </article>
  )
}

function Calls({ title, edges }: { title: string; edges: Method['context']['callers'] }) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-medium">{title} ({edges.length})</h4>
      {edges.length ? (
        <ul className="mt-2 space-y-1">
          {edges.map((edge, index) => {
            const signature = edge.raw_signature || edge.signature || edge.target_uri || edge.method_uri || edge.method_name
            return (
              <li key={`${signature}-${index}`} className="break-all rounded-md bg-muted/40 px-2.5 py-2 font-mono text-xs">
                {signature}
                {edge.resolution && edge.resolution !== 'resolved' && (
                  <span className="ml-2 text-muted-foreground">({edge.resolution})</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : <p className="mt-2 text-sm text-muted-foreground">None reported</p>}
    </div>
  )
}
