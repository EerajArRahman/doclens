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
export const methodTarget = z.object({
  methodId: z.string().regex(/^method_[a-f0-9]{64}$|^[a-f0-9-]{36}$/),
  private: z.boolean(),
})

export function checked<T>(result: ActionResult<T>): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function visibleMethod(tools: ActionTools, userId: string, methodId: string, isPrivate: boolean) {
  const result = await tools.get<Method>(isPrivate ? 'private_methods' : 'methods', methodId)
  if (!result.success || !result.data.record || (isPrivate && result.data.record.createdBy !== userId)) return null
  return result.data.record.data
}

export async function relatedSources(tools: ActionTools, userId: string, method: Method, isPrivate: boolean) {
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
  return related
}

export async function latestEvaluation(tools: ActionTools, userId: string, methodId: string) {
  const current = checked(await tools.query<{ report: Evaluation }>('evaluations', {
    where: { methodId, ownerId: userId }, orderBy: 'createdAt', orderDir: 'desc', limit: 1,
  })).records[0]
  if (current?.createdBy === userId) return current
  const legacy = await tools.get<{ report: Evaluation }>('evaluations', `evaluation_${userId}_${methodId}`)
  return legacy.success && legacy.data.record?.createdBy === userId ? legacy.data.record : undefined
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
    const request = methodTarget.safeParse(params)
    if (!request.success) return { success: false, error: 'Invalid method selection.' }
    const { methodId, private: isPrivate } = request.data
    const method = await visibleMethod(tools, userId, methodId, isPrivate)
    if (!method) return { success: false, code: 'not_found', error: 'Method unavailable.' }
    try {
      const prior = await latestEvaluation(tools, userId, methodId)
      if (prior && !prior.data.report.warnings.some((warning) => warning.includes('unavailable'))) {
        return { success: true, data: prior.data.report }
      }
      const related = await relatedSources(tools, userId, method, isPrivate)
      const report = await evaluate(method, tools.integration, related)
      checked(await tools.create('evaluations', { methodId, ownerId: userId, report }, crypto.randomUUID()))
      return { success: true, data: report }
    } catch {
      return { success: false, error: 'Could not save the evaluation. Try again.' }
    }
  },
}
