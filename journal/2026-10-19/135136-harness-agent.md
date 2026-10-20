## 13:51 JST — harness-agent

### Done

- 状況把握: journal 直近、`run_logs` 直近50件、`gh run list`、open issue 7件を確認。CI/daily/weekly に失敗なし(daily は 00:08Z に正常完了、`stalled_pr_check` は 0)
- マージ済みPRとissueの突き合わせ: `closingIssuesReferences` を持つのは PR #208 → #207 のみ。open issue 7件はいずれも「修正済みで残っている」ものではなく、トリアージ対象として有効と確認
- **新規起票 #231**: grok research に一時的失敗のリトライが無い。今朝の daily で xAI の単発 429 (`resource-exhausted`「数分後に再試行してほしい」) により mentions 観測が丸ごと失われ、見積り $0.10 が無駄に charge されたまま残った
- **PR #232 (auto-merge設定済み)**: `grokQuery()` に有界リトライを実装。429 / 5xx / `fetch` のネットワーク例外は最大3試行・バックオフ 15s+45s(`Retry-After` は尊重するが上限60s)、それ以外の 4xx は即失敗。`GrokResult.attempts` を追加し `attempts > 1` のときだけログに出す。`tests/grok.test.ts` 19本追加、`pnpm typecheck && pnpm test` グリーン (156/156)
- **#107 に再発を記録**(3コメント相当の情報を2件に)。今日 `action_required` で止まったのは3本

### Spent

- $0.00。今回の作業はコード読解・GitHub API・ローカルテストのみで、LLM API 呼び出し(grok / gemini / fable)は一切していない
- 参考: 月次 AI 予算は daily 時点で $1.41/$10、creative $0.00/$10、ads $0.00/$30。うち今朝の 429 で失った $0.10 は「何も得ずに消えた分」

### Learnings

- **#107 の承認役単一障害点が、今週は最悪の並びで出た**。今日の daily は 00:08Z、weekly は 01:10Z、strategist は 01:39Z。唯一承認ステップを持つ daily が**先に**走ったため、後から作られた PR #229 / #230 は両方とも承認を取り逃し、次の承認機会は明日の daily = 約22時間後。issue 本文の「21〜23時間滞留」の見積りがそのまま再現した
- **`stalled_pr_check: 0` は検知漏れではなかった**。00:09:35Z 時点で #229/#230 はまだ存在していない。watchdog は daily の中でしか走らないので、daily より後に作られた PR はその日のうちには原理的に見えない。承認役と検知役が同じ1ジョブに同居していることの帰結で、watchdog 側を直しても解決しない
- **harness は自分の成果物を自分でマージ可能にできない**。今日出した PR #232 自身も `action_required` で停止し、`runs/:id/approve` は 403 (`harness.yml` に `actions: write` が無い)。#229/#230 と合わせて今日3本停止。これまで #107 は「weekly/strategist が止まる」話として書かれていたが、harness 自身も当事者だと実測で確認できたので issue に追記した
- **低頻度でも入れる価値のある防御がある**。実際の 429 は `data/events/*.jsonl` 全体で今朝の1件のみ(他の "429" ヒットはタイムスタンプの偶然一致で、grep の初手は誤読だった)。それでもリトライを入れたのは、失敗時に失うのが「その日のデータ全部 + 予算」でリトライ側のコストがほぼゼロという非対称性があるため。頻度ではなく損失の非対称性で判断した
- **テストが本当に効くかは変異で確かめられる**。`isRetryableStatus` を `return false` に差し替えると新規19本のうち5本が落ちた。これを確認するまでは「テストを書いた」と言えないと感じた
- `noUncheckedIndexedAccess` 下では tuple でも計算インデックスのアクセスは `T | undefined` になる。バックオフ表を配列で持とうとして2回 typecheck に弾かれ、2値なので定数2本に展開した方が読みやすかった

### Next

- **#107 は人間待ちのまま**(workflow ファイルは GITHUB_TOKEN で push 不可 + `actions: write` 追加は権限拡大で禁止事項)。本文の (1) 共通承認ステップ追加 (2) strategist の到達不能ループ削除 (3) `strategist.yml`/`harness.yml` への `actions: write` 追加 がそのまま残っている。今日の3本停止でコストが可視化されたので、次に人間が触るときの最優先候補
- PR #232 は明日の daily で承認 → auto-merge される見込み。マージ後に `attempts` がログに出るかを次回確認する(出るなら 429 が救われた証拠、出ないなら発生していないだけ)
- 残る open issue #23〜#26 (Knowledge Library 系, coji 起票) は research/prompt 側の継続テーマで、ハーネス保守の範囲外として今回は触っていない。#192 / #219 は needs-human のマーケ実行待ち
