import { query } from '@anthropic-ai/claude-agent-sdk'
import { modelFor } from '../llm/policy.ts'

export interface CreativeContext {
  concept: string
  hook: string
  message: string
  cta: string
}

export interface EvaluationScores {
  hook_score: number
  product_clarity: number
  message_clarity: number
  product_salience: number
  cta_intent: number
  visual_quality: number
  artifact_score: number
  overall_score: number
  disqualified: boolean
  failure_modes: string[]
  critic_notes: string
}

const HARNESS_VERSION = 'v0'

const RUBRIC = `You are a strict advertising creative evaluator for short video ads.
The product is Artifact Share (https://artifactshare.com): share one URL for an
AI-generated artifact, get comments, let AI update it at the same URL.
Target audience: English-speaking developers using AI coding agents.

Score the ad video (you will see evenly spaced frames) on 0-10 for each axis:
- hook_score: would the first moments stop a developer scrolling X?
- product_clarity: can a viewer tell what the product does?
- message_clarity: is the core message legible and unambiguous?
- product_salience: does the product (not just the vibe) stay in focus?
- cta_intent: does it create intent to click / try?
- visual_quality: cinematography, composition, coherence
- artifact_score: 10 = no visual defects; lower for glitches, warped text, broken anatomy

Hard constraints - set "disqualified": true when any of these hold:
- the product or its category is unrecognizable
- rendered text is garbled or unreadable where it matters
- severe visual corruption
- the visuals contradict the ad message

Also produce overall_score (0-10, your judgment, not an average),
failure_modes (short strings), critic_notes (2-4 sentences, concrete).

This score is a PREDICTION of real-world ad performance and will be compared
against actual CTR later. Do not inflate scores.`

export class Evaluator {
  readonly harnessVersion = HARNESS_VERSION

  async evaluate(framePaths: string[], creative: CreativeContext): Promise<EvaluationScores> {
    const prompt = `${RUBRIC}

Creative intent:
- concept: ${creative.concept}
- hook: ${creative.hook}
- message: ${creative.message}
- cta: ${creative.cta}

Read and inspect every frame image listed below, then output ONLY a JSON object
with keys: hook_score, product_clarity, message_clarity, product_salience,
cta_intent, visual_quality, artifact_score, overall_score, disqualified,
failure_modes, critic_notes. No markdown fences, no extra text.

Frames:
${framePaths.map((p) => `- ${p}`).join('\n')}`

    const q = query({
      prompt,
      options: { model: modelFor('evaluation'), allowedTools: ['Read'], maxTurns: framePaths.length + 4 },
    })
    let text = ''
    for await (const m of q) {
      if (m.type === 'result') {
        if (m.subtype !== 'success' || !('result' in m)) {
          throw new Error(`evaluator failed: ${m.subtype}`)
        }
        text = m.result
      }
    }
    return this.parse(text)
  }

  private parse(text: string): EvaluationScores {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`evaluator returned no JSON: ${text.slice(0, 300)}`)
    const raw = JSON.parse(match[0]) as Record<string, unknown>
    const num = (k: string): number => {
      const v = raw[k]
      if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`missing numeric ${k}`)
      return v
    }
    return {
      hook_score: num('hook_score'),
      product_clarity: num('product_clarity'),
      message_clarity: num('message_clarity'),
      product_salience: num('product_salience'),
      cta_intent: num('cta_intent'),
      visual_quality: num('visual_quality'),
      artifact_score: num('artifact_score'),
      overall_score: num('overall_score'),
      disqualified: raw.disqualified === true,
      failure_modes: Array.isArray(raw.failure_modes) ? raw.failure_modes.map(String) : [],
      critic_notes: String(raw.critic_notes ?? ''),
    }
  }
}
