import { useState } from 'react'
import { useQuery } from 'deepspace'
import type { RepairRecord } from '../evaluation/repair'
import { action } from '../lib/java-action'
import { EvaluationFindings, percent } from './EvaluationFindings'

type Version = { revisionId: string; record: RepairRecord }
const button = 'rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-60'
const helpfulness = (score: number | null) => score === null ? 'Not scored' : `${score.toFixed(1)}/5`

export function JavadocRepair({ methodId, isPrivate }: { methodId: string; isPrivate: boolean }) {
  const history = useQuery<RepairRecord>('javadoc_repairs', {
    where: { methodId }, orderBy: 'createdAt', orderDir: 'desc', limit: 25,
  })
  const [selected, setSelected] = useState<Version>()
  const [edit, setEdit] = useState<string>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const latest = history.records[0]
  const active = selected ?? (latest && { revisionId: latest.recordId, record: latest.data })
  const { revision, approved } = active?.record ?? {}
  const text = edit ?? revision?.javadoc ?? ''
  const dirty = Boolean(revision && text !== revision.javadoc)
  const blocking = revision?.report.behavior.claims.some(({ status }) => status === 'contradicted') ||
    revision?.report.truthfulness.findings.some(({ status }) => status === 'invalid')
  const partialReview = revision?.report.warnings.some((warning) => warning.includes('unavailable'))

  async function run(name: string, progress: string, values: object) {
    setBusy(progress)
    setError('')
    setFeedback('')
    try {
      const version = await action<Version>(name, { methodId, private: isPrivate, ...values })
      setSelected(version)
      setEdit(undefined)
      if (version.record.approved === 'yes') setFeedback('Approved revision saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request failed. Try again.')
    } finally {
      setBusy('')
    }
  }

  async function copy() {
    setError('')
    setFeedback('')
    try {
      await navigator.clipboard.writeText(text)
      setFeedback('Improved Javadoc copied.')
    } catch {
      setError('Clipboard access failed. Select the comment and copy it manually.')
    }
  }

  return (
    <section className="grid min-w-0 gap-4 border-t border-border pt-4" aria-label="Javadoc improvement">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">Javadoc improvement</h4>
        <button type="button" className={button} disabled={Boolean(busy) || dirty}
          onClick={() => void run('generate-javadoc', 'Generating and evaluating…', {})}>
          Generate Improved Javadoc
        </button>
      </div>
      {busy && <p role="status">{busy}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {active && revision && (
        <>
          {history.records.length > 1 && <label className="grid max-w-sm gap-1 text-sm">Revision history
            <select className={button} value={active.revisionId} disabled={Boolean(busy) || dirty} onChange={(event) => {
              const row = history.records.find(({ recordId }) => recordId === event.target.value)
              if (!row) return
              setSelected({ revisionId: row.recordId, record: row.data })
              setEdit(undefined)
              setError('')
              setFeedback('')
            }}>
              {selected && !history.records.some(({ recordId }) => recordId === selected.revisionId) &&
                <option value={selected.revisionId}>Current revision</option>}
              {history.records.map(({ recordId, createdAt, data }) =>
                <option key={recordId} value={recordId}>
                  {new Date(createdAt).toLocaleString()} · {data.approved === 'yes' ? 'Approved' : 'Draft'}
                </option>)}
            </select>
          </label>}
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <div className="grid min-w-0 content-start gap-1">
              <h5 className="text-sm font-medium">Original Javadoc</h5>
              <pre className="min-h-32 whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
                {revision.originalJavadoc || 'No original Javadoc.'}
              </pre>
            </div>
            <label className="grid min-w-0 gap-1 text-sm font-medium">Improved Javadoc
              <textarea rows={9} maxLength={10000} className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
                value={text} disabled={Boolean(busy)} onChange={(event) => { setEdit(event.target.value); setFeedback('') }} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} disabled={Boolean(busy) || (!dirty && !partialReview) || !text.trim()}
              onClick={() => void run('evaluate-javadoc-revision', 'Evaluating revision…', { revisionId: active.revisionId, javadoc: text })}>
              Re-evaluate revision
            </button>
            {dirty && <button type="button" className={button} disabled={Boolean(busy)} onClick={() => setEdit(undefined)}>Discard edits</button>}
            <button type="button" className={button} disabled={Boolean(busy) || dirty || Boolean(blocking) || approved === 'yes'}
              onClick={() => void run('approve-javadoc-revision', 'Saving approval…', { revisionId: active.revisionId })}>
              {approved === 'yes' ? 'Approved and saved' : 'Approve and save'}
            </button>
            <button type="button" className={button} disabled={Boolean(busy) || dirty || Boolean(blocking)} onClick={() => void copy()}>Copy Javadoc</button>
          </div>
          {dirty && <p className="text-sm text-muted-foreground">Re-evaluate your edits before approving or copying this revision.</p>}
          {blocking && <p className="text-sm text-muted-foreground">Resolve contradicted claims or invalid references before approving.</p>}
          {partialReview && <p className="text-sm text-muted-foreground">AI review is incomplete. Inspect the remaining findings before approving.</p>}
          <ScoreComparison original={revision.originalReport} improved={revision.report} />
          <details open className="grid gap-2 rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Improved Javadoc findings</summary>
            <div className="mt-3"><EvaluationFindings report={revision.report} /></div>
          </details>
        </>
      )}
    </section>
  )
}

function ScoreComparison({ original, improved }: { original: RepairRecord['revision']['report']; improved: RepairRecord['revision']['report'] }) {
  const metrics = [
    { label: 'Completeness', before: original.completeness.score, after: improved.completeness.score, format: percent },
    { label: 'Helpfulness', before: original.helpfulness.score, after: improved.helpfulness.score, format: helpfulness },
    { label: 'Truthfulness', before: original.truthfulness.score, after: improved.truthfulness.score, format: percent },
    { label: 'Behavioral correctness', before: original.behavior.score, after: improved.behavior.score, format: percent },
  ]
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-2 text-left font-semibold">Score comparison</caption>
      <thead className="border-b border-border"><tr><th scope="col">Metric</th><th scope="col">Original</th><th scope="col">Improved</th><th scope="col">Change</th></tr></thead>
      <tbody>{metrics.map(({ label, before, after, format }) => {
        const points = label === 'Helpfulness'
        const change = before === null || after === null ? null : points
          ? Math.round((after - before) * 10) / 10 : Math.round(after * 100) - Math.round(before * 100)
        return <tr key={label} className="border-b border-border">
          <th scope="row" className="py-2 font-medium">{label}</th><td>{format(before)}</td><td>{format(after)}</td>
          <td>{change === null ? '—' : `${change > 0 ? '+' : ''}${change}${points ? '' : ' pp'}`}</td>
        </tr>
      })}</tbody>
    </table>
  )
}
