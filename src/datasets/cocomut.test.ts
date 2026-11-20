import { describe, expect, it, vi } from 'vitest'
import { importCoCoMUT, parseCoCoMUT } from './cocomut'
import project from './dbutils/project.json'
import jsonl from './dbutils/method-contexts.jsonl?raw'

const [firstRow] = jsonl.split('\n')

describe('CoCoMUT importer', () => {
  it('preserves the 18 documented methods, overloads, and extracted context', async () => {
    const { methods } = await parseCoCoMUT(project, jsonl)
    const original = JSON.parse(firstRow)
    expect(methods).toHaveLength(18)
    expect(new Set(methods.map(({ id }) => id)).size).toBe(18)
    expect(methods.every(({ data }) => data.javadoc.trim())).toBe(true)
    expect(methods.filter(({ data }) => data.qualifiedName.endsWith('.DbUtils.close'))).toHaveLength(2)
    expect(methods[0].data).toMatchObject({
      code: original.MUT.code,
      javadoc: original.MUT.javadoc,
      sourceUrl: expect.stringContaining(`${project.revision}/src/main/java/`),
      context: {
        provenance: original.provenance,
        schemaVersion: '0.4.0',
        callers: expect.arrayContaining([expect.objectContaining({ kind: 'project_method' })]),
        callees: expect.any(Array),
      },
    })
  })

  it('rejects malformed or duplicate rows before touching records', async () => {
    const write = vi.fn(async () => ({ success: true }))
    await expect(importCoCoMUT(project, `${firstRow}\n\n{`, write)).rejects.toThrow('JSONL line 3')
    await expect(importCoCoMUT(project, `${firstRow}\n${firstRow}`, write)).rejects.toThrow('Duplicate method URI')
    const row = JSON.parse(firstRow)
    row.MUT.parameters[0].type = null
    await expect(importCoCoMUT(project, JSON.stringify(row), write)).rejects.toThrow('MUT.parameters.0.type')
    expect(write).not.toHaveBeenCalled()
  })

  it('can retry an interrupted batch with the same project and method IDs', async () => {
    const records = new Map()
    const write = vi.fn(async (collection: string, data: Record<string, unknown>, id: string): Promise<{ success: boolean; error?: string }> => {
      records.set(id, { collection, data })
      return { success: true }
    }).mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'Write interrupted' })

    await expect(importCoCoMUT(project, jsonl, write)).rejects.toThrow('Write interrupted')
    const firstProjectId = write.mock.calls[0][2]
    const firstMethodId = write.mock.calls[1][2]
    const imported = await importCoCoMUT(project, jsonl, write)
    expect(imported).toEqual({ projectId: firstProjectId, methodCount: 18 })
    expect(records.get(firstMethodId)?.data.projectId).toBe(firstProjectId)
    await importCoCoMUT(project, jsonl, write)
    expect(records.size).toBe(19)
  })
})
