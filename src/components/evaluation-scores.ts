type ScoreScale = 'percent' | 'helpfulness'

function roundedUnits(scale: ScoreScale, score: number) {
  return scale === 'percent' ? Math.round(score * 100) : Math.round(Number(score.toFixed(1)) * 10)
}

export function formatScore(scale: ScoreScale, score: number | null) {
  if (score === null) return 'Not scored'
  const units = roundedUnits(scale, score)
  return scale === 'percent' ? `${units}%` : `${(units / 10).toFixed(1)}/5`
}

export function formatScoreChange(scale: ScoreScale, before: number | null, after: number | null) {
  if (before === null || after === null) return '—'
  const change = roundedUnits(scale, after) - roundedUnits(scale, before)
  const signed = change > 0 ? '+' : ''
  return scale === 'percent' ? `${signed}${change} pp` : `${signed}${(change / 10).toFixed(1)}`
}
