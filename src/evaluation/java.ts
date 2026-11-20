import type { Method } from '../datasets/cocomut'

const identifier = '[A-Za-z_$][\\w$]*'

function splitTypes(value: string) {
  let depth = 0
  let start = 0
  const parts: string[] = []
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '<') depth++
    if (value[index] === '>') depth--
    if (depth < 0) throw new Error('Unbalanced generic type')
    if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  if (depth) throw new Error('Unbalanced generic type')
  if (value.trim()) parts.push(value.slice(start).trim())
  return parts
}

function genericPrefixLength(prefix: string) {
  if (!prefix.startsWith('<')) return 0
  let depth = 0
  for (let index = 0; index < prefix.length; index++) {
    if (prefix[index] === '<') depth++
    if (prefix[index] === '>' && --depth === 0) return index + 1
  }
  return 0
}

const modifiers = /^(?:(?:public|private|protected|static|final|synchronized|strictfp|default|abstract|native)\s+)*/

export function methodTypeParameters(code: string): string[] | undefined {
  const prefix = code.trimStart().replace(modifiers, '')
  if (!prefix.startsWith('<')) return /^[\w$]/.test(prefix) ? [] : undefined
  const end = genericPrefixLength(prefix)
  return end ? splitTypes(prefix.slice(1, end - 1)).map((item) => item.split(/\s+/)[0]) : undefined
}

// Ignore comments and literals when checking the extent of the pasted body.
function hasSingleBody(code: string) {
  const tokens = code.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g) ?? []
  let depth = 0
  return tokens.every((token, index) => {
    if (token === '{') return ++depth > 0
    if (token === '}') return --depth > 0 || (depth === 0 && index === tokens.length - 1)
    return true
  }) && depth === 0
}

export function pastedMethod(projectId: string, code: string, javadoc: string): Method {
  if (javadoc.trim() && !/^\/\*\*[\s\S]*?\*\/$/.test(javadoc.trim())) {
    throw new Error('Paste one Javadoc comment beginning with /** and ending with */.')
  }
  const declaration = code.trim().match(/^([^{}();=]+)\(([^{}();=]*)\)\s*(?:throws\s+([^{};]+))?\s*\{[\s\S]*\}$/)
  if (!declaration || !hasSingleBody(code)) throw new Error('Paste one Java method with a body and a plain declaration. Remove annotations from the declaration.')
  const [, head, rawParameters, rawExceptions] = declaration
  const prefix = head.trim().replace(modifiers, '')
  const start = genericPrefixLength(prefix)
  const typeParameters = methodTypeParameters(code) ?? []
  const signature = prefix.slice(start).trim().match(new RegExp('^([\\w$.,?<>\\[\\] &]+?)\\s+(' + identifier + ')$'))
  if (!signature || /^(?:class|interface|enum|record)\s/.test(prefix)) {
    throw new Error('A Java method name and return type are required.')
  }
  const [, returnType, name] = signature
  const parameters = splitTypes(rawParameters).map((item) => {
    const param = item.match(new RegExp('^(?:final\\s+)?([\\w$.,?<>\\[\\] &]+?)\\s+(' + identifier + ')$'))
    if (!param) throw new Error('Unsupported parameter declaration. Use Type name or Type... name.')
    return { type: param[1], name: param[2] }
  })
  const exceptions = splitTypes(rawExceptions ?? '')
  if (exceptions.some((item) => !/^[\w$.]+$/.test(item))) throw new Error('Invalid declared exception type.')
  return {
    projectId, inputKind: 'paste', signature: code.slice(0, code.indexOf('{')).trim(),
    uri: '', qualifiedName: name, sourceUrl: '', code, javadoc, returnType,
    context: { parameters, typeParameters, exceptions, callers: [], callees: [], schemaVersion: '',
      provenance: {} },
  }
}
