import { describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { pastedMethod } from './java'
import { evaluate } from './judge'
import { generateJavadoc, hasBlockingFindings, javadocComment } from './repair'

const method = pastedMethod('project', 'int twice(int value) { return value * 2; }', '')
const comment = '/** Returns twice the value.\n * @param value the number to double\n * @return the doubled value\n */'
const successful = (text: string, reason = 'end_turn') => ({ success: true, data: {
  stop_reason: reason, content: [{ type: 'text', text }],
} })

describe('Javadoc repair', () => {
  it('sends source, context, and existing findings to Anthropic and returns a valid comment', async () => {
    const integration = vi.fn(async () => successful(comment))
    const report = await evaluate(method, integration as ActionTools['integration'])
    const related = [{ label: 'Dependency', code: 'int factor() { return 2; }' }]
    expect(await generateJavadoc(method, report, integration as ActionTools['integration'], related)).toBe(comment)
    expect(integration).toHaveBeenCalledWith('anthropic/chat-completion', expect.objectContaining({
      messages: [expect.objectContaining({ content: expect.stringContaining(related[0].code) })],
    }))
    expect(method.javadoc).toBe('')
    expect(hasBlockingFindings(report)).toBe(false)
  })

  it('rejects Java code outside the comment, escaped delimiters, and truncated provider output', async () => {
    expect(javadocComment.safeParse('/** Comment */ int changed() {}').success).toBe(false)
    expect(javadocComment.safeParse('/** Comment \\u002a/ text */').success).toBe(false)
    expect(javadocComment.safeParse('/** */').success).toBe(false)
    const original = await evaluate(method, vi.fn())
    const truncated = vi.fn(async () => successful(comment, 'max_tokens'))
    await expect(generateJavadoc(method, original, truncated as ActionTools['integration'], [])).rejects.toThrow('incomplete or invalid')
  })

  it('reports credit exhaustion and blocks approval for demonstrated contradictions and invalid references', async () => {
    const original = await evaluate(method, vi.fn())
    const noCredits = vi.fn(async () => ({ success: false, error: 'Insufficient credits', status: 402 }))
    await expect(generateJavadoc(method, original, noCredits as ActionTools['integration'], [])).rejects.toThrow('insufficient DeepSpace credits')
    expect(hasBlockingFindings({ ...original, truthfulness: { score: 0, findings: [
      { reference: '@param missing', status: 'invalid', explanation: 'Unknown parameter' },
    ] } })).toBe(true)
    expect(hasBlockingFindings({ ...original, behavior: { score: 0, claims: [
      { status: 'contradicted', quote: 'Triples the input', explanation: 'It doubles', evidence: [] },
    ] } })).toBe(true)
  })
})
