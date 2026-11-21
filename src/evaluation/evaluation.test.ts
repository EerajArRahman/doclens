import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { pastedMethod } from './java'
import { completeness, truthfulness } from './metrics'
import { evaluate } from './judge'

const code = 'public int doubleValue(final int value) { return value * 2; }'
const javadoc = '/** Returns three times the input.\n * @param invented the number\n * @see MissingType#run()\n */'
const method = pastedMethod('project', code, javadoc)

describe('Java documentation evaluation', () => {
  it('checks meaningful summaries, parameters, return values and declared exceptions', () => {
    expect(completeness(method)).toMatchObject({ score: 1 / 3, checks: [
      { label: 'Summary', present: true }, { label: '@param value', present: false }, { label: '@return', present: false },
    ] })
    const generic = pastedMethod('project', 'public <T> T first(Map<String, T> values) throws IOException { return null; }',
      '/** Read a value.\n * @param <T> value type\n * @param values source values\n * @return first value\n * @exception IOException on failure\n */')
    expect(completeness(generic).score).toBe(1)
    expect(completeness({ ...method, javadoc: '/** {@inheritDoc} */' }).score).toBeNull()
    expect(() => pastedMethod('project', 'int one() { return 1; } int two() { return 2; }', '')).toThrow()
    expect(() => pastedMethod('project', code, 'plain text')).toThrow()
  })

  it('distinguishes invalid parameters, unresolved links, and confirmed references', () => {
    const result = truthfulness({ ...method, javadoc: javadoc.replace(' * @see', ' * @param value input\n * @see') }, [])
    expect(result.score).toBeNull()
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: '@param invented', status: 'invalid' }),
      expect.objectContaining({ reference: '@param value', status: 'confirmed' }),
      expect.objectContaining({ reference: 'MissingType#run()', status: 'unresolved' }),
    ]))
  })

  it('keeps exact source evidence and downgrades invented evidence', async () => {
    const integration = vi.fn(async (endpoint: string) => endpoint === 'cloudflare/jev'
      ? { success: true, data: { model: 'jev-test', answers: { helpfulness: { type: 'score', score: 1 } } } }
      : { success: true, data: { choices: [{ message: { content: JSON.stringify({
        references: [], helpfulnessExplanation: 'Missing useful parameter and return guidance.',
        claims: [
          { quote: 'Returns three times the input.', status: 'contradicted', explanation: 'It doubles.', evidence: [{ source: 0, quote: 'return value * 2;' }] },
          { quote: 'the input', status: 'supported', explanation: 'Unsupported evidence.', evidence: [{ source: 0, quote: 'return value * 3;' }] },
        ],
      }) } }] } })
    const report = await evaluate(method, integration as ActionTools['integration'])
    expect(report.helpfulness.score).toBe(2)
    expect(report.behavior.score).toBeNull()
    expect(report.behavior.claims.map((claim) => claim.status)).toEqual(['contradicted', 'unverifiable'])
    expect(report.behavior.claims[0].evidence[0]).toMatchObject({ line: 1, quote: 'return value * 2;' })
  })

  it('preserves deterministic findings when response validation or calls fail', async () => {
    const integration = vi.fn(async (endpoint: string) => {
      if (endpoint === 'cloudflare/jev') throw new Error('Provider down')
      return { success: true, data: { choices: [{ message: { content: '{"claims":[]}' } }] } }
    })
    const report = await evaluate(method, integration as ActionTools['integration'])
    expect(report.warnings).toHaveLength(2)
    expect(report.completeness.score).toBe(1 / 3)
    expect(report.truthfulness.findings.some(({ status }) => status === 'invalid')).toBe(true)
    expect(report.helpfulness.score).toBeNull()
    expect(report.behavior.score).toBeNull()
  })
})

describe('manually checked doubling examples', () => {
  it.each([
    {
      label: 'correct',
      comment: '/** Doubles the input using Java int arithmetic.\n * @param value the integer to double\n * @return the doubled value, with int overflow semantics\n */',
      coverage: 1,
      reference: 'confirmed',
    },
    {
      label: 'incomplete',
      comment: '/** Doubles the input. */',
      coverage: 1 / 3,
      reference: undefined,
    },
    {
      label: 'incorrect',
      comment: '/** Returns three times the input.\n * @param number input\n */',
      coverage: 1 / 3,
      reference: 'invalid',
    },
  ])('checks structure and references for $label documentation', ({ comment, coverage, reference }) => {
    const example = pastedMethod('project', code, comment)
    expect(completeness(example).score).toBe(coverage)
    expect(truthfulness(example, []).findings.map(({ status }) => status)).toEqual(reference ? [reference] : [])
  })
})
