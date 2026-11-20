import type { Method } from '../datasets/cocomut'

const simpleName = (name: string) => name.split('.').at(-1) ?? name

function docParts(javadoc: string) {
  const text = javadoc.trim().replace(/^\/\*\*|\*\/$/g, '')
    .replace(/^\s*\* ?/gm, '')
  const tags = [...text.matchAll(/(?:^|\n)\s*@(\w+)\b([^]*?)(?=\n\s*@\w+|$)/g)]
  return { summary: text.slice(0, tags[0]?.index ?? text.length).trim(), tags }
}

export function completeness(method: Method) {
  const { summary, tags } = docParts(method.javadoc)
  const meaningful = (value: string) => Boolean(value.replace(/\{@inheritDoc\}|<[^>]+>/gi, '').trim())
  const entries = tags.map(([, kind, value]) => {
    const [name, ...description] = value.trim().split(/\s+/)
    return { kind, name, value, description: description.join(' ') }
  })
  const checks = [{ label: 'Summary', present: meaningful(summary) }]
  for (const name of [...method.context.parameters.map((param) => param.name),
    ...(method.context.typeParameters ?? []).map((param) => `<${param}>`)]) {
    checks.push({ label: `@param ${name}`, present: entries.some((entry) =>
      entry.kind === 'param' && entry.name === name && meaningful(entry.description)) })
  }
  if (method.returnType && method.returnType !== 'void') {
    checks.push({ label: '@return', present: entries.some((entry) => entry.kind === 'return' && meaningful(entry.value)) ||
      /^\{@return\s+[^}]+\}/.test(summary) })
  }
  for (const name of method.context.exceptions) {
    checks.push({ label: `@throws ${name}`, present: entries.some((entry) =>
      ['throws', 'exception'].includes(entry.kind) && (entry.name === name || entry.name === simpleName(name)) &&
      meaningful(entry.description)) })
  }
  return { checks, score: /\{@inheritDoc\}/i.test(method.javadoc) && checks.some((check) => !check.present)
    ? null : checks.filter((check) => check.present).length / checks.length }
}

export function truthfulness(method: Method, extraReferences: string[]) {
  const { tags } = docParts(method.javadoc)
  const params = new Set([...method.context.parameters.map(({ name }) => name),
    ...(method.context.typeParameters ?? []).map((name) => `<${name}>`)])
  const findings = tags.flatMap(([, kind, value]) => {
    if (kind !== 'param') return []
    const name = value.trim().split(/\s+/)[0]
    const status = params.has(name) ? 'confirmed' : name.startsWith('<') && !method.context.typeParameters ? 'unresolved' : 'invalid'
    return [{ reference: `@param ${name}`, status, explanation: status === 'confirmed'
      ? 'Declared in the method signature.' : status === 'invalid' ? 'Absent from the method signature.' : 'Type-parameter metadata is unavailable.' }]
  })
  const links = [...method.javadoc.matchAll(/\{@link(?:plain)?\s+([^}\n]+)\}/g)].map(([, value]) => value)
  links.push(...tags.filter(([, kind]) => kind === 'see' || kind === 'throws' || kind === 'exception').map(([, , value]) => value.trim()))
  const refs = new Set([...links.filter((value) => !/^["<]|^https?:/.test(value))
    .map((value) => value.match(/^[\w$.#]+(?:\([^)]*\))?/)?.[0]).filter(Boolean),
    ...extraReferences.filter((value) => /^[\w$.#]+(?:\([^)]*\))?$/.test(value))])
  const types = [method.returnType, ...method.context.parameters.map(({ type }) => type), ...method.context.exceptions]
  const members = [method.uri, ...(method.context.declarations ?? []),
    ...[...method.context.callers, ...method.context.callees].flatMap((edge) => [edge.method_uri, edge.target_uri])]
    .filter((value): value is string => Boolean(value))
  for (const reference of refs) {
    if (!reference) continue
    const canonical = reference.replace(/\s+/g, '')
    const confirmed = (method.context.resolvedReferences ?? []).some((target) => target.replace(/\s+/g, '') === canonical) ||
      params.has(reference) || types.some((type) => type === reference || simpleName(type) === reference) ||
      members.some((member) => {
        const symbol = member.split('.java#').at(-1) ?? member
        const qualified = symbol.split('(')[0]
        const signature = symbol.match(/\([^)]*\)/)?.[0] ?? ''
        const name = simpleName(qualified)
        const owner = qualified.slice(0, -(name.length + 1))
        return [symbol, qualified, `${qualified}${signature}`, `${owner}#${name}${signature}`,
          `${simpleName(owner)}#${name}${signature}`,
          ...(owner && method.qualifiedName.startsWith(owner + '.') ? [`#${name}`, `#${name}${signature}`] : [])]
          .some((candidate) => candidate.replace(/\s+/g, '') === canonical)
      })
    findings.push({ reference, status: confirmed ? 'confirmed' : 'unresolved',
      explanation: confirmed ? 'Matched a declaration or extracted call target.' : 'Available context does not establish this reference.' })
  }
  const unique = findings.filter((finding, index) => findings.findIndex((other) => other.reference === finding.reference) === index)
  return { findings: unique, score: unique.length && unique.every((item) => item.status !== 'unresolved')
    ? unique.filter((item) => item.status === 'confirmed').length / unique.length : null }
}
