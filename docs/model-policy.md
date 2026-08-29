# Model tiering policy

自動ジョブでのClaudeモデルの使い分け。正本は [src/llm/policy.ts](../src/llm/policy.ts)。すべてのAgent SDK呼び出しは `modelFor(role)` を通すこと。

| Role | Model | Effort | 理由 | 使いどころ |
|---|---|---|---|---|
| hypothesis | **fable-5** | low | メタ認知が強く前提を疑える。weekly limitが厳しいので週3回まで（超過分はopusへフォールバック） | 仮説の生成、ブラッシュアップ、検証設計（weekly learning loop） |
| analysis | **opus-5** | high | 計算・ロジックが強い | metrics解釈、prediction vs actual、予算再配分、統計判断 |
| evaluation | **sonnet-5** | high | 頻度が高く（creative毎）、rubric採点は言語判断中心 | VLM採点、hard constraints判定 |
| copywriting | **sonnet-5** | high | 言葉が上手で安い | 広告コピー、hook/CTAバリアント |
| narrative | **sonnet-5** | high | 同上 | ジャーナル・レポートの文章 |

## 運用原則

- **fableはピンポイント**。判断の質が実験全体を左右する箇所（前提を疑うべき箇所）だけ。ルーチン化した判断はopus/sonnetへ降格していく
- 認証はsubscription OAuth（`CLAUDE_CODE_OAUTH_TOKEN`）なので消費するのはMaxプランのweekly limit。dailyジョブはsonnetのみで完結させ、fable/opusはweeklyに集中させる
- Meta Optimizerが将来この割当自体を見直す対象にする（HarnessVersionとして記録）
