// Model tiering policy for automated jobs.
//
// Principles:
// - fable-5: strongest metacognition; can question premises. Weekly limit is
//   tight, so use it ONLY where questioning the frame pays off: generating
//   hypotheses, refining them, and designing how to validate them. Hard cap
//   per week, enforced here.
// - opus-5: strong logic/calculation. Use for numeric analysis: metrics
//   interpretation, prediction-vs-actual comparison, budget allocation.
// - sonnet-5: cheap, best prose. Default for everything language-heavy and
//   frequent: creative copy, evaluation rubric scoring, report/journal prose.

export type LlmRole =
  | 'hypothesis' // generate/refine hypotheses, design validation -> fable
  | 'analysis' // metrics math, prediction-vs-actual, allocation -> opus
  | 'evaluation' // per-creative rubric scoring (frequent) -> sonnet
  | 'copywriting' // ad copy, hooks, CTA variants -> sonnet
  | 'narrative' // journal/report prose -> sonnet

export const MODEL_FOR_ROLE: Record<LlmRole, string> = {
  hypothesis: 'claude-fable-5',
  analysis: 'claude-opus-5',
  evaluation: 'claude-sonnet-5',
  copywriting: 'claude-sonnet-5',
  narrative: 'claude-sonnet-5',
}

// fable budget: at most this many fable calls per weekly run. If exceeded,
// fall back to opus rather than silently burning the weekly limit.
export const FABLE_CALLS_PER_WEEK = 3

let fableCallsThisRun = 0

export interface ModelChoice {
  model: string
  /** Reasoning effort: fable runs at 'low' (its base judgment is the point,
   *  and weekly limit is tight); everything else at 'high'. */
  effort: 'low' | 'high'
}

export function modelFor(role: LlmRole): ModelChoice {
  let model = MODEL_FOR_ROLE[role]
  if (role === 'hypothesis') {
    fableCallsThisRun += 1
    if (fableCallsThisRun > FABLE_CALLS_PER_WEEK) model = MODEL_FOR_ROLE.analysis
  }
  const effort = model === 'claude-fable-5' ? 'low' : 'high'
  return { model, effort }
}

export function resetFableCounter(): void {
  fableCallsThisRun = 0
}
