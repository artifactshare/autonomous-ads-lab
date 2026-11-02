## 15:22 JST — harness-agent

### Done

- 状況把握: journal 直近(11/01, 11/02)、`pnpm db:init` 後の `run_logs` 50件 + warn/error 30日分、`gh run list`、open issue 13件。**CI/daily/weekly に失敗なし**。着手前の `pnpm typecheck` / `pnpm test` は 24 files / 188 tests グリーン
- **#23 をクローズ**。PR #246(10/27 マージ)で実装済みだったが `Closes #23` が自動クローズされない既知挙動(#136)で残っていた。先週の Next に書いた「11/2 の weekly で初回リサーチが走るか」を実測確認した上で閉じた(下記)
- **PR #261 — #247 の実装(auto-merge設定済み)**: ops スクリプトが workflow の `git add` allowlist 外に書いた成果物が黙って捨てられる問題に、実行時 drift 検知を追加。`src/ops/commit-drift.ts` を新設し、`daily.ts` / `weekly.ts` の末尾(全書き込みの後)で `git status --porcelain` の実際の変更パスと、実行中 workflow の `git add` 行から読んだ allowlist を突き合わせて `log.warn('commit_drift')` する。静的な allowlist 固定テストも併設。27本追加で 215/215 グリーン
- **新規起票 #262 + PR #263(auto-merge設定済み)**: `weekly_stale` ウォッチドッグが**毎週月曜に誤報**していたのを発見して修正。判定を DB から Actions の run list に移した。15本追加で 203/203 グリーン
- **#107 に5回目の再発記録**。今日止まっているのは #256(weekly)/#259(strategist の improve PR)/#260(strategist)/#261(自分の PR)の**4本で観測史上最悪**。月曜は weekly/strategist/harness が揃うので最も強く出る

### Spent

- **$0.00**(プロジェクト予算)。コード読解・GitHub API・ローカルテストのみ。grok/gemini/fal/fable の呼び出しはゼロ。新規テストは `gh` 呼び出しも `globalThis.fetch` も差し替えており、実際の外部リクエストは発生していない
- 参考: 11月の月次予算は daily 時点で AI $0.012/$10、creative $0.00/$10、ads $0.00/$30(10月末時点の AI 消費は $2.18/$10 で着地)
- **11/02 の weekly が初の月次 knowledge research を消費**: domain `marketing-strategy`、見積り $0.10 → 実コスト **$0.0511**(reconcile 済み)。toolCalls 4 / input 23,209 tokens。**成果は提案ゼロ(`proposals: []`)**
- PR #263 がマージされると、daily に `gh run list` 1回が増える。GitHub API のみで課金なし

### Learnings

- **ウォッチドッグが「自分が直す対象」に依存していると、構造的に誤報する**。`weekly_stale` は「main の最新 weekly 行は何日前か」を聞いていたが、weekly のデータが main に届くのは weekly が走った時ではなく **weekly の PR がマージされた時**で、そのマージをしているのは**チェックしている daily 自身の approve ステップ**(#107)。10/27 の実測で誤報 `01:25:51` → weekly PR #241 マージ `01:27:55` の**2分差**。閾値 8 日に対しギャップがちょうど 8 日 0 時間 14 分になり、毎週引っかかる。10/06・10/13・10/27 の `weekly_stale` は全部これで、その裏で weekly.yml は 6 週連続 success だった
- **誤報は「ノイズ」で済まないことがある**。この Slack 文面は `gh workflow run weekly.yml` の手動実行を促す。従うと**未マージPRに既にあるデータの再取得に weekly 予算を二重消費**する(Grok 6クエリ、11/02 実測 $0.24)。「何もしない方が正しい」アラームが毎週鳴っていた。さらに毎週鳴るアラームは無視されるので、**本当に cron がスキップされた時(9/1 に観測)に気づけない** — ウォッチドッグの存在理由そのものが失われていた
- **「何日前か」を聞く前に「誰がその事実を書き込むのか」を確認する**。今回の教訓は先週の #247 と同じ形だった。先週は「ドキュメントが宣言する責務と workflow が実際に許すパスは別物」、今週は「DBの鮮度と実際のジョブ実行は別物」。どちらも**観測値が main に到達する経路に遅延があることを見落としていた**。main を読む観測は一律この疑いを持つべき
- **#247 の2案のうち実行時検知を選んだ理由が、作ってみて強化された**。「スクリプトが出力パスを宣言する」案は宣言の正しさが頼りで、外部CLI(`npx @artifactshare/cli` が `data/living-report.html` を書く)経由や計算されたパスが見えない。`git status` に聞けば経路を問わず捕まる。実 `weekly.yml` に #23 の near-miss シナリオ(`prompts/knowledge/x-video-ads.md`)を流して検出を確認、健全な run では空を返すことも確認した
- **ウォッチドッグのフェイルセーフの向きは「黙る」ではなく「従来通り鳴る」**。`gh run list` が引けない時に静かになる設計にしかけたが、壊れた時に黙るウォッチドッグは時々過剰報告するものより悪い。DB フォールバックを残し、`basis` フィールドでどちらの根拠か分かるようにした。変異テストで「フォールバックを外す」を入れると落ちることも確認済み
- **変異テストは今回も両PRでやった(計10種、全部落ちた)**。#263 で「run list より DB を優先(= バグ再導入)」を入れると 5 本落ちる。消したバグそのものをテストで固定できている確認になる。先週踏んだ「変異が適用されていないのに検知漏れと読み違える」罠は、今回は python での書き換え + 復元後のグリーン確認で回避した
- **harness agent は自分のPRすら自分で unstick できない**ことを実測した。`gh api -X POST .../approve` → `403 Resource not accessible by integration`。`tests/workflow-approve-audit.test.ts` の `KNOWN_BROKEN` が `harness.yml` について予測している通りで、**監査モジュールの予測が実測と一致した**。あの `KNOWN_BROKEN` リストは飾りではなく当たっている

### Next

- **#107 が依然ハーネス改善速度の律速**。7週間以上人間待ちで、今週は4本滞留。今日 #107 に追記したが、**`weekly.yml` だけは既に `actions: write` を持っている**(`# dispatch harness on failure`)ので、**権限拡大なしで承認ステップを足すだけで直る1本**。かつ #258 も同じ `weekly.yml` を触るので、**まとめて1回の workflow 編集で2件解決できる**。人間に出す最小の依頼として次回もここを押す
- **月次 knowledge research の初回が `[]` だった**。仕組みは end-to-end で動いている(発火・web検索・DB格納・`knowledge:pending` の表示すべて確認)が、採用候補が出なかった。1点では判断しないので issue は立てず観測に留めた。**12月の巡回ドメインで提案が出るかを見る**。毎月 `[]` が続くなら月 $0.05 が無駄になり #24-#26 も進まないので、その時はプロンプトか対象ドメインの選び方を疑う
- PR #261 / #263 は明日の daily で承認 → auto-merge の見込み。**#263 がマージされた翌週の月曜(11/9)に `weekly_stale` が出ないことを確認する**のが検証の本番。出たら `basis` フィールドを見れば `workflow_run` か `db_observation` かで原因を切り分けられる
- `#261` マージ後、**`commit_drift` が実際に鳴らないことも確認する**。鳴ったらそれは本物の成果物喪失なので優先で追う
- 残る open issue: #24〜#26(Knowledge Library の深化, coji 起票)は月次ローテーションが拾う範囲。#192 / #219 / #243 / #244 / #257 / #258 は needs-human でマーケ実行・権限設定待ち。#247 は PR #261 で解決見込み
