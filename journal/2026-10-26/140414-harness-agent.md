## 14:04 JST — harness-agent

### Done

- 状況把握: journal 直近、`run_logs` 50件、`gh run list`、open issue 10件。CI/daily/weekly に失敗なし。`pnpm typecheck` / `pnpm test` は着手前の時点で 156/156 グリーン
- マージ済みPRとの突き合わせで **#231 をクローズ**。PR #232(10/20 マージ、`2760bab`)で grok の 429/5xx リトライが入っており修正済みだったが、`Closes #231` が自動クローズされない既知挙動(#136)で残っていた
- 先週の Next に書いた「`attempts` がログに出るか」の確認: 直近の `research_observation` に `attempts` フィールドは無し。10/19 以降 429 が再発していないということで、リトライが無駄だった証拠ではない
- **PR #246 (auto-merge設定済み) — #23 の実装**: `prompts/knowledge/` の自動更新経路を新設。月1回 weekly が1ドメインを deep research(`web_search`)して提案を `research_observations` (kind=`knowledge_update`) に格納し、harness agent が後日 `prompts/knowledge/<domain>.md` に精査反映する。`pnpm knowledge:pending` CLI、月次ゲート、`prompts/harness-agent.md` と `prompts/knowledge/README.md` の手順追記つき。テスト28本追加で 184/184 グリーン
- **新規起票 #247**: ops ジョブが workflow の `git add` allowlist 外に書いた成果物は黙って捨てられる。今回これを踏みかけたので観測として残した(起票のみ、理由は下記)
- **#107 に4回目の再発記録**。今週止まっているのは #241/#242/#245 と、本日の自分の成果物 #246 の計4本

### Spent

- $0.00。コード読解・GitHub API・ローカルテストのみ。LLM API(grok/gemini/fable)の呼び出しはゼロ。新規テストは `globalThis.fetch` を差し替えており実際の xAI リクエストは発生していない
- 参考: 月次 AI 予算は daily 時点で $1.86/$10、creative $0.00/$10、ads $0.00/$30
- PR #246 がマージされると、**11月以降 月あたり約 $0.10 の見積りクエリが1本増える**(月次ゲートで月1回に制限)

### Learnings

- **「weekly が更新する」と書いてあるのに、書いても消える経路があった**。`src/llm/knowledge.ts` の docstring も `prompts/knowledge/README.md` も「更新主体はweeklyジョブ」と書いているが、`weekly.yml` の commit ステップは `git add data/ journal/` しかしない。weekly が `prompts/` に書いても commit されず PR にも入らず、**エラーも警告も出ずに成果物だけ消える**。#23 を素直に実装していたら、月1回の有料リサーチが毎回無言で蒸発していた。ドキュメントが宣言する責務と、workflow が実際に許しているパスは別物として確認する必要がある
- **権限の穴は2つ組み合わせると埋まることがある**。weekly は `XAI_API_KEY` を持つがパスを commit できない、harness は任意のパスを commit できるが API キーが無い。単体ではどちらも #23 を完結できないが、DB (`data/`) を受け渡しに使うと workflow 編集も権限拡大も無しで成立する。#107 で「人間待ち」と判断したときの癖で今回も最初「これも人間待ち」と書きかけたが、制約の掛け算を先に試すべきだった
- **この分割は妥協ではなく、むしろ編集方針として正しい向きだった**。README は全項目に出典と confidence を要求し、新規知見は `belief` で入れて自分の実験データで初めて `validated` にすると定めている。生の検索出力はこれを満たせないので、web と「全生成プロンプトが読むファイル」の間に精査するエージェントが1枚要る。制約から出発した設計が、先に決まっていた規律と一致した
- **月次ゲートはカーソルを持たない方が強い**。「当月(JST)に `knowledge_update` 行があるか」だけで判定すると、週次実行が飛んでも・リトライされても・1週に2回走っても正しい。状態を別に持つと同期ずれの面倒を自分で作ることになる
- **変異で確かめるまでテストを信用しない、は今回も効いた**。6種の変異(confidence フォールバックを high に / 出典URL検査を外す / 月次ゲート常時開 / JST→UTC / 上限撤廃 / enrichment が既存 raw を破棄)を入れて全部落ちることを確認した。うち1回は `sed` のエスケープ失敗で**変異が適用されていないのに「テストが検知しなかった」と読み違えかけた**。変異テストは「落ちたか」だけでなく「本当に書き換わったか」も確認しないと逆の結論を出す
- **`runQuery()` が既に観測行を insert している**のを見落として、最初の実装で2行目を insert しかけた。1クエリが観測テーブルで二重計上される。既存行に追記する `enrichLatestObservation()` に変更した。既存ヘルパを再利用するときは、その副作用まで読む

### Next

- **#107 は7週間人間待ちのまま**。本文の (1) 共通承認ステップ追加 (2) strategist の到達不能ループ削除 (3) `strategist.yml`/`harness.yml` への `actions: write` 追加。今週は4本(#241/#242/#245/#246)が滞留し、harness 自身の修正PRも含まれるのでハーネス改善の反映速度が週単位で律速されている
- PR #246 は明日の daily で承認 → auto-merge の見込み。**初回の実リサーチは 11/2 の weekly**(11月のローテーションは `marketing-strategy`)。その翌週 11/9 の harness 実行で `pnpm knowledge:pending` に提案が出るはずなので、そこで経路が端から端まで通ったかを確認する。出なければ weekly 側のゲートかパースを疑う
- #247 (commit allowlist の drift guard) は起票のみ。理由は2つ: workflow ファイルを GITHUB_TOKEN で push できないので allowlist を広げる方向の修正ができないこと、検知側も `writeFileSync` の変数引数や外部CLI経由の書き込みを静的に拾えず、雑に実装すると false negative で安心だけ与えること。issue に「実行時に書き込み先を宣言して allowlist 外なら warn する」案を残した
- 残る open issue #24〜#26 (Knowledge Library の中身の深化, coji 起票) は、#246 の経路が通れば月次ローテーションが自動で拾っていく範囲。#192 / #219 / #243 / #244 は needs-human のマーケ実行待ち
