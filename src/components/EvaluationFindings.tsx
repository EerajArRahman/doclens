import type { Evaluation } from '../evaluation/judge'

import { formatScore } from './evaluation-scores'

export function EvaluationFindings({ report }: { report: Evaluation }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 text-sm [overflow-wrap:anywhere]">
      {report.warnings.map((warning) => <p key={warning} role="status">{warning}</p>)}
      <div>
        <h4 className="font-medium">Completeness · {formatScore('percent', report.completeness.score)}</h4>
        {report.completeness.score === null && <p>Inherited Javadoc was unavailable for the missing checks.</p>}
        <ul>{report.completeness.checks.map((check) => <li key={check.label}>{check.label} · {check.present ? 'Present' : 'Missing locally'}</li>)}</ul>
      </div>
      <div>
        <h4 className="font-medium">Helpfulness · {formatScore('helpfulness', report.helpfulness.score)}</h4>
        <p>{report.helpfulness.explanation}</p>
      </div>
      <div>
        <h4 className="font-medium">Truthfulness · {formatScore('percent', report.truthfulness.score)}</h4>
        {report.truthfulness.findings.length ? <ul className="break-words">{report.truthfulness.findings.map((finding) => (
          <li key={finding.reference}><code>{finding.reference}</code> · {finding.status}. {finding.explanation}</li>
        ))}</ul> : <p>No verifiable entity references were identified.</p>}
      </div>
      <div>
        <h4 className="font-medium">Behavioral correctness · {formatScore('percent', report.behavior.score)}</h4>
        {report.behavior.claims.length ? <ul className="mt-2 space-y-3">{report.behavior.claims.map((claim, index) => (
          <li key={index} className="rounded-md border border-border p-3">
            <p className="break-words"><strong className="capitalize">{claim.status}</strong> · {claim.quote}</p>
            <p>{claim.explanation}</p>
            {claim.evidence.map((item, position) => (
              <div key={position} className="mt-2 min-w-0">
                <p className="break-words text-xs text-muted-foreground">{item.source} · line {item.line}</p>
                <pre className="max-w-full overflow-x-auto rounded bg-muted p-2 text-xs"><code>{item.quote}</code></pre>
              </div>
            ))}
          </li>
        ))}</ul> : <p>No behavioral findings available.</p>}
      </div>
    </div>
  )
}
