## 15:10 JST — harness-agent

### Done

- **#207 を手動クローズ**。PR #208(10/06 マージ)で修正済みだが `Closes #207` が自動クローズされなかった既知の挙動(#136)。
- **#107 の原因を特定し、診断を訂正**。タイトルは「承認ステップが daily.yml にしかない」だったが不正確。PRを開く4つの workflow が**それぞれ別の理由で**自分の `action_required` run を承認できていない:
  - `daily.yml`: 正常(独立ステップ + `if: always()` + `actions: write`)
  - `weekly.yml`: 承認ステップが存在しない(`actions: write` はある)
  - `strategist.yml`: 承認ループが同一 `run:` 内の `exit 0` の後ろにあり**到達不能**。加えて `actions: write` なしなので到達しても403
  - `harness.yml`: 承認ステップなし + `actions: write` なし
  
  承認呼び出しが `|| true` で包まれているため、どの失敗もログ上は成功と区別がつかない。issue タイトルを実態に合わせて更新し、適用手順(パッチ3点)をコメントに書いた。
- **PR #221**: このdriftを検出するテストを追加(`src/ops/workflow-approve-audit.ts` + `tests/workflow-approve-audit.test.ts`)。workflow YAML をテキストとして読む(YAMLパーサ依存なし、ci.yml の budget-guard と同じ流儀)。`pnpm typecheck && pnpm test` グリーン(21 files / 137 tests)、auto-merge 設定済み。

### Spent

- ads $0 / creative $0(`paidMediaEnabled: false`、オーナーのkill switch継続)
- AI 月累計 $1.06 / $10 — 今日の daily research $0.013(grok mentions)のみ。このセッション自体は `CLAUDE_CODE_OAUTH_TOKEN` 実行で `budget_ledger` には計上されない(ledger は grok の従量APIのみ記録)
- 失敗して捨てた支出はなし。workflow push の可否確認(probe branch)は無料

### Learnings

- **`.github/workflows/**` は GITHUB_TOKEN では push できない**。実測で確認: `refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission`。#107 の3つの修正は全部 workflow 編集なので、構造的に人間の作業。うち `strategist.yml`/`harness.yml` への `actions: write` 追加は、そもそもハーネスエージェントに禁止されている権限拡大。probe branch で確認して即削除した。
- **harness 自身も `actions: write` を持たない**ので、止まっている run を代行承認できない(実測403)。今朝止まっていた PR #218/#220 をこの場で救えなかった。
- **`strategist.yml` の到達不能はログで確定**。strategist エージェントは自分で `improve/` ブランチをコミットするため、最後のコミットステップに来た時点で stage するものが無く `if git diff --cached --quiet; then exit 0; fi` が発火する。run 38196576451 のログは `No stash entries found` の直後に `Post job cleanup`、承認出力ゼロ。**承認は独立ステップでなければならない**という設計上の教訓(daily.yml はそうなっている)。
- **ガードは「既知の壊れている分」で落としてはいけない**。CIが赤いと全自動実行が依存する auto-merge 経路ごと止まる。`KNOWN_BROKEN` を完全一致ではなく**上限**としてアサートした。人間が直してもCIは赤くならず、新規driftだけが落ちる。
- 自分の PR #221 も同じ理由で `action_required` に入った(run 38211113508)。actor は `github-actions[bot]` で daily.yml の信頼リストに含まれるため、明日の daily(~10:14 JST)で承認されCIが走る。問題そのものを自分で踏んでいる状態。

### Next

- #107 は人間待ち(`needs-human`)。パッチ3点はコメント済みで、適用後は `KNOWN_BROKEN` から該当ファイルを削除してよい(消し忘れてもCIは赤くならない)。
- #23 の残り(月1回の deep research → `prompts/knowledge/*.md` 更新)は未着手。reply_candidates 側は 10/5 に実装済み。新規 workflow を作れないので、`src/ops/weekly.ts` 側に月次カデンスのガードを置く形なら workflow 編集なしで実装可能 — ただし新規モジュール+予算連携+プロンプト+テストで1PRには大きいので、次回スライスして着手する。
- 観測: GA4 sessions が 29→28→27→26 と漸減、sign-ups は 0 継続。harness の範囲外だが strategist 向けのシグナル。
