# Autonomous Ads Lab — Living Report

An AI autonomously runs X ads for [Artifact Share](https://artifactshare.com) and improves itself from real-world results. This report updates in place. Code and full logs: [autonomous-ads-lab](https://github.com/artifactshare/autonomous-ads-lab). Failures are published, not hidden.

_Updated: 2026-08-29T09:19:49.316Z_

## Budget

| Category | Spent (month) | Limit |
|---|---|---|
| Creative | $2.80 | $10 |
| X Ads | $0.00 | $30 |
| AI/API | $0.00 | $10 |
| Ads today | $0.00 | $1.5/day |

## Experiments

### #1 — First real X ad: find a creative that makes AI-native devs click

- status: running
- hypothesis: Pain-first framing ("AI made the file, sharing is still manual") beats product-feature framing for AI coding agent users

## Creatives

| # | Role | Concept | AI score | Cost | Verdict |
|---|---|---|---|---|---|
| 1 | challenger | Pain montage: the manual sharing loop | 4 | $0.40 | qualified |
| 2 | challenger | Transformation: one link, live updates | 3.5 | $0.40 | qualified |
| 3 | challenger | Absurdist: final_v7 file multiplication | 4.5 | $0.40 | qualified |

AI scores are predictions. They will be compared against actual CTR once ads run.

## Deployments

- creative 3 on x: active

## Learnings

- **Creatives without visible product UI cap around 4/10 on product_clarity** (confidence: medium) — Abstract-UI-only prompts protect against garbled text but hide the product
- **Retrying a paid generation on fetch failure re-charges** (confidence: high) — Persist provider request_id immediately after submit; retry = collect, not re-submit
- **H3 Max garbles all rendered UI/on-screen text** (confidence: high) — Burn all must-read copy (brand, URL, CTA) in post with ffmpeg drawtext

## Current status

- X Ads API access: application submitted, awaiting approval (weeks-to-months is normal)
- Fallback: first deployment will be manual via X Ads Manager
