# Autonomous Ads Lab

An open experiment: **can AI-native autonomous ad operations produce real results in a real overseas market?**

The first subject is [Artifact Share](https://artifactshare.com). AI autonomously runs X (Twitter) ads targeting English-speaking AI-native users, cycling through:

```text
Hypothesis → Create → Evaluate → Deploy → Observe → Learn → Improve
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
daily_ad_cap_usd            = 1.5
```

Every paid action passes through the Budget Controller's `authorize(cost_estimate)` before execution.

## Current experiment

Control hypothesis: *"AI made the file. Why are you still downloading it, uploading it, and sending final_v7.html?"* → *Share one URL. Get comments. Let AI fix it. Same URL updates.*

Live results are published as a continuously-updated Artifact Share report (same URL, updated weekly).

## How it works

See [HANDOVER.md](HANDOVER.md) for the full design and implementation plan.

## Running

Secrets are never committed; provider credentials come from environment variables. Setup instructions will land here as the implementation progresses.
