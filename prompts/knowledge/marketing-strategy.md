# マーケティング戦略枠組み調査: Artifact Share 広告運用への適用

作成: 2026-08-29 / 用途: weekly learning の仮説立案時の参照資料

---

## 1. パーセプションフロー・モデルの要点

音部大輔が P&G 等で磨いたマーケティング活動全体の「設計図」。売り手視点の販売ファネルではなく、**消費者の認識（パーセプション）がどう変わっていくか**を軸に、全マーケ活動（4P すべて）を一枚に配置し全体最適を図る枠組み。

- ステージは典型的に 8 段階: **現状（未認知）→ 認知 → 興味 → 購入 → 使用（試用）→ 満足 → 再購入（定着）→ 発信（口コミ・推奨）**
- 各ステージについて次の列を定義する:
  - **行動**: 消費者がそのステージで何をしているか
  - **パーセプション**: そのとき何をどう認識・感じているか
  - **知覚刺激**: 次のステージへ認識を動かすために与える刺激（広告・記事・体験・口コミ等。メッセージ×メディア）
  - **KPI**: 認識変容が起きたことを計測する指標
- 描き方のコツ: **「購入（＝コンバージョン）」時点のパーセプションから逆算して埋める**。「この人はどう思ったから使い始めたのか」→ そこへ至る前段の認識を遡って設計する
- 本質は「ステージごとに課題と打ち手を分離できる」こと。CTR が悪い＝認知→興味の刺激が弱い、試用されるが定着しない＝使用→満足のプロダクト体験の問題、と切り分けて議論できる

出典:
- https://markezine.jp/article/detail/39797 （音部氏本人の解説）— confidence: high
- https://webtan.impress.co.jp/e/2018/11/22/30875 — confidence: high
- https://xtrend.nikkei.com/atcl/contents/skillup/00001/00027/ — confidence: medium

---

## 2. Artifact Share 向けパーセプションフロー草案

対象顧客: AI コーディング（Claude Code 等）で HTML/レポート/デモを日常的に生成する開発者。confidence: low（独自適用案。週次で検証・更新する）

| ステージ | 想定パーセプション | 次へ動かす知覚刺激 | KPI 案 |
|---|---|---|---|
| **未認知** | 「AI 生成物の共有？ zip か screenshot か gist で足りてる（不便とすら思っていない）」 | 不便の言語化: 「AIが作ったHTML、どうやって見せてる？」型の共感フック（X 広告・記事） | 広告 impressions / 記事到達 |
| **認知** | 「URL 一つで共有できるツールがあるらしい」 | 15–30 秒デモ動画（コマンド→URL→ブラウザ表示の一連）、具体的なユースケース提示 | CTR、プロフィール/LP 訪問数 |
| **興味** | 「便利そう。でも本当に一瞬で済む？無料？怪しくない？」 | LP の即答（インストール1行・料金・仕組み）、docs 直リンク、GitHub、作者の顔が見える発信 | LP 滞在・docs 閲覧、GitHub star、サインアップ |
| **試用** | 「試したら本当に一発だった / 思ったのと違った」 | 初回体験の摩擦ゼロ（コマンド→URL まで数十秒）、成功体験の直後にコメント・AI 更新機能の提示 | 初回共有までの到達率・所要時間 |
| **定着** | 「共有はこれでいい。ワークフローに組み込んだ」 | コメント→AI 更新のループ体験、Claude Code スキル連携、更新性（同一 URL 更新） | 週次アクティブ、1人あたり共有数、再訪 |
| **共有・推奨** | 「これは人に教えたい / 共有された側も便利」 | 共有 URL 自体が広告（受け手がサービスを知る導線）、事例記事、引用しやすい一言 | 被共有者のサインアップ率、言及・引用数 |

設計メモ:
- Artifact Share は**プロダクトの共有 URL 自体が「共有・推奨→認知」への知覚刺激**になる構造（viral loop）。広告の役目は主に 未認知→興味 の頭出しに限定してよい
- 広告で「試用」まで直接押すのは月$30では非効率。広告 KPI は CTR と LP 到達までに置き、試用以降はプロダクト/記事側の指標で見る

---

## 3. 月$30規模でのテスト設計原則

### 何 impressions で何が言えるか
- CTR 比較（フック・画像の優劣）: **1バリアントあたり 2,000–3,000 impressions で 80% 信頼、5,000–8,000 で 95%**。かつ **30–50 clicks** 集まって初めて CTR に意味が出る — confidence: medium
- コンバージョン（サインアップ）比較: 1バリアント $200–500 相当が必要 → **月$30では原理的に不可能**。CV は「観測はするが統計判断には使わない」 — confidence: medium

### 運用ルール（独自適用案 — confidence: low）
1. **同時テストは最大2バリアント**。3つ以上に割ると全部が INSUFFICIENT_DATA で終わる
2. **判断単位は週ではなく「閾値到達」**: 各バリアント 2,000 imp または 30 clicks に達するまで結論を出さない。早期終了しない
3. **INSUFFICIENT_DATA は正式な結論として記録する**。「差が出なかった」ではなく「判定不能」。ジャーナルには imp/clicks/CTR と閾値未達の旨を書き、次週は (a) 継続蓄積 (b) 差が大きく出そうな大胆な変更に差し替え、のどちらかを明記
4. **小予算では効果量の大きい変更のみテストする**: コピーの微修正ではなく、フック・訴求軸・フォーマット（静止画 vs 動画）レベルの違い。微差は月$30では永遠に検出できない
5. **funnel 上流の指標で判断する**: 統計力が足りないときは CV でなく CTR・LP 到達で代理判断する

出典:
- https://www.growthmentor.com/blog/creative-testing-with-small-ads-budget/ — confidence: medium
- https://roaspig.com/blog/minimum-viable-budget-testing-facebook-ads/ — confidence: medium
- https://www.optimizelinkedinads.com/blogs/linkedin-ads-ab-testing-framework — confidence: medium

---

## 4. 開発者向け広告の注意点

- **広告耐性が高い**: 開発者は誇大コピー・煽り・低努力な宣伝に強い嫌悪を示す。「easy」「scalable」等の形容詞ではなく、事実（コマンド、所要秒数、仕組み）で語る — confidence: medium
- **教育 > 販売**: 売り込みでなく「知らなかった解決策を教える」トーンが通る。広告でも記事・デモ風の体裁が有利 — confidence: medium
- **docs 直行文化**: 開発者は LP を飛ばして docs を見る。広告→LP→docs の導線を切らさない。docs の質自体がコンバージョン装置 — confidence: medium
- **信頼は個人と一次体験から**: 作者本人の発信・OSS・GitHub・実際に動くデモが信頼の源泉。失った信頼は広告費では買い戻せない — confidence: medium
- **コミュニティ経由の伝播が主経路**: Supabase は広告ゼロで GitHub/Discord/Reddit 経由で成長した例。広告は「コミュニティで語られるきっかけ（記事・デモ）を初速でリーチさせる増幅器」と位置づけるのが現実的 — confidence: medium（事例は一社の逸話）
- **Artifact Share への適用（confidence: low）**: 広告クリエイティブは「宣伝」ではなく「使っている場面の実録」（cap-demo-video の 15–30 秒デモ）に寄せる。X では作者アカウントの通常投稿と広告の温度差を作らない

出典:
- https://www.heavybit.com/library/article/developer-marketing-mistakes — confidence: medium
- https://everydeveloper.com/traditional-marketing-unresponsive/ — confidence: medium
- https://www.markepear.dev/blog/developer-audience — confidence: medium
- https://reimer.me/blog/why-marketing-fails-for-developers — confidence: medium

---

## 5. weekly learning での使い方（要約）

1. 仮説は必ず「どのステージの、どの認識変容を狙うか」で書く（例: 認知→興味の刺激としてデモ動画 vs 静止画）
2. 判定は閾値（2,000 imp / 30 clicks per variant）到達後のみ。未達なら INSUFFICIENT_DATA と明記して継続 or 差し替え
3. 広告の守備範囲は 未認知→興味。試用以降の不振を広告のせいにしない（LP・docs・初回体験の問題として切り分ける）
