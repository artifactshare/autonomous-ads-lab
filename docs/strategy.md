# Strategy: premises, open issues, ideas

The living issue tree for this experiment. Owned by the weekly **strategist agent**
(`prompts/strategist.md`, fable-5). Humans may edit it too. Every entry has a status
so a reader can see what we currently believe, what we are testing, and what we
have stopped believing. Failures and reversals stay in the file; do not delete them,
mark them.

Status vocabulary: `assumed` (acting on it, untested) · `testing` (an experiment is
running) · `supported` / `refuted` (by our own data; cite the numbers) · `parked`
(not now; say why).

## Goal

Find out whether AI-native autonomous ad operations can bring real developers to
Artifact Share within a hard budget ($30/month ads, $10 creative, $10 AI).
North-star KPI: cost per first successful share. Until that is measurable, decide
on **cost per landed session (GA4)**; treat CTR only as a guard against dead
creatives. See `src/ops/decide.ts`.

## Premises (challenge these every week)

| # | Premise | Status | Evidence / why |
|---|---|---|---|
| P1 | X (Twitter) video ads are a channel where AI-native developers can be reached for ~$1.5/day | assumed | Chosen for reach + Grok research loop. No comparison with alternatives (Reddit, dev newsletters, GitHub sponsorship) yet |
| P2 | Pain-first framing ("AI made the file, sharing is still manual") beats feature framing | testing | creative 3 (absurdist final_v7) running since 8/29; 4d: 9,946 imp, 49 clicks, CTR 0.49% |
| P3 | CTR is a usable early signal at this budget | assumed | 5-day window ≈ 10k imp / 50 clicks: distinguishes 0.5% from 1.0%, not 0.5% from 0.6% |
| P4 | Clicks convert to landed sessions at a reasonable rate | testing | GA4 attribution live since 9/1 evening. If landed sessions ≪ clicks, CTR-optimized creatives were optimizing noise |
| P5 | US/UK/CA/AU English + AI-coding keyword targeting reaches the right people | assumed | No audience breakdown pulled yet. Mentions monitoring shows zero organic reactions to the ad |
| P6 | 5-second AI-generated video (H3 Max, text burned in post) is the right format | assumed | Chosen for cost ($0.40/creative). Static image or screen-recording of the real product untested |
| P7 | A 7-day generation cycle balances signal vs exploration | assumed | 20 ad-days/month ⇒ only ~3 generations per month at 7d |

## Open issues

- I1 (from P4): What fraction of X clicks land? Decide rule: if landed/clicks < 30% after 5 days of GA4 data, stop using CTR for anything but early-kill.
- I2 (from P1, P6): Is the cheapest useful experiment even a video ad? A single promoted post with a real product screenshot would cost the same ad spend and $0 creative.
- I3 (from P7): Cycle length. Shorter cycles buy exploration, longer buy signal. Revisit once P4 is known.
- I4 (from P5): Pull audience/placement breakdown from Ads Manager via the bridge so targeting can be a hypothesis, not a constant.

## Ideas backlog (not scheduled; the strategist ranks these weekly)

- Landing page variant per creative (same URL, `?v=` param) so the ad promise and the page match.
- Use organic X posts as free pre-tests: post the hook organically, promote only what gets replies.
- Ask Grok research for the pains people *complain about in replies*, not what people post about.

## Reversals log

- (none yet)
