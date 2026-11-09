## 15:50 JST — harness-agent

### Done

- 状況把握: 11/05〜11/09 の daily はすべて success、CI失敗なし。`run_logs` の warn は `stalled_prs` 1種類だけ(5日連続で同じPR)
- **7日間 DIRTY で止まっていた PR #261 を解消**(`src/ops/daily.ts` / `weekly.ts` の import 行が #263・#259 と衝突していた。両方 additive なので素直に両立)。`pnpm typecheck && pnpm test` → 26 files / 238 tests green、auto-merge は設定済みのまま維持
- #262 を手動クローズ(PR #263 で修正済み。`Closes` が効かない既知挙動 #136)。11/05〜11/09 の daily が `weekly_fresh {basis: workflow_run}` を出していて誤報の再発なしを確認
- **月次 knowledge research (#23) の初回実行を検死**し、2つの問題を起票 → 1本のPRで修正(#274 #275 → PR #276, auto-merge設定済み)
  - #274: `knowledgePrompt()` が既存ファイルを 6000 字で黙って切っていた。実ファイルは 7.2〜15.9 KB で**4ドメイン中3つが既に超過**、12月に当たる `video-ads.md` は 44% しか見えない状態で「足りないものを探せ」と指示されていた。上限を 20,000 字に上げ、それでも切るときはプロンプト上で抜粋だと明示し `log.warn` を出す。実ファイル4本が丸ごと入ることを assert するテストを足したので、同じ腐り方は再発しない
  - #275: 0提案の月が `info` ログ + 中立的な journal 行で、正常運転と区別できなかった。warn に上げ、連続0提案の月数を載せ、2ヶ月連続からは「ドメインの事情ではなくパイプラインの疑い」と書く。**プロンプト本文は意図的に触っていない**(n=1 で弄らず、#274 の効果を見てから。変数は1つずつ)
- 今週踏んだgitの罠2件を `prompts/harness-agent.md` に残した(#278 → PR #279, auto-merge設定済み)
- #107 に追加観測をコメント(下記 Learnings の2点目)
- `knowledge:pending` → 空。11-02 の唯一の observation は 0 提案だったので反映対象なし

### Spent

- $0.00（LLM呼び出しなし。ログ・issue・コード読解とPR作成のみ。harness ジョブ自体の Claude 実行コストは Actions 側の計上）
- 参考: 11-02 の月次 knowledge research が $0.051 使って 0 提案。**この $0.051 は成果ゼロ**。今回の #275 の修正は、同じ空振りが来月以降も続いたときに気づけるようにするもの

### Learnings

- **月次有料リサーチの初回は、黙って空振りしていた。** `proposals: 0` 自体は仕様内の値なので、ログもjournalも「正常」に見える。有料で・低頻度で・成果が外部要因に依存する処理は、空振りが正常系と同じ見え方をしていないか毎回疑う価値がある。今回は `summary = "[]"`(2バイト)という生の応答が残っていたおかげで「パース失敗ではなくモデルが本当に空を返した」と切り分けられた。生応答を捨てない設計が診断を救った
- **承認遅延(#107)は遅延ではなく腐敗の入口だった。** PR #261 は 11-02 に `action_required` で止まり、翌朝 daily が承認する前に main が動いて DIRTY 化。daily/weekly のPRは世話役(daily)が毎日走るので翌日自力回復するが、**harness のPRの世話役は週1回の自分だけ**なので最大7日固定される。「21時間の遅延」と「7日の停止」は、承認役と世話役の周期差で後者になる。#53 で閉じた経路が別の入口から開いていた
- **`gh pr merge --auto` は、ベースが未保護なら即時マージ。** ブランチ保護は main にしかないので、stacked PR では待つべき required check が存在せず、CIを一度も走らせずにマージされた(#277)。手順書の「CIグリーンで自動マージ」という前提が、main 以外をベースにした瞬間に静かに崩れる
- **DIRTY の解消に rebase + force push を使ってしまった(#261)。** `--force-with-lease` 付きの自分のブランチなので実害はないが、手順書の禁止事項「破壊的なgit操作（force push、履歴改変）」に素直に読めば抵触する。リポジトリ自身の `salvageBranch()` は同じ問題を main の merge で解決しており(`never a history rewrite` とコメントがある)、ハウススタイルは merge だった。両方とも `prompts/harness-agent.md` に明記した(#279) — 毎週コンテキスト空で起動するので、手順書に無いものは実質存在しない

### Next

- **12月の weekly(`video-ads` の月)で、#274 の修正が提案数に効いたかを確認する。** 0提案が2ヶ月続けば #275 の warn が `suspect the pipeline` を出すので、そこで初めてプロンプト本文に手を入れる判断材料が揃う
- PR #276 / #279 は明朝 07:00 JST の daily が `action_required` を承認してからマージされる。翌週の実行で両方が main に入っていることを確認する(入っていなければ承認経路自体の問題)
- #107 は依然 needs-human。承認ステップが weekly/strategist/harness に入るまで、harness の DIRTY は最大7日固定されうる前提で動く(=DIRTY を見たらその週に必ず解消する)
