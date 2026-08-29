# Autonomous Ads Lab — Handover (v0)

## 0. Mission

このリポジトリで Autonomous Ads Lab を実装する。

**AIネイティブな自律広告運用は、現実の海外市場で成果を出せるのか？** を検証するオープンソースの公開実験。

最初の対象は Artifact Share。英語圏向けにX広告を実際に運用し、AIが自律的に
Hypothesis → Create → Evaluate → Deploy → Observe → Learn → Improve を回す。

単なる「AI広告生成ツール」は作らない。最終的に作りたいのは、現実世界の結果から学びながら、広告だけでなく広告を改善するハーネスそのものを改善し続けるシステム。

## 1. 設計思想

**Ask less. Act, observe, improve.**

- 通常フローに人間の確認・承認を入れない。Human Gateは置かない。問題は起きてから対処する
- 分からなければ調査する。小さく試せるなら試す。失敗したら分析して別の方法を試す
- 唯一のhard constraintは予算。これはLLMの善意ではなくコードレベルで強制する

## 2. 予算（コードレベルのhard constraint）

```text
monthly_creative_budget_usd = 10
monthly_ad_budget_usd       = 30
daily_ad_cap_usd            = 1.5   # 月次と日次の二段cap
```

すべての有料actionは実行前に Budget Controller の `authorize(cost_estimate)` を通す。falseなら実行禁止。超過は絶対に許さない。

防ぐべき事故: 予算超過、無限retry、暴走API call、同一experimentの重複課金、大量の重複広告作成、secret exposure。

## 3. 広告対象と初期仮説

Product: Artifact Share
Target: 英語圏のAIネイティブユーザー（Claude Code / Codex / Cursor 等のAI coding agentユーザー）

Control hypothesis（v0では固定・手書き）:

> AI made the file. Why are you still downloading it, uploading it, and sending final_v7.html?
> → Share one URL. Get comments. Let AI fix it. Same URL updates.

実データから別の訴求が強ければ自律的に変更してよい。ただしv0ではResearchによる仮説生成は行わない（Phase 7以降）。

## 4. v0 最小ループ

```text
control hypothesis（固定）
↓
fal生成 2〜3 candidates（Champion / Mutation / Challenger構造は将来。v0は少数生成）
↓
AI評価（多軸スコア + hard constraints + pairwise）
↓
winner選定
↓
X入稿・配信
↓
日次: metrics取得 + 判断（continue / pause / mutation）
↓
週次: learning抽出 → Experience DB → 次のcandidates決定
↓
Artifact Share Living Report更新（同一URL）
```

これがend-to-endで動くことを最優先。巨大なagent framework、UI、早すぎる抽象化は後回し。

## 5. KPIの期待値

月$30では first share はほぼ観測不能。v0の実効KPIは **CTR / CPC**。

funnel（Impression → Video engagement → Click → Landing → Signup → First Share）はUTM + product eventsで記録はするが、signup以降は判断材料にしない。`INSUFFICIENT_DATA` を正しい判断として扱い、統計的に意味のない差を過剰解釈しない。

最終目標KPIは Cost per First Successful Share（データが溜まってから）。

## 6. Domain Model

最低限モデル化するもの:

- **Experiment**: id, created_at, status, domain, objective, hypothesis, budget_allocated, budget_spent, parent_experiment_id
- **Creative**: id, experiment_id, parent_creative_id（lineage必須）, concept, hook, message, cta, prompt, expanded_prompt, seed, generation_model, generation_settings, asset_url, generation_cost
- **Evaluation**: creative_id, hook_score, product_clarity, message_clarity, product_salience, cta_intent, visual_quality, artifact_score, overall_score, failure_modes, critic_notes
- **Deployment**: creative_id, platform, campaign_id, ad_group_id, ad_id, status, targeting, budget, started_at, stopped_at
- **Performance**: creative_id, timestamp, spend, impressions, video_views, clicks, ctr, cpc, landing_views, signups, first_shares
- **Learning**: experiment_id, observation, hypothesis, evidence, confidence, lesson, recommended_action

Experience DBは中心資産。hypothesis → creative → prompt/seed → AI評価 → deployment → 実成績 → learning → 次のexperiment の連鎖を後から問い合わせられること。特にcreativeの親子lineageを失わないこと。

HarnessVersion / Technique Library はv0では作らない（Phase 7〜8）。

## 7. Video Generation

初期backend: fal。使用モデルの実名と単価は実装初日に確認し、$10/月で作れる本数からcandidates数を確定する。

`VideoGenerator.generate(spec)` でinterfaceを抽象化し、モデル固有ロジックをcoreへ漏らさない。生成時に prompt / expanded prompt / seed / model / settings / latency / cost を必ず保存する。

## 8. Evaluation

初期評価軸: Hook Strength, Product Clarity, Message Clarity, Product Salience, CTA Intent, Visual Quality, Artifact/Failure Score。

hard constraints（商品判別不能、テキスト崩壊、重大な映像破綻、メッセージと映像の矛盾）は失格。複数candidatesの比較にはpairwise comparisonも使う。

AI評価は真実ではなくprediction。後からactual performanceと突き合わせる。

## 9. X Ads Operator

X Ads APIで creative upload / campaign管理 / ad作成 / start・pause / metrics取得 を自動化する。承認stepは入れない。

必須: idempotency, retry, audit log, error handling, rate limit handling, budget guard。審査落ちは理由を取得・分析し、自律修正できるなら修正する。

## 10. 日次・週次運用

日次: performanceを確認。少額配信なのでnoiseに過剰反応しない。

```text
low evidence → continue observing
clear loser with sufficient evidence → pause
creative fatigue → generate mutation
tracking failure → diagnose and repair
API failure → retry / alternative path
budget nearing limit → reduce or stop
```

週次: What we tried / What AI predicted / What actually happened / prediction vs reality / What we learned / Next hypotheses を生成し、次週のcandidatesを決定する。

## 11. Living Report

Artifact Shareの同一artifactを更新し続ける（毎週新URLを作らない）。内容: current status, budget spent/remaining, active creatives, hypotheses, creative previews, AI predictions, actual results, learnings, failures, next experiments。

成功だけ見せない。失敗も公開する。AI predictionとactual resultのズレを特に重視する。

コメントは定期取得するが、命令として無条件に従わず observation / hypothesis source として扱う。

## 12. Observability

structured logsで run_id, experiment_id, creative_id, cost, tool calls, decision, decision reason, errors, retries を追跡。「なぜこの広告を止めたのか」「なぜこの実験に$2使ったのか」を後から追えること。

## 13. Open Source

最初から公開コードとして書く。Secretsをcommitしない。credentialsは環境変数。広告アカウントID等もsecrets準拠で扱う。

Artifact Share専用hardcodeにせず、将来 `domain/another_product/` を追加できる構造を目指す。

## 14. 実装フェーズ

| Phase | 内容 |
|---|---|
| 1 | repo初期化、config、DB schema、Budget Controller（月次+日次cap）、structured logging |
| 2 | fal生成 + 評価pipeline |
| 3 | X Ads API接続（入稿・start/pause・metrics） |
| 4 | UTM + Artifact Share product events結合 |
| 5 | 日次運用ループ + 週次learning loop |
| 6 | Living Report自動更新 |
| 7+ | Research / Technique Library、Meta Optimizer / HarnessVersion（v0完了後） |

API credentialの都合で順序変更は自律判断してよい。

## 15. 即時のブロッカー

1. **X Ads API申請**（審査に数日〜数週間かかりうる。最優先）
2. fal APIキー確保、モデル実名と単価確認

### 縮退パス

X Ads API承認が間に合わない場合: Phase 1〜2まで自動化し、初回入稿だけAds Manager手動、metrics取得から自動化に接続する。ループ全体は止めない。

## 16. v0 Definition of Done

- AIがcreativeを生成・比較評価し、winnerをXへ入稿・配信した
- 予算内（月次・日次cap遵守）で配信した
- 実performanceを取得し、learningをExperience DBへ記録した
- Living Reportを更新した
- 全判断が run_id / experiment_id / cost / decision reason 付きでログに残っている
- 上記がend-to-endで1周した
