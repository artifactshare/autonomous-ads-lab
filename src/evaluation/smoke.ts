// Smoke test: verify the Agent SDK auth works. pnpm tsx src/evaluation/smoke.ts
import { query } from '@anthropic-ai/claude-agent-sdk'

const q = query({ prompt: 'Reply with exactly: OK', options: { maxTurns: 1, allowedTools: [] } })
for await (const m of q) {
  if (m.type === 'result') {
    console.log('subtype:', m.subtype)
    if ('result' in m) console.log('result:', m.result)
  }
}
