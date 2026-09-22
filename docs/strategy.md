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

> Note 9/21: **every ads number recorded between 9/15 and 9/20 for creative 3 was a
> metrics artifact.** Creative 3 stopped delivering 9/14 (deployment replaced), but the
> Ads API sync kept attributing *campaign totals* — i.e. creatives 8+27's real spend —
> to it, double-counting ~$8.75. September's ledger read $38.41/$30; real spend is
> $29.65 (+~$0.44 unseparable 9/14 partial-day overlap). Found in this review; root
> cause + monthly-cap kill switch fixed in PR #169. See I10.

## Goal

Find out whether AI-native autonomous ad operations can bring real developers to
Artifact Share within a hard budget ($30/month ads, $10 creative, $10 AI).
North-star KPI: cost per first successful share. Until that is measurable, decide
on **cost per landed session (GA4)**; treat CTR only as a guard against dead
creatives. See `src/ops/decide.ts`.

## Who / Message / Action (backward chain; the strategist rewrites this weekly)

Updated 2026-09-21 (strategist). The four answers did **not** change from 9/14 — this
week's data sharpened *format* and *hook*, not *who*:

- **Expected action**: sign up, post the first artifact via CLI or MCP, and get one teammate comment. Not a landing, not a sign-up alone.
- **Why they act**: they have an agent-written doc *right now* that a teammate must review, and the workaround (Vercel deploy, Notion paste, versions in Slack, read-only Claude Artifacts) hurts. Sign-up happens at the moment of need.
- **Who**: CTOs / founding engineers of 2–9 person AI-native teams who write design docs, briefs and teardowns with agents and review them together. 9/21 adopter-signals check: the profile still holds — the strongest new external workspace (7 members, en, company domain, created 8/1) posts design docs (16), strategy plans (5), competitive analyses (4) with 48 comments; the paying en team workspace remains the deepest user (374 posts / 2,072 versions). No evidence this week to change the who → per the one-axis-per-week rule, targeting stays as set on 9/14 (follower look-alikes, P8).
- **Message**: "any agent, owned by the team, reviewed at one URL that keeps updating" — now delivered as *workaround-naming hooks* (experiment 6, creatives 28–30): the ad names the exact workaround the viewer used this week, in their words.
- **Format** (added 9/21): keyframe motion (Playwright stills + H3 Max Turbo I2V), not raw screen footage — P11's 9/21 readout was decisive (below).
- **Channel**: paid X stays the測定枠, but the single best per-dollar result of the whole experiment is still the 9/14 human reply (P9: $0 → sign-up + first share + teammate view in 7 minutes). The reply routine did not run this week — that is a process failure worth fixing before more paid optimization (Ideas #4).

## Premises (challenge these every week)

| # | Premise | Status | Evidence / why |
|---|---|---|---|
| P1 | X (Twitter) video ads are a channel where AI-native developers can be reached for ~$1.5/day | assumed (weakening; verdict gated on I9) | 9/21, corrected books: w3 (9/14–9/20) real spend $9.25 (c8 $2.10 + c27 $7.15), 20 GA4 sessions → **$0.46/session** — but 13 of the 20 landed on 9/15 when the ads got ≤4 clicks total (I9, suspected organic contamination). Excluding 9/15: 7 sessions → **$1.32/session**. So w3 is either the best week yet or the third week of ≥$1/session decay, and we cannot tell until I9 resolves. The 9/14 rule ("second consecutive week ≥$1/session with a fresh creative = channel failure") is therefore **pending, not fired**. Sign-ups from paid remain 0 in ~4 weeks |
| P2 | Pain-first framing ("AI made the file, sharing is still manual") beats feature framing | testing (still confounded) | 9/21: the live A/B this week was format (c8 real footage vs c27 keyframe motion), both pain-adjacent hooks — message framing still has no clean test. Experiment 6 (workaround-naming hooks vs c27's abstract question) is the first real message test; readout ~7 days after creative 29 deploys (October, see I10) |
| P3 | CTR is a usable early signal at this budget | supported (early-kill guard only) | 9/21: unchanged. New wrinkle: X's optimizer starved c8 (5,417 imp, CTR 0.15%) while feeding c27 (13,846 imp, CTR 0.48%) on the same line item — allocation itself now confounds per-arm CTR; another reason CTR stays demoted |
| P4 | Clicks convert to landed sessions at a reasonable rate | **refuted** (9/7, strengthened 9/14; 9/21 consistent) | w3 look-alike arms: 74 clicks → 20 sessions = 27% incl. the suspect 9/15 spike, **10% (7/70) excluding it** — still under the pre-registered 30% bar either way. The refutation stands; what improved is *which* clicks we buy (P8) |
| P5 | US/UK/CA/AU English + AI-coding keyword targeting reaches the right people | refuted (9/14; closed) | 9/21 correction: creative 3 stopped 9/14, so there is no post-9/14 keyword data — its apparent 9/15+ "delivery" was the I10 metrics artifact. The 16-day record stands: 30,289 imp, 280 clicks, landing 15.7%→7.8%, 0 sign-ups |
| P8 | Follower look-alikes of accounts that voice the adopter profile reach people closer to the real adopters than keywords | testing (leaning supported; bar not met) | First full week: 74 clicks → 20 sessions = **27%** landing incl. 9/15, **10%** excluding — vs keywords' terminal 7.8%. Directionally better even on the conservative read, but the pre-registered success bar (≥30% landing or a first_share in 7 days) was not cleanly met: no sign-up, no first_share, and the 27% depends on the suspect spike (I9). Keep testing through experiment 6; do not touch targeting this week (one axis rule — this week's axis was spent on the budget fix) |
| P9 | Replying (from @techtalkjp, with a 30s real-loop video) to posts that ask for the product converts better per dollar than paid video | testing (routine failed to run) | No new replies 9/15–9/21; the weekly reply_candidates routine never got established and `research_observations` has no target_people rows to draw from (research cron gap, #23). The single 9/14 datapoint ($0 → sign-up + first share + teammate view in 7 min) remains the best per-dollar result of the entire experiment. Fix the routine before buying more paid learning (Ideas #4) |
| P6 | 5-second AI-generated video (H3 Max, text burned in post) is the right format | refuted (9/14) → superseded by P11 | |
| P10 | Real loop footage + a hook that names the viewer's current workaround beats generated video on landed sessions per dollar | **refuted on the footage half (9/21)**; hook half carried into experiment 6 | c8 (real footage) vs c27 (keyframe motion), same line item, 7 days: link CPC $0.262 vs **$0.108**, GA4 sessions 1 vs 19 (1 vs 6 excluding the 9/15 spike — c27 wins on every reading). Caveat: X starved c8 (5,417 vs 13,846 imp), so this is "footage lost under the optimizer", not a balanced exposure test. The workaround-hook bet lives on in creatives 28–30, now in keyframe format |
| P11 | モーショングラフィックス広告は実録より安くセッションを取る | **supported (9/21, as pre-registered)** | Judged 9/21 on the 9/14-registered criteria: c27 beat c8 on link CPC ($0.108 vs $0.262) and GA4 sessions (19 vs 1; spike-excluded 6 vs 1). Consequence enacted: keyframe-motion is the default production flow (experiment 6's creatives 28–30 are keyframe), and the strategist's 5 proposed 27-lineage hooks are in Ideas. Caveat: c27's $/session ($0.38 incl. spike, $1.04 excl.) is I9-ambiguous — the *comparison* verdict is robust, the *absolute* baseline is not |
| P7 | A 7-day generation cycle balances signal vs exploration | assumed | 9/21: the deploy path worked twice this cycle (c27 on 9/14, c29 pending) — the 9/14 concern (deploy latency dominates) is resolved. The new binding constraint is budget: September is spent, so exp 6 starts in October (I10). Revisit cycle length only if October shows the 7d rhythm wasting budget on decided arms again |

## Open issues

- I1 (from P4): closed 9/7 — rule fired, CTR demoted to early-kill guard. See Reversals log
- I2 (from P1, P6): Is the cheapest useful experiment even a video ad? A static promoted post costs the same ad spend and $0 creative. *9/21: cheaper than ever to test — the keyframe pipeline's Playwright stills are ready-made static creatives. Candidate for October if creative 29 underperforms (Ideas #5)*
- I3 (from P7): Cycle length. *9/21: deploy latency resolved; moot unless October shows waste*
- I4 (from P5): Pull audience/placement breakdown from Ads Manager so targeting can be a hypothesis. *Still open; would also help I9*
- I5: closed 9/7 (GA4 syncing since 9/2)
- I6: **closed 9/21.** The deploy path works: c8/c27 deployed 9/14 via Ads API, c29 auto-deploys next active day. Superseded by I10 (budget, not deployment, now gates the timeline)
- I7 (from Goal): **fired 9/21.** 49 cumulative GA4 sessions (47 excluding 2 diag), **0 sign-ups** — the pre-registered 50-session trigger is one session short and will complete trivially, so the issue is opened now rather than a week late. Two hypotheses in the issue: (a) the landing page doesn't convert this traffic; (b) **the GA4 sign_up event may simply not fire/attribute** (0 across 49 sessions while the product logs 127 organic September sign-ups is also consistent with broken measurement). needs-human issue with both checks → **#171**
- I8 (meta, from 9/14): the agents' output path. *9/21: journal conflicts are solved (`merge=union`, #133 fix held this week), but #107 (CI runs stuck action_required) bit again: weekly PR #168 sat unapproved with no checks reported; this run could not approve it (403) and relied on the strategist workflow's post-run approve loop. #107 stays the fix that matters*
- I9 (opened 9/21, from P1/P8/P11): **The 9/15 session spike is unattributed and decides three premises.** 13 of exp-auto-27's 19 weekly sessions landed 9/15, a day the ads took ≤4 clicks — same day @techtalkjp's organic post hit 5,247 views. If those 13 sessions are organic contamination of the utm_campaign, then: P1's week was $1.32/session (3rd decay week), P8's landing rate is 10%, and c27's baseline for experiment 6 is $1.04/session not $0.38. Resolution: GA4 source/medium (or referrer) breakdown for utm_campaign=exp-auto-27 on 2026-09-15 — needs-human **#170**. **Pre-registered rule for exp 6**: if creative 29 beats $0.38/session, it wins outright; if it lands between $0.38 and $1.04, the verdict waits on I9; judge landed-session *rate* against 29% incl. / 10% excl. accordingly
- I10 (opened 9/21, from Goal/P1): **September's books were wrong and the cap had no teeth.** (a) Metrics double-count inflated the ledger to $38.41; real spend $29.65 (+~$0.44 9/14 overlap). (b) Nothing paused delivery once the monthly $30 was gone — BudgetController only gates agent-initiated spend. Both fixed in PR #169: dedup + event-captured data correction + a daily budget guard that pauses all live line items when month spend + one capped day exceeds $30, auto-resuming only its own pauses in a month with room. Expected sequence: guard pauses line item xirso at the 9/22 daily run (September lands at ~$31 real, ~$1 over cap — disclosed, not hidden); 10/1 the guard resumes and decide deploys creative 29 (experiment 6). The cap itself ($30, `src/config.ts`) is untouched — this is enforcement of the human gate, not a change to it

## Ideas backlog (not scheduled; the strategist ranks these weekly)

Ranked 2026-09-21:

1. **October restart = experiment 6 launch** (attacks P2/P4 via workaround hooks). What: budget guard auto-resumes 10/1, decide deploys creative 29 ("spec_v7_final.html is in Slack. So are v1 through v6."). Cost: $0 extra (creative made). Days: 7 measured. Success: per I9's pre-registered rule (beat $0.38/session outright, or land >10% of clicks with I9 resolved). Nothing to do but verify the 9/22 pause and 10/1 resume actually happen
2. **Resolve I9 (9/15 spike attribution)** — needs-human #170: GA4 source/medium for exp-auto-27 on 9/15. 10 minutes of human time decides P1/P8's readings and exp 6's bar
3. **I7 funnel check** — needs-human #171: verify GA4 sign_up event wiring from the LP, then judge the LP itself. Until this resolves, *no paid result can reach the north-star metric*, which caps the value of every other idea
4. **Re-establish the P9 reply routine** (best per-dollar result to date). Blocked on: weekly research emitting target_people/reply candidates (#23; research_observations has none). What: weekly job proposes 1–3 posts asking for the product + draft replies as a needs-human issue. Success: a second $0 conversion within 24h of a reply
5. **Static promoted post from keyframe stills** (attacks I2/P6). $0 creative — the Playwright keyframes already exist. 5 days, October, only if creative 29 underperforms its bar. Success: landed sessions/$ ≥ creative 29's
6. Five 27-lineage hooks (P11 consequence, pre-registered 9/14). Three exist as creatives 28–30 (Vercel-deploy, Slack version pile, human courier). Strategist's two additions for the next generation round: **(d)** read-only artifact pain: "Your team reviews the agent's doc in a read-only artifact. Comments go… where?" (@crod_ai / @akshatag77 observations); **(e)** stale-paste pain: "You pasted the agent's doc into Notion. The agent rewrote it an hour ago." Both name a workaround, both honest to the LP
7. Landing page variant per creative (`?v=`). *Parked: one variable at a time; exp 6 first*
8. Ask Grok research for pains people complain about in replies. *Still blocked on the weekly research → knowledge pipeline (#23)*

## Reversals log

- **2026-09-07 — P4 refuted.** "Clicks convert to landed sessions at a reasonable rate" overturned by the first 5 days of GA4 data: 18/115 = 15.7% vs the pre-registered 30% bar (I1). Consequence: CTR demoted to early-kill guard; deciding metric is cost per landed session (`decide.ts`, verified 9/7). **9/14:** strengthened — w2 7.8%, cumulative 11.7%. **9/21:** consistent — w3 10–27% (I9-dependent), still under 30%.
- 2026-09-14: P5 (keyword targeting) refuted. 16 days optimizing creatives while the audience premise was wrong. Rule: answer Who / Message / Action before touching creatives.
- **2026-09-21 — P10's footage half refuted.** Real screen footage (c8) lost to keyframe motion (c27) on link CPC ($0.262 vs $0.108) and sessions (1 vs 19; 1 vs 6 spike-excluded) in 7 days on one line item. Caveat: the optimizer starved c8, so this is defeat-under-the-optimizer, not a balanced test — but that is the deployment reality any format must survive. The workaround-hook half of P10 carries on in experiment 6.
- **2026-09-21 — trust-in-own-books reversal (I10).** For six days every agent read $38.41 spent when reality was ~$29.7, because a stopped deployment's campaign-level fallback double-counted the live arms. Lesson: an attribution path that *can* double-count *will*, exactly when the entity structure changes; the ledger now has a delivery kill switch and the sync refuses ambiguous fallbacks (PR #169).

### P11 (supported 2026-09-21): モーショングラフィックス広告は実録より安くセッションを取る

- creative 8 (v1 実録) と creative 27 (キーフレーム + H3 Max Turbo、14 秒) を同じ line item で 9/14–9/20 並走。判定は事前登録どおりリンククリック単価と GA4 セッション
- 結果: 27 が CPC $0.108 vs $0.262、セッション 19 vs 1(9/15 スパイク除外でも 6 vs 1)で完勝 → keyframe-motion を既定の制作フローに(実施済み: experiment 6 の creatives 28–30)。hook 5 本は Ideas #6
