import { z } from 'zod'
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { evaluate } from '../evaluation/judge'
import { generateJavadoc, hasBlockingFindings, javadocComment, RepairError, type RepairRecord } from '../evaluation/repair'
import { checked, latestEvaluation, methodTarget, relatedSources, visibleMethod } from './private-catalog'

const repairTarget = methodTarget.extend({ revisionId: z.uuid() })
const editedTarget = repairTarget.extend({ javadoc: javadocComment })
type Handler = ActionHandler<Env>

async function ownedRevision(tools: ActionTools, userId: string, methodId: string, revisionId: string) {
  const result = await tools.get<RepairRecord>('javadoc_repairs', revisionId)
  if (!result.success || result.data.record?.createdBy !== userId || result.data.record.data.methodId !== methodId) return null
  return result.data.record.data
}

async function saveRevision(tools: ActionTools, record: RepairRecord) {
  const revisionId = crypto.randomUUID()
  checked(await tools.create('javadoc_repairs', record, revisionId))
  return { revisionId, record }
}

const missing = { success: false, code: 'not_found', error: 'Method or revision unavailable.' } as const

function failure(cause: unknown) {
  if (cause instanceof RepairError) return { success: false, error: cause.message } as const
  return { success: false, error: 'The Javadoc revision could not be processed. Try again.' } as const
}

export const repairActions: Record<string, Handler> = {
  async 'generate-javadoc'({ params, userId, tools }) {
    const input = methodTarget.safeParse(params)
    if (!input.success) return missing
    const { methodId, private: isPrivate } = input.data
    const method = await visibleMethod(tools, userId, methodId, isPrivate)
    if (!method) return missing
    try {
      const original = await latestEvaluation(tools, userId, methodId)
      if (!original) return { success: false, error: 'Evaluate the original Javadoc first.' }
      const related = await relatedSources(tools, userId, method, isPrivate)
      const javadoc = await generateJavadoc(method, original.data.report, tools.integration, related)
      const report = await evaluate({ ...method, javadoc }, tools.integration, related)
      const data = await saveRevision(tools, { methodId, approved: 'no', revision: {
        javadoc, originalJavadoc: method.javadoc, originalEvaluationId: original.recordId, originalReport: original.data.report, report,
      } })
      return { success: true, data }
    } catch (cause) {
      return failure(cause)
    }
  },
  async 'evaluate-javadoc-revision'({ params, userId, tools }) {
    const input = editedTarget.safeParse(params)
    if (!input.success) return { success: false, error: input.error.issues[0].message }
    const { methodId, private: isPrivate, revisionId, javadoc } = input.data
    const method = await visibleMethod(tools, userId, methodId, isPrivate)
    const prior = await ownedRevision(tools, userId, methodId, revisionId)
    if (!method || !prior) return missing
    try {
      const related = await relatedSources(tools, userId, method, isPrivate)
      const report = await evaluate({ ...method, javadoc }, tools.integration, related)
      const data = await saveRevision(tools, { methodId, approved: 'no',
        revision: { ...prior.revision, parentId: revisionId, javadoc, report },
      })
      return { success: true, data }
    } catch (cause) {
      return failure(cause)
    }
  },
  async 'approve-javadoc-revision'({ params, userId, tools }) {
    const input = repairTarget.safeParse(params)
    if (!input.success) return missing
    const { methodId, private: isPrivate, revisionId } = input.data
    const method = await visibleMethod(tools, userId, methodId, isPrivate)
    const record = await ownedRevision(tools, userId, methodId, revisionId)
    if (!method || !record) return missing
    if (hasBlockingFindings(record.revision.report)) {
      return { success: false, error: 'Correct the contradicted claims or invalid references and re-evaluate before approving.' }
    }
    try {
      if (record.approved !== 'yes') checked(await tools.update('javadoc_repairs', revisionId, { approved: 'yes' }))
      return { success: true, data: { revisionId, record: { ...record, approved: 'yes' } } }
    } catch (cause) {
      return failure(cause)
    }
  },
}
