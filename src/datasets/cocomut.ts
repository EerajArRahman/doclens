import { z } from 'zod'

const label = z.string().trim().min(1).max(2000)
const httpsUrl = z.url({ protocol: /^https$/ })
const repository = httpsUrl.refine((value) => {
  const url = new URL(value)
  return url.host === 'github.com' && /^\/[\w.-]+\/[\w.-]+$/.test(url.pathname) &&
    !url.search && !url.hash && !url.username && !url.password
}, 'Expected a GitHub repository URL without a trailing slash')

export const projectSchema = z.object({
  name: label,
  repository,
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  license: label,
  licenseUrl: httpsUrl,
  artifactUrl: httpsUrl,
  citationUrl: httpsUrl,
})

export type Project = z.infer<typeof projectSchema>

const edge = z.object({
  kind: label,
  method_uri: z.string().optional().nullable(),
  target_uri: z.string().optional().nullable(),
  raw_signature: z.string().optional().nullable(),
  signature: z.string().optional().nullable(),
  method_name: z.string().optional().nullable(),
  resolution: z.string().optional().nullable(),
  unresolved_reason: z.string().optional().nullable(),
}).refine((value) => value.method_uri || value.target_uri || value.raw_signature ||
  value.signature || value.method_name, 'Missing call target')

const rowSchema = z.object({
  MUT: z.object({
    method_uri: label.regex(/^[^#]+\.java#[^#]+$/),
    signature: label,
    qualified_name: label,
    line_number: z.number().int().positive().optional(),
    code: z.string().min(1).max(100_000),
    javadoc: z.string().max(100_000),
    return_type: z.string(),
    parameters: z.array(z.object({ name: label, type: label })),
    throws: z.array(label).default([]),
  }),
  callers: z.array(edge).default([]),
  callees: z.array(edge).default([]),
  metadata: z.object({
    schema_version: z.enum(['0.4.0', '0.5.0']),
    call_graph: z.object({
      available: z.boolean(),
      method_matched: z.boolean(),
      algorithm: z.string().optional(),
    }).optional(),
  }),
  provenance: z.record(z.string(), z.unknown()),
})

export type Method = {
  projectId: string
  uri: string
  signature: string
  qualifiedName: string
  sourceUrl: string
  code: string
  javadoc: string
  returnType: string
  context: {
    parameters: z.infer<typeof rowSchema>['MUT']['parameters']
    exceptions: string[]
    callers: z.infer<typeof edge>[]
    callees: z.infer<typeof edge>[]
    schemaVersion: string
    callGraph?: z.infer<typeof rowSchema>['metadata']['call_graph']
    provenance: Record<string, unknown>
  }
}

type CatalogRecord<T> = { id: string; data: T }

async function recordId(kind: string, parts: string[]) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)))
  return kind + '_' + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function parseCoCoMUT(projectInput: unknown, jsonl: string) {
  const project = projectSchema.parse(projectInput)
  if (jsonl.length > 2_000_000) throw new Error('JSONL exceeds 2 million characters')

  const projectId = await recordId('project', [project.repository.toLowerCase(), project.revision, project.artifactUrl])
  const seen = new Set<string>()
  const methods: CatalogRecord<Method>[] = []

  for (const [index, line] of jsonl.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try {
      if (methods.length === 100) throw new Error('Import at most 100 methods per batch')
      if (line.length > 200_000) throw new Error('Record exceeds 200,000 characters')

      const row = rowSchema.parse(JSON.parse(line))
      const method = row.MUT
      if (seen.has(method.method_uri)) throw new Error('Duplicate method URI')
      seen.add(method.method_uri)

      const path = method.method_uri.split('#')[0].split('/')
      if (path.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
        throw new Error('Method URI must start with a repository-relative Java path')
      }
      const anchor = method.line_number ? `#L${method.line_number}` : ''

      methods.push({
        id: await recordId('method', [projectId, method.method_uri]),
        data: {
          projectId,
          uri: method.method_uri,
          signature: method.signature,
          qualifiedName: method.qualified_name,
          sourceUrl: `${project.repository}/blob/${project.revision}/${path.map(encodeURIComponent).join('/')}${anchor}`,
          code: method.code,
          javadoc: method.javadoc,
          returnType: method.return_type,
          context: {
            parameters: method.parameters,
            exceptions: method.throws,
            callers: row.callers,
            callees: row.callees,
            schemaVersion: row.metadata.schema_version,
            callGraph: row.metadata.call_graph,
            provenance: row.provenance,
          },
        },
      })
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        : (error as Error).message
      throw new Error(`JSONL line ${index + 1}: ${message}`)
    }
  }

  if (!methods.length) throw new Error('JSONL contains no method records')
  return { project: { id: projectId, data: project }, methods }
}

type CatalogWriter = (
  collection: string,
  data: Record<string, unknown>,
  id: string,
) => Promise<{ success: boolean; error?: string }>

export async function importCoCoMUT(project: unknown, jsonl: string, write: CatalogWriter) {
  const batch = await parseCoCoMUT(project, jsonl)
  const result = await write('projects', batch.project.data, batch.project.id)
  if (!result.success) throw new Error(result.error ?? 'Project write failed')

  for (const method of batch.methods) {
    const result = await write('methods', method.data, method.id)
    if (!result.success) throw new Error(result.error ?? 'Method write failed')
  }
  return { projectId: batch.project.id, methodCount: batch.methods.length }
}
