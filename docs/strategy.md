# Strategy: premises, open issues, ideas

The living issue tree for this experiment. Owned by the weekly **strategist agent**
(`prompts/strategist.md`, fable-5). Humans may edit it too. Every entry has a status
so a reader can see what we currently believe, what we are testing, and what we
have stopped believing. Failures and reversals stay in the file; do not delete them,
mark them.

Status vocabulary: `assumed` (acting on it, untested) · `testing` (an experiment is
running) · `supported` / `refuted` (by our own data; cite the numbers) · `parked`
(not now; say why).

> Note 9/14: the 9/7 strategist review (PR #106) never merged — it went DIRTY against
> daily-ops commits and stalled 166h. This file now carries both the 9/7 conclusions
> and the 9/14 update. See I8.

## Goal

Find out whether AI-native autonomous ad operations can bring real developers to
Artifact Share within a hard budget ($30/month ads, $10 creative, $10 AI).
North-star KPI: cost per first successful share. Until that is measurable, decide
on **cost per landed session (GA4)**; treat CTR only as a guard against dead
creatives. See `src/ops/decide.ts`.

## Who / Message / Action (backward chain; the strategist rewrites this weekly)

Updated 2026-09-14 (human + Claude session; source: `data/adopter-signals.json`, `prompts/knowledge/audience.md`).

- **Expected action**: sign up, post the first artifact via CLI or MCP, and get one teammate comment. Not a landing, not a sign-up alone.
- **Why they act**: they have an agent-written doc *right now* that a teammate must review, and the workaround (Vercel deploy, Notion paste, versions in Slack, read-only Claude Artifacts) hurts. Sign-up happens at the moment of need, so we target people for whom that moment is frequent.
- **Who**: CTOs / founding engineers of 2–9 person AI-native teams who write design docs, briefs and teardowns with Claude Code / Codex / Cursor and review them together. Evidence: the only non-JP paying team workspace (first post via CLI on day one, 41 posts / 112 versions / 48 comments in 6 weeks). Named X accounts that speak to this: @rauchg, @dan__rosenthal, @akshatag77, @gregisenberg, @crod_ai (see research_observations kind=target_people).
- **Message**: "any agent, owned by the team, reviewed at one URL that keeps updating" — not "share HTML" (Showly et al. already say that; vendors' own publish buttons cover it).
- **How to reach**: follower look-alikes of the named accounts (`SIMILAR_TO_FOLLOWERS_OF_USER`) instead of broad AI-coding keywords.

## Premises (challenge these every week)

| # | Premise | Status | Evidence / why |
|---|---|---|---|
| P1 | X (Twitter) video ads are a channel where AI-native developers can be reached for ~$1.5/day | assumed (weakening) | 9/14: the cost anchor is **degrading week over week**: $0.41/landed session (9/2–9/6, $7.29/18) → **$1.13/session** (9/7–9/13, $10.20/9). Cumulative measured: $0.65/session ($17.48/27). At the w2 rate, $30/mo buys ~27 sessions, not ~70. One incumbent creative decaying is not yet channel failure, but a second consecutive week at ≥$1/session with a fresh creative would be. Still no comparison with alternatives (Reddit, dev newsletters, GitHub sponsorship). Note: the Grok weekly research loop — part of this premise's rationale — has not run since 9/1 (cron down, watchdog alerting) |
| P2 | Pain-first framing ("AI made the file, sharing is still manual") beats feature framing | testing | 9/14: **still a single arm, 16 days in-flight**. Gen-2 challengers (workflow-demo framing, creatives 6–8) evaluated and waiting since 9/5 — deployment blocked 9 days (I6 / #44). The comparison this premise needs has not started |
| P3 | CTR is a usable early signal at this budget | supported (early-kill guard only) | 9/14: decisive week. w2 CTR held at ~1.08% (116 clicks / 10,736 imp, daily 0.95–1.4%) while daily sessions halved (18→9 WoW). CTR is now fully decoupled from landings in our own data — it moved 2x up from the 0.49% baseline with zero landing improvement. Keep only as the 0.15% dead-creative floor (per I1's fired rule) |
| P4 | Clicks convert to landed sessions at a reasonable rate | **refuted** (strengthened 9/14) | 9/7: first 5 measured GA4 days (9/2–9/6): 115 clicks → 18 sessions = **15.7%**, vs the pre-registered 30% bar (I1). 9/14: w2 (9/7–9/13) fell to **7.8%** (116 clicks → 9 sessions); cumulative measured 11.7% (231→27). Not only do ~6/7 paid clicks never arrive — the fraction that lands is *shrinking* while CTR holds, consistent with X's optimizer drifting toward tap-happy audiences. See Reversals log |
| P5 | US/UK/CA/AU English + AI-coding keyword targeting reaches the right people | refuted (9/14) | 16 ad-days: 30,289 imp, 280 link clicks, landing rate fell 15.7% → 7.8%, 0 sign-ups, one reply ("makes no sense"). Meanwhile production shows the real English adopter is an AI-native small team, not a keyword. Replaced by P8 |
| P8 | Follower look-alikes of accounts that voice the adopter profile (@rauchg, @dan__rosenthal, @akshatag77, @gregisenberg) reach people closer to the real adopters than keywords | testing (from 9/14 15:26 JST) | Backward chain in the Who/Message/Action section. Test: swap targeting for creative 8, judge on landing rate and 7-day first_share, not CTR |
| P6 | 5-second AI-generated video (H3 Max, text burned in post) is the right format | assumed | Within-video *style* (absurdist metaphor vs literal workflow demo) is contested by experiment 3, still awaiting deploy. Video-vs-static untested (idea 3). Format spec is now 8s H3 Max Turbo per the 9/3 comparison |
| P7 | A 7-day generation cycle balances signal vs exploration | assumed | 9/14: unchanged — the binding constraint on cycle time is the **deploy path**, not the 7d rule; the gen-2 winner has now been idle 9 days (I6). Revisit cycle length only after deployment works |

## Open issues

- I1 (from P4): ~~What fraction of X clicks land?~~ **Closed 9/7 — rule fired.** Pre-registered decide rule was "if landed/clicks < 30% after 5 days of GA4 data, stop using CTR for anything but early-kill". Measured 15.7% (18/115, 9/2–9/6) < 30% → P4 refuted. Consequence verified already implemented: `decide.ts` uses CTR only for early-kill (0.15% floor) and decides on cost per landed session; the hypothesis prompt de-weights CTR. No code change was needed
- I2 (from P1, P6): Is the cheapest useful experiment even a video ad? A static promoted post with a real product screenshot costs the same ad spend and $0 creative. *9/14: baseline to beat is now a moving target ($0.41→$1.13/session); still blocked by the deploy path (#44)*
- I3 (from P7): Cycle length. *Moot until I6 is resolved — deploy latency (9 days and counting) dominates cycle time*
- I4 (from P5): Pull audience/placement breakdown from Ads Manager via the bridge so targeting can be a hypothesis, not a constant. *9/14: sharpened by the JP-users-vs-US-targeting observation in P5*
- I5 (from P4, opened 9/2): ~~GA4 delivery unverified.~~ **Closed 9/7** — GA4 has synced daily since 9/2. Issue #80 resolved
- I6 (opened 9/7, from P2/P6/P7): **The deploy path is the binding constraint — now with a budget deadline.** Bridge auto-deploy (#44) fails before ad-group attach / old-ad pause; creative 8 (winner) has waited since 9/5 — 9 days, ~$13.1 flowed to the challenged incumbent in that time. New 9/14: September ads budget is $18.95/$30 spent — **~$11 ≈ 7 ad-days left**. If creative 8 is not live by ~9/16, experiment 3 cannot get its 5 measured days inside September's budget. Escalated again on #44 with two options: (a) manual deploy by 9/16, or (b) failing that, pause creative 3 to stop spending on a decided-against arm ($1.13/session and worsening) and preserve the remainder for when the deploy path works
- I7 (opened 9/7, from Goal): 0 sign-ups in 29 sessions (29/50 as of 9/13). **Decision point unchanged: at 50 cumulative sessions with 0 sign-ups, open an issue questioning the landing page / product-side funnel.** 9/14 note: at the current ~1 session/day decay the trigger is ≥3 weeks out; do not lower the bar — a noisier verdict is worse than a slower one
- I8 (opened 9/14, meta): **The strategist's own output path failed.** PR #106 (9/7 review) went DIRTY against daily-ops journal commits and stalled 166h; for a full week `docs/strategy.md` on main showed pre-reversal state (P4 "testing") to every agent that read it. Superseded by this week's PR (branch from fresh main, both weeks folded in). Fix belongs to harness: #108 (watchdog misses agent branches), #107 (approval step). Rule for future strategist runs: branch from fresh main, and if the previous week's PR is unmerged, fold it in and close it rather than leaving two stale branches

## Ideas backlog (not scheduled; the strategist ranks these weekly)

Ranked 2026-09-14 (strategist re-ranks weekly):

0. **Swap targeting to follower look-alikes** (attacks P8). What: add `SIMILAR_TO_FOLLOWERS_OF_USER` for the named accounts, remove the 4 broad keywords, keep creative 8. Cost: $0 creative. Days: 7. Success: landing rate ≥ 30% or any first_share within 7 days.
0b. **Reply to the post that asks for the product** (@akshatag77 thread, needs-human). Cost $0.

Ranked 2026-09-14 by the strategist (later the same day: #44 closed — creative 8 went live via the Ads API and targeting was swapped per P8, so items 1–2 below are done):

1. **Manual deploy of creative 8 by 9/16** (unblocks experiment 3; re-escalated in #44 with the budget deadline). Video `data/creatives/8/final.mp4`, UTM campaign `exp-auto-8`, pause creative 3, record a `deployments` row. Cost: $0 extra. Success: click→session rate and $/session of workflow-demo format measurable over 5 days within September's budget. Readout vs corrected baseline: beat $0.65/session cumulative (and note the incumbent's w2 was $1.13)
2. **If (1) misses 9/16: pause creative 3** (needs-human, same Ads Manager session). Rationale: 16 days of incumbent data already collected; at $1.13/session and decaying, day 17+ buys almost no new information. Preserves ~$11 ≈ 7 ad-days for experiment 3 whenever deploy works. Cost of waiting instead: ~$1.47/day for data we've already decided against
3. **Organic hook pre-tests** of the gen-2 hooks (creatives 6–8): $0, can ride the same session as (1). Success: any reply/like from a non-self account (still zero non-self reactions ever — doubles as a cheap probe of P5)
4. **Static promoted post with a real product screenshot** (attacks I2/P6). $0 creative, 5 days. Success: landed sessions/$ ≥ the then-current baseline. Blocked until the deploy path works at all (#44)
5. Landing page variant per creative (`?v=` param). *Parked: after experiment 3's readout, one variable at a time*
6. Ask Grok research for the pains people *complain about in replies*, not what people post about. *Blocked: research cron down since 9/1 — fold in once it runs again*

## Reversals log

- **2026-09-07 — P4 refuted.** "Clicks convert to landed sessions at a reasonable rate" overturned by the first 5 days of GA4 data: 18 sessions / 115 clicks (9/2–9/6) = 15.7%, vs the pre-registered 30% bar (I1). Whole-flight interpretation (164 clicks incl. 4 pre-sync days) gives 11%; both readings fire the rule. Consequence: CTR demoted to early-kill guard only; the deciding metric is cost per landed session. Code already implemented this ladder (`decide.ts`), verified 9/7 — no code change needed. *(This entry was written 9/7 in PR #106, which never merged; recorded on main 9/14 — see I8.)* **9/14 addendum:** refutation strengthened — w2 landing rate 7.8% (9/116), cumulative 11.7% (27/231), trending down while CTR holds ~1%.
- 2026-09-14: P5 (keyword targeting) refuted. The experiment optimised creatives for 16 days while the audience premise was wrong; production adopter data (`data/adopter-signals.json`) and an X people search showed a different "who". Rule from now on: answer Who / Message / Action before touching creatives.
