// Allowlisted integrations are billed to the signed-in caller.
export const integrations: Record<
  string,
  { billing: 'user' }
> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
  anthropic: { billing: 'user' },
  openai: { billing: 'user' },
  cloudflare: { billing: 'user' },
}
