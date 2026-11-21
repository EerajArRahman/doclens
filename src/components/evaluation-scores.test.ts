import { expect, it } from 'vitest'
import { formatScore, formatScoreChange } from './evaluation-scores'

it('computes deltas from the values shown in the comparison', () => {
  expect(formatScore('percent', 1 / 3)).toBe('33%')
  expect(formatScore('percent', 2 / 3)).toBe('67%')
  expect(formatScoreChange('percent', 1 / 3, 2 / 3)).toBe('+34 pp')
  expect(formatScore('helpfulness', 3.04)).toBe('3.0/5')
  expect(formatScore('helpfulness', 3.06)).toBe('3.1/5')
  expect(formatScoreChange('helpfulness', 3.04, 3.06)).toBe('+0.1')
  expect(formatScoreChange('helpfulness', 3.06, 3.04)).toBe('-0.1')
  expect(formatScoreChange('helpfulness', 3.06, 3.13)).toBe('0.0')
  expect(formatScoreChange('percent', null, 1)).toBe('—')
})
