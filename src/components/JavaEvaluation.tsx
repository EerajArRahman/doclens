import { useState, type FormEvent } from 'react'
import { useQuery } from 'deepspace'
import { action } from '../lib/java-action'
import { EvaluationFindings } from './EvaluationFindings'
import { JavadocRepair } from './JavadocRepair'
import type { Evaluation } from '../evaluation/judge'

const control = 'rounded-md border border-border bg-background px-3 py-2'
const button = 'rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60'

export function JavaInput({ onSave }: { onSave: (projectId: string) => void }) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setBusy(true)
    setError('')
    try {
      const name = fields.get('name')
      const file = fields.get('jsonl')
      if (mode === 'upload' && (!(file instanceof File) || !file.size || file.size > 2_000_000)) {
        throw new Error('Select an uncompressed JSONL file up to 2 MB.')
      }
      const result = await action<{ projectId: string }>('save-java-input', mode === 'upload'
        ? { kind: mode, name, jsonl: await (file as File).text() }
        : { kind: mode, name, code: fields.get('code'), javadoc: fields.get('javadoc') })
      form.reset()
      onSave(result.projectId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the project.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="mb-6 rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Add private Java input</summary>
      <form className="mt-4 grid gap-3 text-sm" onSubmit={submit}>
        <fieldset className="grid gap-3 disabled:opacity-60" disabled={busy}>
          <label className="grid gap-1">Input type
            <select className={control} value={mode} onChange={(event) => {
              setMode(event.target.value === 'paste' ? 'paste' : 'upload')
              setError('')
            }}>
              <option value="upload">CoCoMUT JSONL</option>
              <option value="paste">Pasted method</option>
            </select>
          </label>
          <label className="grid gap-1">Project name<input name="name" className={control} required maxLength={120} /></label>
          {mode === 'upload' ? (
            <label className="grid gap-1">CoCoMUT file (up to 100 methods and 2 MB)
              <input name="jsonl" className={control} type="file" accept=".jsonl,application/x-ndjson" required />
            </label>
          ) : (
            <>
              <label className="grid gap-1">Java method
                <textarea name="code" className={`${control} font-mono`} rows={6} required maxLength={16000} />
              </label>
              <label className="grid gap-1">Javadoc (optional)
                <textarea name="javadoc" className={`${control} font-mono`} rows={5} maxLength={10000} />
              </label>
            </>
          )}
          <button className={`${button} justify-self-start`} type="submit">{busy ? 'Saving…' : 'Save private project'}</button>
        </fieldset>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </form>
    </details>
  )
}

export function MethodEvaluation({ methodId, isPrivate }: { methodId: string; isPrivate: boolean }) {
  const saved = useQuery<{ report: Evaluation }>('evaluations', { where: { methodId }, orderBy: 'createdAt', orderDir: 'desc', limit: 1 })
  const [fresh, setFresh] = useState<Evaluation>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const report = fresh ?? saved.records[0]?.data.report
  async function run() {
    setBusy(true)
    setError('')
    try {
      setFresh(await action<Evaluation>('evaluate-java', { methodId, private: isPrivate }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evaluation failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5" aria-label="Documentation evaluation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Documentation evaluation</h3>
        <button type="button" className={button} onClick={run} disabled={busy}>
          {busy ? 'Evaluating…' : report?.warnings.some((warning) => warning.includes('unavailable')) ? 'Retry evaluation' : 'Evaluate'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Evaluation sends Javadoc and available code context to DeepSpace AI integrations and uses your account credits.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {report && <>
        <EvaluationFindings report={report} />
        <JavadocRepair methodId={methodId} isPrivate={isPrivate} />
      </>}
    </section>
  )
}
