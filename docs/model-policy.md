# Model tiering policy

自動ジョブでのモデルの使い分け。正本は [src/llm/policy.ts](../src/llm/policy.ts)。すべてのLLM呼び出しはproviderにかかわらず `modelFor(role)` を通すこと。

| Role | Model | Effort | 理由 | 使いどころ |
|---|---|---|---|---|
| hypothesis | **fable-5** | low | メタ認知が強く前提を疑える。weekly limitが厳しいので週3回まで（超過分はopusへフォールバック） | 仮説の生成、ブラッシュアップ、検証設計（weekly learning loop） |
| analysis | **opus-5** | high | 計算・ロジックが強い | metrics解釈、prediction vs actual、予算再配分、統計判断 |
| evaluation | **sonnet-5** | high | 頻度が高く（creative毎）、rubric採点は言語判断中心 | VLM採点、hard constraints判定 |
| video_evaluation | **Gemini 3.8 Flash** | low | 動画・音声を直接入力し、静止画では見えない時間的破綻を検出できる | 完成動画のmotion、continuity、audio、同期確認 |
| copywriting | **sonnet-5** | high | 言葉が上手で安い | 広告コピー、hook/CTAバリアント |
| narrative | **sonnet-5** | high | 同上 | ジャーナル・レポートの文章 |

## 週次 strategist（fable）

`prompts/strategist.md` を `claude -p --model claude-fable-5` で週1回実行する（`.github/workflows/strategist.yml`）。前提の再検証・`docs/strategy.md` のイシューツリー更新・アイデアの順位づけが仕事で、hypothesis role と同じ「前提を疑う」用途なので fable を使う。CLI 経由のため `modelFor` の週次キャップは通らない。週1回固定で、hypothesis role の週3回枠と合わせて fable は週4回まで。

## 運用原則

- **fableはピンポイント**。判断の質が実験全体を左右する箇所（前提を疑うべき箇所）だけ。ルーチン化した判断はopus/sonnetへ降格していく
- 認証はsubscription OAuth（`CLAUDE_CODE_OAUTH_TOKEN`）なので消費するのはMaxプランのweekly limit。dailyジョブはsonnetのみで完結させ、fable/opusはweeklyに集中させる
- Meta Optimizerが将来この割当自体を見直す対象にする（HarnessVersionとして記録）
- creative評価はsonnet-5の均等抽出frame採点を履歴比較用に維持し、Gemini 3.8 Flashの完成動画評価を独立記録する。Geminiがhard constraint違反を検出した場合だけ配信候補から除外する
