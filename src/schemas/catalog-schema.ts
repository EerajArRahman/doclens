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

const privatePermissions = {
  '*': { read: 'own', create: false, update: false, delete: false },
} as const

export const privateProjectsSchema: CollectionSchema = {
  name: 'private_projects',
  columns: [{ name: 'name', storage: 'text', interpretation: 'plain' }],
  permissions: privatePermissions,
}

export const privateMethodsSchema: CollectionSchema = {
  ...methodsSchema,
  name: 'private_methods',
  columns: [...methodsSchema.columns, { name: 'inputKind', storage: 'text', interpretation: 'plain' }],
  permissions: privatePermissions,
}

export const evaluationsSchema: CollectionSchema = {
  name: 'evaluations',
  columns: [
    { name: 'methodId', storage: 'text', interpretation: 'plain' },
    { name: 'report', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: privatePermissions,
}
