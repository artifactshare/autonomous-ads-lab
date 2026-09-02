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
| P2 | Pain-first framing ("AI made the file, sharing is still manual") beats feature framing | testing | 9/2: creative 3 (absurdist final_v7) 4d through 9/1: 9,946 imp, 49 clicks, CTR 0.49%, $5.83. Well above early-kill (0.15%), but this is a **single arm** — no feature-framing comparison has ever run. Cannot resolve before gen-2 challengers (~9/5) provide one |
| P3 | CTR is a usable early signal at this budget | assumed | 9/2: daily CTR over 4d ranged 0.46–0.61% — stable, consistent with "distinguishes 2x differences only". No change |
| P4 | Clicks convert to landed sessions at a reasonable rate | testing | 9/2: **blocked — zero GA4 rows synced** after 4 ad-days. 9/2 morning daily logged `ga4: skipped (secrets not set)`; env vars only wired into the workflow in #76 (merged 9/2 11:35 JST, after that run). Landing rate is unmeasured, not 0%. See I5 / issue #80 |
| P5 | US/UK/CA/AU English + AI-coding keyword targeting reaches the right people | assumed | No audience breakdown pulled yet. Mentions monitoring shows zero organic reactions to the ad |
| P6 | 5-second AI-generated video (H3 Max, text burned in post) is the right format | assumed | Chosen for cost ($0.40/creative). Static image or screen-recording of the real product untested |
| P7 | A 7-day generation cycle balances signal vs exploration | assumed | 20 ad-days/month ⇒ only ~3 generations per month at 7d |

## Open issues

- I1 (from P4): What fraction of X clicks land? Decide rule: if landed/clicks < 30% after 5 days of GA4 data, stop using CTR for anything but early-kill. *9/2: the 5-day clock has not started — zero GA4 rows synced so far.*
- I2 (from P1, P6): Is the cheapest useful experiment even a video ad? A single promoted post with a real product screenshot would cost the same ad spend and $0 creative.
- I3 (from P7): Cycle length. Shorter cycles buy exploration, longer buy signal. Revisit once P4 is known.
- I4 (from P5): Pull audience/placement breakdown from Ads Manager via the bridge so targeting can be a hypothesis, not a constant.
- I5 (from P4, opened 9/2): GA4 delivery is unverified and the strategist cannot check repo secrets (API 403). Filed needs-human issue #80 with commands; the 9/3 morning daily run confirms or denies. Hard deadline: gen-2 round fires ~9/5 — without GA4 data it decides blind on landing. Code guard merged so an unmeasured landing rate can no longer read as "0% landed" in the hypothesis prompt.

## Ideas backlog (not scheduled; the strategist ranks these weekly)

Ranked 2026-09-02:

1. **Static promoted post with a real product screenshot** (attacks I2/P6 + learning "no visible product UI caps product_clarity at 3.5–4.5/10"). What: 1 static ad showing the actual Artifact Share screen, same targeting. Cost: $0 creative, ads within the normal $1.5/day. Days: 5. Success: CTR ≥ 0.25% (within 2x of video baseline 0.49%) **and**, once GA4 flows, landed sessions/$ ≥ the video's. Blocker: bridge swap flow is video-only today (issue #44) — scope that first; do not schedule before GA4 flows or we learn nothing about landing.
2. **Organic hook pre-tests**: post gen-2 candidate hooks organically before paying; promote only what gets non-self engagement. Cost $0, 2 days per hook. Success: any reply/like from a non-self account (mentions monitoring has recorded zero non-self reactions to date — this doubles as a cheap probe of P5).
3. Landing page variant per creative (same URL, `?v=` param) so the ad promise and the page match. *Parked until GA4 flows: message-match is unmeasurable without landing data.*
4. Ask Grok research for the pains people *complain about in replies*, not what people post about. Fold into the next weekly research run.

## Reversals log

- (none yet)
