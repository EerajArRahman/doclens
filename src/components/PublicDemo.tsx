import { EvaluationFindings } from './EvaluationFindings'

const source = 'public int doubleValue(int value) { return value * 2; }'
const original = '/** Returns three times the input.\n * @param number input\n */'
const repair = '/** Returns twice the input using Java int arithmetic.\n * @param value the integer to double\n * @return twice the supplied value, with Java int overflow semantics\n */'

export function PublicDemo() {
  return (
    <section id="public-demo" aria-labelledby="public-demo-title" tabIndex={-1} className="grid w-full max-w-3xl scroll-mt-4 grid-cols-1 gap-5 rounded-lg border border-border p-5 text-left sm:p-8">
      <div>
        <h2 id="public-demo-title" className="text-2xl font-semibold">Public demo report</h2>
        <p className="mt-2 text-sm text-muted-foreground">Saved example with manually verified findings. No account or credits required.</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <h3 className="font-semibold">Java source and original Javadoc</h3>
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs"><code>{original}{'\n'}{source}</code></pre>
        <EvaluationFindings report={{
          completeness: { score: 1 / 3, checks: [
            { label: 'Summary', present: true },
            { label: '@param value', present: false },
            { label: '@return', present: false },
          ] },
          helpfulness: { score: null, model: undefined, explanation: 'This example uses manual behavioral review and local structure and reference checks.' },
          truthfulness: { score: 0, findings: [
            { reference: '@param number', status: 'invalid', explanation: 'The declared parameter is value.' },
          ] },
          behavior: { score: 0, claims: [{
            quote: 'Returns three times the input.',
            status: 'contradicted',
            explanation: 'The implementation multiplies by two.',
            evidence: [{ source: 'Focal method', line: 1, quote: 'return value * 2;' }],
          }] },
          warnings: [],
        }} />
      </div>
      <div className="grid grid-cols-1 gap-3">
        <h3 className="font-semibold">Reviewed repair example</h3>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs"><code>{repair}</code></pre>
        <p className="text-sm">The repair documents the parameter and return value, and describes the multiplication and overflow behavior. Completeness rises from 33% to 100%.</p>
      </div>
    </section>
  )
}
