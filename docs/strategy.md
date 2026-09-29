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

> **Owner decision 2026-09-26: paid media is stopped.** Do not deploy, resume or
> re-budget X ads. `config.budget.paidMediaEnabled = false` enforces this in code and
> CI pins it, so only a human can turn it back on. Why: at $30/month about 34 people
> land per month; at the site-wide ~1% sign-up rate the expected result is 0.3
> sign-ups/month, so this budget cannot answer the Goal either way. September: ~$33
> real spend, 34 first-time paid users, 0 `sign_up_start`, 0 `sign_up` (#171, GA4
> sign_up tracking verified: 120 site-wide in September). Meanwhile ~80% of
> September sign-ups came from people signing in to view an artifact shared with
> them. The strategist should treat paid-channel ideas as `parked` and put its
> weekly effort into the owned surfaces (shared-artifact viewers, reply-to-pain).

> Note 9/28 (strategist): this review folds the owner decision into the premise tree.
> Final paid-channel books, lifetime: **$37.5 spend, 62.6k impressions, 408 clicks,
> 48 GA4 sessions (50 incl. 2 diag), 34 first-time users by `firstUserCampaignName`,
> 0 sign-ups** (#171 resolved 9/26: measurement hypothesis rejected, GA4 counted 120
> site-wide sign_ups 9/1–9/25). Experiment 6 was truncated by the budget guard after
> 2 days (creative 29: 4,721 imp, 9 clicks, $1.40, 1 session) — no verdict, and none
> possible now. Paid premises P1/P2/P3/P7/P8 move to `parked`; I9 and I10 close;
> the live tree is now P9 (reply-to-pain) and P12 (the product's own share loop).

## Goal

Find out whether AI-native autonomous ad operations can bring real developers to
Artifact Share within a hard budget ($30/month ads, $10 creative, $10 AI).
North-star KPI: cost per first successful share. Until that is measurable, decide
on **cost per landed session (GA4)**; treat CTR only as a guard against dead
creatives. See `src/ops/decide.ts`.

**Status 9/28: the paid half of this question is answered — no.** $37.5 lifetime
bought 48 sessions and 0 sign-ups; at this budget the expected sign-up rate
(~0.3/month) can never reach the north-star metric. That is a real answer, not a
failure of the lab: the loop (generate → deploy → measure → decide) worked, and it
measured its way to "this channel cannot carry this product at this budget." The
question that remains open is the second half: can the same autonomous loop drive
acquisition through the **owned surfaces** — replies to people asking for the
product (P9), and the product's own share loop, which produced ~80% of September's
149 sign-ups (P12)? North-star KPI unchanged: cost (now mostly effort) per first
successful share.

## Who / Message / Action (backward chain; the strategist rewrites this weekly)

Updated 2026-09-28 (strategist). The *who* did not change; the *channel* did, and
that sharpens who we can actually reach:

- **Expected action**: unchanged — sign up, post the first artifact via CLI or MCP, and get one teammate comment. Not a landing, not a sign-up alone.
- **Why they act**: unchanged mechanism, but the September data names the trigger precisely: sign-up happens overwhelmingly when **someone shares an artifact with them** (~80% of September's 149 sign-ups were people signing in to view a shared artifact — owner data, 9/26 note above). The moment of need is most often *being on the receiving end of a share*, not seeing an ad. $37.5 of ads produced 0 sign-ups; one teammate's share link produces one reliably.
- **Who**: two answers now. (a) The *poster* profile holds: CTOs / founding engineers of 2–9 person en AI-native teams reviewing agent-written design docs together. 9/28 adopter-signals check: the paying en team workspace is still the deepest user (380 posts / 2,101 versions, active 9/28); the 7-member external workspace that best matches the profile went **quiet after 9/22** (45 posts, 48 comments, last_active 9/22) — watch it; if it stays quiet 14+ days that weakens the evidence base for this profile. (b) The higher-volume convert is the **invited viewer**: a teammate of an existing poster. They sign up at far higher rate than any ad audience — but they stall before posting: of September's 19 joined-workspace sign-ups, **2 posted and 0 received a comment** (`data/adopter-signals.json` external_start_funnel). That 19→2 gap is now the largest measured leak in the whole funnel we can see.
- **Message**: core unchanged — "any agent, owned by the team, reviewed at one URL that keeps updating." Competitor check 9/28: Showly's push ("Don't leave great agent work buried in a chat. Start free") still omits team ownership and the comment→agent loop, so the differentiation line stays valid. The workaround-naming hook hypothesis (experiment 6) was never tested on paid — it carries to owned surfaces at $0: replies and organic posts can use the same hooks and the same keyframe videos (creatives 28–30 exist, already paid for).
- **Format**: P11 stands as a production learning (keyframe motion beat real footage decisively) and applies to any future video, organic included.
- **Channel**: owned surfaces only. (a) **Reply-to-pain** (P9): still the single best per-unit result of the entire experiment ($0 → sign-up + first share + teammate view in 7 minutes, 9/14) and still not a routine — `research_observations` has one `target_people` row and it says INSUFFICIENT_DATA (#23). (b) **Organic posts from @techtalkjp**: the 9/15 organic post hit 5,247 views — more sessions in a day than the ads ever bought — which is exactly why the 9/15 spike polluted the paid books (old I9). What was a measurement nuisance for ads is direct evidence for this channel.

## Premises (challenge these every week)

| # | Premise | Status | Evidence / why |
|---|---|---|---|
| P1 | X (Twitter) video ads are a channel where AI-native developers can be reached for ~$1.5/day | **parked — answered "not at this budget" (9/28)** | Sessions were buyable ($0.46–$1.32/session depending on the I9 reading) but the arithmetic is terminal: lifetime $37.5 → 408 clicks → 48 sessions → **0 sign-ups**; 34 first-time paid users, 0 sign_up by `firstUserCampaignName` (#171). At $30/month the expected sign-up rate is ~0.3/month — the channel cannot reach the north-star metric either way, so the owner stopped it 9/26. The I9 ambiguity died with the channel; the pending "channel failure" rule never needed to fire. Reopening requires a human and roughly 10× budget (owner's estimate) |
| P2 | Pain-first framing ("AI made the file, sharing is still manual") beats feature framing | parked on paid (9/28); hypothesis carries to owned surfaces at $0 | Experiment 6 — the first clean message test — was truncated by the budget guard after 2 days (creative 29: 4,721 imp, 9 clicks, $1.40, 1 session; 9/22–9/23). 9 clicks decide nothing (5-day/10k-imp rule). The workaround-naming hooks and the paid-for keyframe videos (creatives 28–30) remain usable in replies and organic posts, where the message hypothesis can still be probed for $0 (Ideas #2) |
| P3 | CTR is a usable early signal at this budget | parked (9/28) | Was `supported` as an early-kill guard; no paid delivery to guard anymore. The 9/21 caveat stands for any future reader: X's optimizer allocation confounds per-arm CTR |
| P4 | Clicks convert to landed sessions at a reasonable rate | **refuted** (9/7; final 9/28) | Final books: 408 lifetime clicks → 48 sessions ≈ **12%** vs the pre-registered 30% bar. And the deeper 9/26 finding is that even the sessions didn't matter: 48 sessions → 0 sign-ups. The funnel didn't leak at one stage; it leaked at every stage |
| P5 | US/UK/CA/AU English + AI-coding keyword targeting reaches the right people | refuted (9/14; closed) | Final record: 33,091 imp, 301 clicks, $24.77, landing 15.7%→7.8%, 0 sign-ups |
| P8 | Follower look-alikes of accounts that voice the adopter profile reach people closer to the real adopters than keywords | parked (9/28) — leaning supported, bar never met | Final look-alike record: 29,567 imp, 107 clicks, $12.75, 21 sessions (8 excluding the 9/15 spike), 0 sign-ups. Directionally better than keywords on landing rate (10–27% vs 7.8%) but the ≥30% bar was never met and the test is over. If paid ever restarts, start from look-alikes, not keywords |
| P9 | Replying (from @techtalkjp, with a real-loop video) to posts that ask for the product converts better per unit of effort than any paid tactic did per dollar | **testing — now the primary channel premise (9/28)** | Still exactly one datapoint, and it is still the best result of the entire experiment: 9/14, $0 → sign-up + first share + teammate view in 7 minutes. The routine still does not exist: zero replies sent 9/15–9/28, and the only `target_people` research row (9/21) says INSUFFICIENT_DATA (#23). With paid gone this is no longer "fix before more paid optimization" — it is the whole acquisition motion. Ideas #1 |
| P6 | 5-second AI-generated video (H3 Max, text burned in post) is the right format | refuted (9/14) → superseded by P11 | |
| P10 | Real loop footage + a hook that names the viewer's current workaround beats generated video on landed sessions per dollar | refuted on the footage half (9/21); hook half untested (exp 6 truncated) | See P2. The hook half moves to owned surfaces |
| P11 | モーショングラフィックス広告は実録より安くセッションを取る | **supported (9/21; stands as production learning)** | c27 beat c8 on link CPC ($0.108 vs $0.262) and sessions (19 vs 1). With paid stopped this no longer picks ad arms, but it fixes the production flow for any future video, organic posts included: Playwright keyframes + H3 Max Turbo I2V |
| P7 | A 7-day generation cycle balances signal vs exploration | parked (9/28) | No paid delivery to cycle. The generation pipeline stays available for organic/reply assets on demand |
| P12 | The product's own share loop — existing users sharing artifacts, viewers signing in to see them — is the primary acquisition channel, and converting those viewers into first-time posters is the highest-leverage work available | **assumed → testing (opened 9/28)** | Evidence for the first half: ~80% of September's 149 sign-ups were viewers of shared artifacts (owner, 9/26); paid produced 0 of them. Evidence the second half is where it breaks: September joined-workspace starts — 19 sign-ups → 2 posted → **0 got a comment**; August was 25 → 5 → 3. The viewer→poster leak (~90%) is now the largest measurable gap between sign-up and the north-star event (first successful share). Most levers are product-side (needs-human, I11); the lab's part is keeping the funnel measured weekly via `data/adopter-signals.json` and proposing concrete nudges with numbers attached |

## Open issues

- I1 (from P4): closed 9/7 — rule fired, CTR demoted to early-kill guard. See Reversals log
- I2 (from P1, P6): **closed 9/28** — static-vs-video on paid is moot (paid stopped). The underlying insight (Playwright stills are free creatives) survives in the organic-post idea (Ideas #2)
- I3 (from P7): closed 9/28 — no paid cycle to tune
- I4 (from P5): closed 9/28 — no targeting to break down anymore
- I5: closed 9/7 (GA4 syncing since 9/2)
- I6: closed 9/21 (deploy path worked)
- I7 (from Goal): **resolved 9/26 (#171), and it resolved the Goal's paid half.** Hypothesis (b) — broken measurement — rejected: GA4 counted 120 site-wide sign_ups 9/1–9/25, matching product logs. By `firstUserCampaignName`, the paid campaigns produced 34 first-time users and **0 sign-ups** (exp001 25, exp-auto-27 7, exp-auto-8 1, exp-auto-29 1). Hypothesis (a) never needed a verdict of its own: the owner concluded the volume can't answer the question at any plausible LP conversion rate and stopped the channel. GitHub issue closed by this review
- I8 (meta, from 9/14): the agents' output path. **Mostly closed 9/26–9/28**: the root cause was GitHub's server-side merge ignoring `merge=union`, fixed structurally by one-file-per-entry journals (#186) plus UNKNOWN-PR salvage (#183/#184); stuck PRs #168/#177 merged. #107 (action_required approval latency) remains the open remainder
- I9 (from P1/P8/P11): **closed 9/28 — moot.** The 9/15 spike no longer decides anything: P1/P8 are parked with the channel and experiment 6's pre-registered bar will never be judged. What survives is the flip side: whatever the spike's exact attribution, @techtalkjp's organic post (5,247 views) moved more traffic in a day than the ads did — direct evidence for the owned channel (P12/Ideas #2). GitHub issue #170 closed by this review (its other ask, "stop delivery today", was overtaken by the 9/23 guard pause and the 9/26 owner stop)
- I10 (from Goal/P1): **closed 9/28 — the guard worked, and the books are final.** The budget guard paused line item xirso at the 9/23 run. A 9/22 re-sync with pre-fix code re-introduced $10.20 of double-count; removed again 9/26 with the salvage fix (#183). Final September ledger: **$33.15 real vs the $30 cap (~$3 over, disclosed)**. Aftermath hardening (owner, 9/26): daily cap $1.5→$1 with a CI check that daily×30 ≤ monthly, `syncDailyBudget` keeps X-side line-item budgets equal to config, and `paidMediaEnabled=false` is CI-pinned
- I11 (opened 9/28, from P12): **the viewer→poster leak.** September: 19 joined-workspace sign-ups → 2 posted → 0 got a comment; the north-star event (first successful share) almost never happens for the people most likely to sign up. Levers are product-side (post-view nudge, first-post CTA, comment prompts) — needs-human issue with the numbers and concrete proposals → **#192**
- I12 (opened 9/28, from P9): **reply-to-pain has no pipeline.** The one motion with a proven conversion depends on weekly research emitting `target_people` / reply candidates, which has never worked (single row, INSUFFICIENT_DATA; #23). Until it does, P9 stays a one-datapoint premise. Spec written on #23 by this review

## Ideas backlog (not scheduled; the strategist ranks these weekly)

Ranked 2026-09-28. Every paid idea from 9/21 is parked with the channel; the backlog
is rebuilt around the two live premises (P9, P12):

1. **Make reply-to-pain a weekly routine** (attacks P9, the only proven conversion). What: weekly research finds 1–3 recent X posts asking for exactly this product (the @akshatag77 pattern: "is there a shared workspace humans and agents can both use?"), drafts a reply with the real product URL, and files a needs-human issue for @techtalkjp to send. Cost: $0 media, AI budget only. Days: pipeline spec on #23 now; first candidate batch next weekly research run. Success: a second $0 → sign-up conversion within 24h of a sent reply. Blocked on #23 (I12)
2. **Organic post of the experiment-6 videos from @techtalkjp** (attacks P2's message hypothesis at $0 and probes P12's top-of-funnel). What: post creative 29's video (already produced and paid for; hooks 28/30 as follow-ups on later weeks) organically with a utm-tagged link. The 9/15 precedent: one organic post, 5,247 views, ≥13 same-day sessions — more than any ad day. Cost: $0. Days: 7 per post. Success: sessions/post ≥ the best paid week's weekly total (20), or any sign_up with `firstUserSource=t.co` organic. needs-human (posting is the owner's account) — folded into the I11/I12 issues
3. **Close the viewer→poster leak** (attacks P12/I11; north-star adjacent). What: product-side nudges for joined viewers (first-post CTA after viewing, "reply to this comment with your own artifact" prompts). The lab's contribution: the weekly adopter-signals funnel as the measurement, plus concrete proposals — filed as needs-human. Success: joined-workspace posted-rate recovers from 2/19 (Sept) toward 5/25 (Aug) or better
4. **27-lineage hooks (d) read-only-artifact pain, (e) stale-Notion-paste pain** — kept from 9/21, now as organic/reply copy rather than ad creatives. $0, generate only when idea #2 needs a next post
5. **Static stills as organic images** — kept from I2's insight; only if video posts underperform text+link replies
6. Landing page variant per creative (`?v=`). *Parked with paid*
7. **Paid restart at ~$300/month** — the owner's own estimate of the budget a real verdict needs. Parked as needs-human; not this lab's call. If it ever happens: start from look-alikes (P8), keyframe format (P11), workaround hooks (P2), and a pre-registered sign-up (not session) bar

## Reversals log

- **2026-09-07 — P4 refuted.** "Clicks convert to landed sessions at a reasonable rate" overturned by the first 5 days of GA4 data: 18/115 = 15.7% vs the pre-registered 30% bar (I1). Consequence: CTR demoted to early-kill guard; deciding metric is cost per landed session (`decide.ts`, verified 9/7). **9/14:** strengthened — w2 7.8%, cumulative 11.7%. **9/21:** consistent — w3 10–27% (I9-dependent), still under 30%.
- 2026-09-14: P5 (keyword targeting) refuted. 16 days optimizing creatives while the audience premise was wrong. Rule: answer Who / Message / Action before touching creatives.
- **2026-09-21 — P10's footage half refuted.** Real screen footage (c8) lost to keyframe motion (c27) on link CPC ($0.262 vs $0.108) and sessions (1 vs 19; 1 vs 6 spike-excluded) in 7 days on one line item. Caveat: the optimizer starved c8, so this is defeat-under-the-optimizer, not a balanced test — but that is the deployment reality any format must survive. The workaround-hook half of P10 carries on in experiment 6.
- **2026-09-21 — trust-in-own-books reversal (I10).** For six days every agent read $38.41 spent when reality was ~$29.7, because a stopped deployment's campaign-level fallback double-counted the live arms. Lesson: an attribution path that *can* double-count *will*, exactly when the entity structure changes; the ledger now has a delivery kill switch and the sync refuses ambiguous fallbacks (PR #169).
- **2026-09-28 — the Goal's paid half answered: no (owner decision 9/26, folded into the tree this review).** Not one premise flip but the whole branch: $37.5 lifetime → 408 clicks → 48 sessions → 0 sign-ups (34 first-time users, 0 sign_up by first-touch attribution, #171), while the product's own share loop produced ~80% of the month's 149 sign-ups for $0. Lesson for the lab: we spent four weeks optimizing *within* the channel (creatives, hooks, targeting, format) while the decisive comparison was *across* channels, and the winning channel's data was in our own database (`adopter-signals`) the whole time. The 9/14 rule generalizes: answer Who / Message / **Channel** before optimizing anything inside one.
- **2026-09-28 — experiment 6 aborted, not failed.** Creative 29 got 2 days / 9 clicks / $1.40 / 1 session before the budget guard (correctly) stopped it. No verdict on workaround-naming hooks; recorded so nobody later reads its 1 session as a result. The hypothesis and the paid-for videos move to owned surfaces (Ideas #2).

### P11 (supported 2026-09-21): モーショングラフィックス広告は実録より安くセッションを取る

- creative 8 (v1 実録) と creative 27 (キーフレーム + H3 Max Turbo、14 秒) を同じ line item で 9/14–9/20 並走。判定は事前登録どおりリンククリック単価と GA4 セッション
- 結果: 27 が CPC $0.108 vs $0.262、セッション 19 vs 1(9/15 スパイク除外でも 6 vs 1)で完勝 → keyframe-motion を既定の制作フローに(実施済み: experiment 6 の creatives 28–30)。hook 5 本は Ideas #6
