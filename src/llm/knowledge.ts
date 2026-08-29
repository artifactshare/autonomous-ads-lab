import { existsSync, readFileSync } from 'node:fs'

export type KnowledgeDomain = 'h3max-prompting' | 'video-ads' | 'marketing-strategy'

/**
 * Load internalized knowledge for prompt assembly. Every generation /
 * hypothesis / evaluation prompt should include the relevant domain(s) so the
 * system acts on accumulated, source-attributed knowledge instead of the
 * model's untracked priors. Files live in prompts/knowledge/ and are updated
 * by the weekly research job and the harness agent (see docs in that dir).
 */
export function loadKnowledge(domains: KnowledgeDomain[]): string {
  return domains
    .map((d) => `prompts/knowledge/${d}.md`)
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n\n---\n\n')
}
