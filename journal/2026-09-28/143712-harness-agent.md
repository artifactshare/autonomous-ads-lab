## 14:37 JST — harness-agent (automated)

### Done

- 状況把握: `pnpm db:init` → run_logs 直近40件、`gh run list` / `gh issue list` / journal 直近、マージ済みPRとopen issueの突き合わせ
- **先週のNextを実測して2件クローズ**:
  - #174: PR #175 がマージされ `tests/policy.test.ts` が main に存在する。自動クローズ不発(#136)だったので手動クローズ
  - #173: PR #176 がマージされ salvage 経路が `src/ops/stalled-prs.ts` に存在する。ただし後述の通り**本番では一度も実行されていない**
  - #169 の効果も確認: 今日の daily は `0 active deployment(s)` で budget guard のノートが空。上限超過を検知して pause する経路は仕事を終えている(9月の ads は $33.15/$30 で超過確定、これ以上増えない)
- **起票 + 修正 + auto-merge: #194 → PR #195** (metrics watchdog が毎日オオカミ少年になっていた)
  - オーナー判断(#187)で `paidMediaEnabled=false` / active deployment 0件になった後も、daily が毎日 `metrics_stale` を warn して Slack に ⚠️ を投げていた。**配信していないのだから前日メトリクスが0件なのは正常**
  - 同じ daily 実行の journal に「0 active deployment(s)」と「watchdog: no metrics … Ads API sync failed」が並ぶ自己矛盾した記録が毎日残っていた
  - `src/ops/metrics-watchdog.ts` に純関数 `classifyMetrics` / `describeVerdict` を新設し fresh / idle / stale の3値にした。`stale` のときの warn イベント名・Slack本文・journal行は**従来と一字も変えていない**(変えたのは鳴らす条件だけ)。active deployment 数は budget guard より前に数える(guard が今日 pause した結果で、実際に配信していた日の欠損を見逃さないため)
  - テスト8本追加 (110→118)、`pnpm typecheck && pnpm test` green、auto-merge 設定済み
- **#107 に今日の再発証拠を追記**。止まっているPR 3本: #191 (Weekly Learning) / #193 (strategist) / **#195 (自分が今日出した修正PR)**。承認役の daily は 00:35 UTC に走り終わっているので3本とも翌 09:00 JST まで滞留する。`actions/runs/:id/approve` が harness の token では 403 になることを再実測
  - 起票時より人間の作業が減っている点を追記した: **`weekly.yml` はすでに `actions: write` を持っている**(dispatch harness on failure 用)ので、weekly については**権限拡大なしで承認ステップを貼るだけ**で済む。優先度 weekly → harness → strategist で提示
  - 根治側の選択肢(リポジトリ設定 *Approval for running fork pull request workflows* を緩めれば承認ステップ自体が全ワークフローから不要)も併記。どちらを採るかはオーナー判断

### Spent

- 製品側のLLM予算消費 $0.00(このセッションは生成・仮説・評価の呼び出しを一切していない。調査は gh / git / sqlite のみ)
- harness-agent 自身の Claude Code 実行は `CLAUDE_CODE_OAUTH_TOKEN` のサブスクリプション側で、`budget_ledger` の `ai` カテゴリには計上されない。9月の ai 台帳は $3.16/$10 で、これは daily の research 呼び出し分

### Learnings

- **鳴りっぱなしの警告は、警告を消すだけでは直らない**。#194 の本質は「閾値が厳しすぎた」ではなく「watchdog が期待値を持っていなかった」こと。0件が異常かどうかは配信していたかに完全に依存するのに、watchdog は行数しか見ていなかった。監視を足すときは「何を期待しているか」を同じ場所に書く必要がある
- **同じ実行が同じ事実を正常とも障害とも報告していた**。journal に「0 active deployment(s)」と「no metrics … failed」が並んで2日以上気づかれなかった。**自分の出力の内部矛盾は、出力を読み返す誰か(=週次のこの作業)がいないと検出されない**。daily は自分の journal を読まない
- **オーナーの方針転換は、その方針を前提にしていない監視コードを置き去りにする**。#187 で paid media を止めたのは正しい判断だが、「配信しているはず」を暗黙の前提にしていた watchdog はそのまま残った。方針を変えるPRのレビュー観点として「この前提に乗っている監視・アラートはどれか」を持つべき
- **#176 の salvage 経路は本番で一度も走っていない**。`stalled_pr_salvaged` イベントは run_logs に1件もない。#168/#177 が UNKNOWN で数日滞留したあと 9/26〜9/27 の間に解消しているが salvage ログがないので、**オーナーが手でマージした**と読むのが自然。ユニットテスト7本はあるが cold path のまま #173 を閉じた。閉じた根拠は「コードが main にある」であって「効くと確認した」ではない、と明示しておく
- **#107 は4週連続で人間待ち**。先週 Next に書いた代替設計(auto PR を作らず main に直接 push)も、PR作成ステップが workflow YAML 側にあるので**同じ権限の壁の向こう**で、harness からは着手できない。この壁の内側でできることは出し尽くしている

### Next

- PR #195 がマージされたら、翌日の daily の journal に `watchdog: no metrics … expected, paid media is off` が出て Slack の ⚠️ が止まることを確認する。出なければ `metrics_idle` が run_logs にあるかで切り分ける
- #107: 次回も未解消なら、**harness からは打つ手がない**ことをissueの結論として固定し、これ以上「今週も再発した」の追記を積まない(証拠は十分揃っている)。オーナーが2択のどちらを採るかだけが残っている
- salvage 経路 (#176) は依然 cold。次に DIRTY / long-UNKNOWN が発生したときに `stalled_pr_salvaged` が出るかを確認する。出ないまま手動マージで解消したら、テストが守れていない何かがあるサインとして再起票する
- 9月の ads は $33.15/$30 で超過確定。10月1日の月替わりで `adsCapReached(0)` が false に戻るが、`paidMediaEnabled=false` が resume を止める経路はテスト済み (`never resumes while the owner has paid media disabled`)。10/1 の daily で実際に line item が ACTIVE に戻っていないかだけ確認する
