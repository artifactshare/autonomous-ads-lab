# Autonomous Ads Lab

An open experiment: **can AI-native autonomous ad operations produce real results in a real overseas market?**

📊 **[Living Report](https://artifactshare.com/a/a68uv6pu0e)** — live status, budget, creatives, AI predictions vs actual results. Updated automatically at the same URL.
📋 **[企画書 / Project plan](https://artifactshare.com/a/m9gn48oo9z)** — the original plan behind this experiment (Japanese). The in-repo engineering handover is [HANDOVER.md](HANDOVER.md).

The first subject is [Artifact Share](https://artifactshare.com). AI autonomously runs X (Twitter) ads targeting English-speaking AI-native users, cycling through:

```text
Research → Hypothesis → Create → Evaluate → Deploy → Observe → Learn → Improve
```

This is not an "AI ad generation tool". The goal is a system that learns from real-world results and improves not only the ads but the harness that improves the ads.

## Philosophy

**Ask less. Act, observe, improve.**

- No human approval steps in the normal flow. Problems are handled after they occur, not gated in advance.
- The only hard constraint is the budget, enforced at code level — never by LLM goodwill.
- Small reversible action > asking a human.
- All results — including failures and the gap between AI predictions and reality — are published.

## Budget (hard limits)

```text
monthly_creative_budget_usd = 10
monthly_ad_budget_usd       = 30
monthly_ai_budget_usd       = 10
daily_ad_cap_usd            = 1.5
```

Every paid action passes through the Budget Controller's `authorize(cost_estimate)` before execution, and estimates are reconciled to actual costs. The limits are additionally pinned in a required CI check (`budget-guard`) that workflow tokens cannot modify — changing them requires a human. That is the project's single human gate.

## How it works

- **Creative**: fal (MiniMax H3 Max) generates video; readable copy (brand, CTA) is burned in post with ffmpeg because generated on-screen text is unreliable
- **Evaluation**: frame-based rubric scoring (7 axes + hard constraints) via Claude — treated as a *prediction* to be compared against actual CTR
- **Research**: Grok (x_search / web_search) monitors mentions, developer pain points, and ad techniques; findings enter a Technique Library and stay `discovered` until experiments validate them
- **Deployment**: X Ads (manual via Ads Manager until Ads API access is approved)
- **Self-improvement**: a weekly harness agent reads journals/logs/CI, files issues, and ships small fixes via PR with CI-gated auto-merge
- **Model tiering**: fable-5 only for hypothesis work (capped), opus-5 for numeric analysis, sonnet-5 for frequent language work — see [docs/model-policy.md](docs/model-policy.md)

## Transparency

- **[Living Report](https://artifactshare.com/a/a68uv6pu0e)** — public, updated in place
- **[journal/](journal/)** — daily work journal, written by humans and automated jobs alike, failures and costs included
- **[Experience DB event log](data/events)** — every hypothesis, creative (with lineage), evaluation, deployment, spend, and learning, as an append-only event log committed to this repo (the SQLite file is rebuilt from it on every run)

## Current experiment

Control hypothesis: *"AI made the file. Why are you still downloading it, uploading it, and sending final_v7.html?"* → *Share one URL. Get comments. Let AI fix it. Same URL updates.*

First campaign is live on X (US/UK/CA/AU, English, AI-coding keywords, ~$1.5/day).

## Running

```bash
pnpm install
pnpm test
pnpm tsx src/ops/daily.ts    # daily ops (budget check, Grok observation, report)
pnpm tsx src/ops/weekly.ts   # weekly research & learning
```

Secrets are never committed; credentials come from environment variables / GitHub Actions secrets: `FAL_KEY`, `XAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ARTIFACTSHARE_TOKEN`.
