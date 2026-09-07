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
| P1 | X (Twitter) video ads are a channel where AI-native developers can be reached for ~$1.5/day | assumed | 9/7: first cost anchor exists — $0.41/landed session (measured window 9/2–9/6: $7.29 / 18 sessions). $30/mo buys ~70 landed sessions if this holds. Not obviously broken, but 0 sign-ups in 20 sessions means the north star is still unbounded. Still no comparison with alternatives (Reddit, dev newsletters, GitHub sponsorship) |
| P2 | Pain-first framing ("AI made the file, sharing is still manual") beats feature framing | testing | 9/7: creative 3 flight now 9d: 20,152 imp, 164 clicks, CTR 0.81%, $13.12. Still a **single arm**. Gen-2 challengers (workflow-demo framing, creatives 6–8) are generated and evaluated but deployment is blocked (I6 / #44) since 9/5 — comparison cannot start until then |
| P3 | CTR is a usable early signal at this budget | supported (early-kill guard only) | 9/7: daily CTR tripled (0.49% early → 1.20/1.50/1.32% on 9/4–9/6) while daily sessions stayed flat (3, 1, 4) — CTR movement does not track landings; a rising CTR may just be X's optimizer finding mis-tappers. As a dead-creative guard it works (always ≥3x above the 0.15% floor). Per I1's fired rule, CTR is used for nothing else |
| P4 | Clicks convert to landed sessions at a reasonable rate | **refuted** | 9/7: first 5 measured GA4 days (9/2–9/6): 115 clicks → 18 sessions = **15.7%** (95% CI ~10–23%). Counting the whole flight incl. pre-sync days: 164 clicks → 11%. Both far below the pre-registered 30% bar (I1). ~6 of 7 paid clicks never arrive — consistent with X counting video taps/mis-taps as clicks. See Reversals log |
| P5 | US/UK/CA/AU English + AI-coding keyword targeting reaches the right people | assumed | 9/7: another week of zero non-self organic engagement with the ad; the only public reply to date is negative/confused ("makes no fucking sense", message_confusion + ai_trust_concern). Still no audience breakdown (I4) |
| P6 | 5-second AI-generated video (H3 Max, text burned in post) is the right format | assumed | Within-video *style* (absurdist metaphor vs literal workflow demo) is now contested by experiment 3, awaiting deploy. Video-vs-static is still untested (idea 3). Note: format spec is now 8s H3 Max Turbo per the 9/3 comparison |
| P7 | A 7-day generation cycle balances signal vs exploration | assumed | 9/7: the binding constraint on cycle time is currently the **deploy path**, not the 7d rule — the gen-2 winner has been idle since 9/5 (I6). Revisit cycle length only after deployment is automated |

## Open issues

- I1 (from P4): ~~What fraction of X clicks land?~~ **Closed 9/7 — rule fired.** Pre-registered decide rule was "if landed/clicks < 30% after 5 days of GA4 data, stop using CTR for anything but early-kill". Measured 15.7% (18/115, 9/2–9/6) < 30% → P4 refuted. Consequence verified already implemented in code: `decide.ts` uses CTR only for early-kill (0.15% floor) and decides generations on cost per landed session; the hypothesis prompt explicitly de-weights CTR. No code change was needed
- I2 (from P1, P6): Is the cheapest useful experiment even a video ad? A static promoted post with a real product screenshot costs the same ad spend and $0 creative. *9/7: now decidable when run — baseline to beat is $0.41/landed session. Still blocked by the deploy path (#44)*
- I3 (from P7): Cycle length. *9/7: moot until I6 is resolved — deploy latency (2+ days and counting) currently dominates cycle time*
- I4 (from P5): Pull audience/placement breakdown from Ads Manager via the bridge so targeting can be a hypothesis, not a constant
- I5 (from P4, opened 9/2): ~~GA4 delivery unverified.~~ **Closed 9/7** — GA4 has synced daily since 9/2 (6 rows, 20 sessions, 0 sign_ups as of 9/7). Issue #80 resolved
- I6 (opened 9/7, from P2/P6/P7): **The deploy path is the binding constraint.** Bridge auto-deploy (#44) intentionally fails before ad-group attach / old-ad pause; creative 8 (winner, 4.5/10 frame, 5.6/10 video) has waited since 9/5 through two 06:30 JST bridge runs, while $1.5/day keeps flowing to the challenged incumbent. Escalated 9/7 with a needs-human comment on #44 incl. an interim *manual* deploy procedure (same path as the 8/29 initial deploy, UTM `exp-auto-8`). Decide-rule idea if this recurs: escalate automatically when a winner is idle > 48h
- I7 (opened 9/7, from Goal): 0 sign-ups in 20 sessions — the north star is unmeasured, not failing. At $0.41/session, $30/mo ≈ 70 sessions; a sign-up rate below ~1.5% would show 0 for a whole month. **Decision point: at 50 cumulative sessions with 0 sign-ups, open an issue questioning the landing page / product-side funnel rather than the ads.** (20/50 as of 9/7)

## Ideas backlog (not scheduled; the strategist ranks these weekly)

Ranked 2026-09-07:

1. **Interim manual deploy of creative 8** (unblocks experiment 3; escalated in #44). What: human swaps the ad in Ads Manager exactly like the 8/29 initial deploy; video `data/creatives/8/final.mp4`, UTM campaign `exp-auto-8`; pause creative 3; record a `deployments` row. Cost: $0 extra (same $1.5/day). Days: 5 of data. Success: click→session rate and $/session of the workflow-demo format measurable. **Readout note: judge experiment 3 against the corrected baseline — beat $0.41/session and 15.7% landing — not the "10%" figure baked into its hypothesis text, which was computed over the flight incl. pre-GA4-sync clicks**
2. **Organic hook pre-tests** of the gen-2 hooks (creatives 6–8): post organically before/alongside paying; can ride the same mini-PC session as the manual deploy. Cost $0, 2 days per hook. Success: any reply/like from a non-self account (still zero non-self reactions ever — doubles as a cheap probe of P5)
3. **Static promoted post with a real product screenshot** (attacks I2/P6 + the "no visible product UI caps product_clarity" learning). Cost: $0 creative. Days: 5. Success: landed sessions/$ ≥ $0.41/session baseline. Blocked until the deploy path works at all (#44); the swap flow being video-only is now the smaller half of that blocker
4. Landing page variant per creative (same URL, `?v=` param). *Still parked: do it after experiment 3's readout so message-match changes one variable at a time*
5. Ask Grok research for the pains people *complain about in replies*, not what people post about. Fold into the next weekly research run

## Reversals log

- **2026-09-07 — P4 refuted.** "Clicks convert to landed sessions at a reasonable rate" overturned by the first 5 days of GA4 data: 18 sessions / 115 clicks (9/2–9/6) = 15.7%, vs the pre-registered 30% bar (I1). Whole-flight interpretation (164 clicks incl. 4 pre-sync days) gives 11%; both readings fire the rule, so the ambiguity about whether 8/29–9/1 was "measured zero" or "not yet collecting" does not change the verdict. Consequence: CTR demoted to early-kill guard only; the deciding metric is cost per landed session ($0.41 in the measured window). Code already implemented this ladder (`decide.ts`), verified 9/7 — no code change needed
