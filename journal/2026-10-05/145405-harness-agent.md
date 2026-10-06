## 14:54 JST — harness-agent (automated)

### Done

- 状況把握: `pnpm db:init` → run_logs 599行(最新 2026-10-05T00:50Z)、`gh run list` / `gh issue list` / journal 直近、マージ済みPRとopen issueの突き合わせ
- **先週のNextを3件実測**:
  - PR #195 の効果を確認してクローズ: **#194**。今日の daily journal に `watchdog: no metrics for 2026-10-04 — expected, paid media is off` が出ており、run_logs も `warn metrics_stale` ではなく `info metrics_idle`。Slack の ⚠️ は止まっている。`Closes #194` が自動クローズ不発(#136)だったので手動クローズ
  - **10月の ads は $0.00**(`budget_ledger` 10/1以降: ai $0.3373 のみ、ads/creative は0行)。月替わりで `adsCapReached` が false に戻っても `paidMediaEnabled=false` が resume を止める経路は本番で効いた。9月の ads は $33.15/$30 で確定、増えていない
  - **salvage 経路 (#176) は依然 cold。`stalled_pr_salvaged` は run_logs に0件**。しかも cold な理由が判明したので下記の修正に繋げた
- **起票 + 修正 + auto-merge: #207 → PR #208** (停滞PR復旧がブランチ接頭辞 allowlist に縛られていた)
  - `selectRecoverable` が救済対象を `RETRY_WORKFLOWS` と `auto/` 接頭辞で絞っていたため、strategist / harness が出した PR は DIRTY になっても**非破壊の `salvageBranch()` にすら到達しなかった**
  - 証拠2件。**#106** (`strategist/2026-09-07-weekly-review`) は 09-09〜09-14 の6日間 DIRTY 放置、同じ daily 実行の中で隣の `auto/Weekly-Learning-*` は毎回 `stalled_pr_recovered` している。**#177** (`auto/harness-journal-20260921-051258`) も 09-23 に DIRTY になったが `retryWorkflowFor` が null なので対象外、結局 09-26 02:47Z にオーナーが手でマージして解消している
  - 入口を接頭辞ではなく**作者** (`isBotAuthored`) で判定するよう変更。破壊的な `gh pr close --delete-branch` + dispatch の制約は `recoverOne` 側に移し、retry workflow が無い PR は `throw` ではなく `'skipped'` を返して open のまま報告を続ける
  - `fix/` / `improve/` は人間も使う規約なので**接頭辞で広げてはいけない**のが要点。salvage はブランチにマージコミットを push するため。`coji` 作者の `improve/` / `fix/` PR が「報告はされるが救済されない」ことを回帰テストで固定した
  - テスト4本追加 (118→121)。追加した4本すべてが**修正前のコードに対して赤くなることを実測**(src だけ `git stash` で戻して 4 failed / 23 passed)。`pnpm typecheck && pnpm test` green、auto-merge 設定済み
- **#107 に新事実を追記**(「今週も再発した」の繰り返しではない部分だけ)
  - 4本の棚卸しで**途中まで入った対処が2本とも片側だけ**だと判明: `weekly.yml` は `actions: write` だけで承認ステップが無く、`strategist.yml` は承認ステップだけで `actions: write` が無い
  - **`strategist.yml` の承認ループは権限以前に到達不能**。commit ステップ内に inline で置かれているが、手前の `if git diff --cached --quiet; then exit 0; fi` で必ず抜ける。strategist エージェントは自分でブランチを切って PR まで作る(今日の #206 のブランチが `improve/strategist-...` で、このステップが作るはずの `auto/strategist-...` ではない)ため、ステップは常にステージ無しで `exit 0` する。今日の run 37255197433 のログが 02:31:51.403Z `No stash entries found.` → 02:31:51.414Z `Post job cleanup.` と11msで繋がっており、**`sleep 30` が走っていない**ことで裏付けられる。ステップは `success` で終わるので失敗としても見えない
  - PAT 回避路が無いことも確認: `action_required` になるのは `actor.login` が `github-actions[bot]` の run のみ(アクターが `coji` の #204 の CI run 37249948136 は `success`)だが、workflow 内の secrets 参照は `GITHUB_TOKEN` だけで選べるトークンが無い
  - 人間の作業を3箇所の数行に落として提示。`if: always()` 付きの**独立ステップ**であることが効く条件だと明記した

### Spent

- 製品側のLLM予算消費 $0.00(このセッションは生成・仮説・評価の呼び出しを一切していない。調査は gh / git / sqlite のみ)
- harness-agent 自身の Claude Code 実行は `CLAUDE_CODE_OAUTH_TOKEN` のサブスクリプション側で、`budget_ledger` の `ai` カテゴリには計上されない。10月の ai 台帳は $0.3373/$10 で、これは daily の mentions / ad_reactions 呼び出し分
- 失敗して捨てた消費: なし

### Learnings

- **安全のための allowlist が、安全な処理まで一緒に塞いでいた**。#207 の `RETRY_WORKFLOWS` は「閉じて作り直せるのは冪等な daily/weekly だけ」という正しい制約だったが、それを `selectRecoverable` の入口に置いたせいで、閉じない・履歴も変えない `salvageBranch()` まで同じ条件で止まっていた。**制約は、それが守っている危険な操作のすぐ隣に書く**べきだった(今回 `recoverOne` に移した)。入口で絞ると、後から足した安全な経路が黙って巻き込まれる
- **検知側を直したときに復旧側は直っていなかった**。`BOT_AUTHORS` を足したコメント(`stalled-prs.ts:35-41`)は #106 が**報告されなかった**ことへの対処で、そこまでは正しい。だが報告されるようになった #106 はその後6日間**救済されずに報告され続けた**。「見えるようになった」で issue を閉じると、見えた後に何が起きるかの確認が抜ける
- **cold path が cold な理由を調べると設計の穴が出てくる**。先週は「`stalled_pr_salvaged` が0件」を観測だけして「次に DIRTY が出たら確認する」と Next に回した。今週 DIRTY の実例(#106 / #177)を遡ったら、**そもそも到達し得ない条件分岐だった**。cold path は「まだ発火条件が来ていない」のか「来ても発火しない」のかを区別しないと、待っているだけで永久に cold のままになる
- **「ステップを足した」と「ステップが動く」は別**。`strategist.yml` の承認ループは**書かれてから一度も実行されていない**。早期 `exit 0` の後ろに置かれており、しかも `|| true` と `success` なステップ結果に隠れて、ログを時刻単位で読むまで気づけなかった。`daily.yml` が同じ処理を `if: always()` 付きの独立ステップにしているのは正しい形で、inline にした時点で挙動が変わっていた。**対処を入れたら、その対処が走ったログを一度は確認する**
- **自分が出した修正PRも、またしても今日はマージされない**。PR #208 は作成直後から `BLOCKED` / チェック0件で、翌 00:49Z の daily の承認待ち。#107 が開いている間、harness-agent の改修は常に22時間遅れで main に着く。これは記録しておくが、今日の #107 への追記は「再発」ではなく **strategist.yml の到達不能と weekly/strategist の片側実装**という新事実のために書いた

### Next

- PR #208 が翌 00:49Z の daily 承認を経てマージされることを確認する。マージされたら次に DIRTY / long-UNKNOWN な bot PR が出たときに **`stalled_pr_salvaged` が run_logs に初めて出るか**を見る。出なければ `salvageBranch()` 自体(merge-tree / fast-forward push)に本番固有の失敗があるサインなので、`stalled_pr_recovery_skipped` との区別で切り分けて再起票する
- #107: 今日で**harness 側から取れる情報は出し尽くした**。残りは `weekly.yml` / `strategist.yml` / `harness.yml` の3箇所に `if: always()` の独立ステップを貼る(+ 後2本は `actions: write`)か、リポジトリ設定の *Approval for running fork pull request workflows* を緩めるかのオーナー2択だけ。次回は再発の追記を積まず、**新事実が無ければ何も書かない**
- `strategist.yml` の早期 `exit 0` 問題は #107 のコメントに書いたが、**承認とは独立した別の不具合**でもある(commit ステップの末尾に何を足しても動かない構造)。#107 が解決したあとも残るなら単独 issue に切り出す
- #192 (viewer→poster の漏れ、needs-human) は製品側の課題で harness の守備範囲外。9月は joined 19 → posted 2 → got_comment 0 のまま動いていない。10月の ads が $0.00 で配信も止まっているため、この数字が改善する経路が現状存在しないことだけ記録しておく
