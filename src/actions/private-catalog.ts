import { z } from 'zod'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { parseMethods, type Method } from '../datasets/cocomut'
import { pastedMethod } from '../evaluation/java'
import { evaluate, type Evaluation } from '../evaluation/judge'

const draft = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upload'), name: z.string().trim().min(1).max(120),
    jsonl: z.string().min(1).max(2_000_000) }),
  z.object({ kind: z.literal('paste'), name: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(16_000), javadoc: z.string().trim().max(10_000) }),
])
const target = z.object({
  methodId: z.string().regex(/^method_[a-f0-9]{64}$|^[a-f0-9-]{36}$/),
  private: z.boolean(),
})

function checked<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}

async function visibleMethod(tools: ActionTools, userId: string, methodId: string, isPrivate: boolean) {
  const result = await tools.get<Method>(isPrivate ? 'private_methods' : 'methods', methodId)
  if (!result.success || !result.data.record || (isPrivate && result.data.record.createdBy !== userId)) return null
  return result.data.record.data
}

export const privateCatalogActions: Record<string, ActionHandler<Env>> = {
  async 'save-java-input'({ params, tools }) {
    const input = draft.safeParse(params)
    if (!input.success) return { success: false, error: 'Enter a project name and valid Java input within the displayed limits.' }
    const projectId = crypto.randomUUID()
    const value = input.data
    let methods: { id: string; data: Method }[]
    try {
      methods = value.kind === 'upload'
        ? (await parseMethods(projectId, value.jsonl)).map(({ id, data }) => ({ id, data: { ...data, inputKind: 'upload' } }))
        : [{ id: crypto.randomUUID(), data: pastedMethod(projectId, value.code, value.javadoc) }]
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }

    // Publish the project to its owner only after all methods have been saved.
    try {
      for (const item of methods) checked(await tools.create('private_methods', item.data, item.id))
      checked(await tools.create('private_projects', { name: value.name }, projectId))
      return { success: true, data: { projectId, methodCount: methods.length, firstMethodId: methods[0].id } }
    } catch {
      await tools.deleteWhere('private_methods', { projectId }).catch(() => undefined)
      return { success: false, error: 'Could not save the project. Try again.' }
    }
  },
  async 'evaluate-java'({ params, userId, tools }) {
    const request = target.safeParse(params)
    if (!request.success) return { success: false, error: 'Invalid method selection.' }
    const { methodId, private: isPrivate } = request.data
    const method = await visibleMethod(tools, userId, methodId, isPrivate)
    if (!method) return { success: false, code: 'not_found', error: 'Method unavailable.' }
    const resultId = `evaluation_${userId}_${methodId}`
    const prior = await tools.get<{ report: Evaluation }>('evaluations', resultId)
    if (prior.success && prior.data.record?.createdBy === userId &&
      !prior.data.record.data.report.warnings.some((warning) => warning.includes('unavailable'))) {
      return { success: true, data: prior.data.record.data.report }
    }

    try {
      const targets = new Set(method.context.callees.map((call) => call.method_uri).filter(Boolean))
      const related: { label: string; code: string }[] = []
      if (targets.size) {
        const records = checked(await tools.query<Method>(isPrivate ? 'private_methods' : 'methods', {
          where: { projectId: method.projectId }, limit: 100,
        })).records
        for (const record of records) {
          if ((!isPrivate || record.createdBy === userId) && targets.has(record.data.uri)) {
            related.push({ label: record.data.uri, code: record.data.code })
          }
        }
      }
      const report = await evaluate(method, tools.integration, related)
      checked(await tools.create('evaluations', { methodId, report }, resultId))
      return { success: true, data: report }
    } catch {
      return { success: false, error: 'Could not save the evaluation. Try again.' }
    }
  },
}
