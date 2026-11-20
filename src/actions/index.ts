import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { importCoCoMUT } from '../datasets/cocomut'
import { privateCatalogActions } from './private-catalog'
import { repairActions } from './repair'

export const actions: Record<string, ActionHandler<Env>> = {
  ...privateCatalogActions,
  ...repairActions,
  async 'import-cocomut'({ env, userId, params, tools }) {
    if (userId !== env.OWNER_USER_ID) return { success: false, code: 'forbidden', error: 'App owner required' }
    if (typeof params.jsonl !== 'string') return { success: false, code: 'invalid_input', error: 'Expected a JSONL string' }

    try {
      return { success: true, data: await importCoCoMUT(params.project, params.jsonl, tools.create) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}
