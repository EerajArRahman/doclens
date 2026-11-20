import type { CollectionSchema } from 'deepspace/schema'

const permissions = {
  '*': { read: true, create: false, update: false, delete: false },
}

export const projectsSchema: CollectionSchema = {
  name: 'projects',
  columns: ['name', 'repository', 'revision', 'license', 'licenseUrl', 'artifactUrl', 'citationUrl']
    .map((name) => ({ name, storage: 'text', interpretation: 'plain' })),
  permissions,
}

export const methodsSchema: CollectionSchema = {
  name: 'methods',
  columns: [
    ...['projectId', 'uri', 'signature', 'qualifiedName', 'sourceUrl', 'code', 'javadoc', 'returnType']
      .map((name) => ({ name, storage: 'text' as const, interpretation: 'plain' })),
    { name: 'context', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions,
}
