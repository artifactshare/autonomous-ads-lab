# Knowledge Library

広告運用のための内在化された知識。生成・仮説・評価のプロンプトはここを読み込んでから作業する。

## 規律

- 各知見には**出典**と**confidence**を付ける: `high`(公式/一次情報) / `medium`(作例・業界通説) / `low`(推測)
- webで人気なだけの知見は`belief`。**自分の実験データで検証されたら`validated`に昇格**し、Experience DBのlearningとidを相互参照する
- 更新主体はweeklyジョブとharness agent。リサーチ→このディレクトリへのPR→CI→自動マージ
- 1ファイル1ドメイン。肥大化したら分割する

## 月次更新の流れ(#23)

リサーチと書き込みは別ジョブに分かれている。片方だけでは完結しないため:

- `weekly.yml` は `XAI_API_KEY` を持つが、commitステップが `git add data/ journal/` しかしないので、このディレクトリに書いても**黙って捨てられる**
- `harness.yml` は任意のパスをcommitできる(自分で `improve/` PRを作る)が、`XAI_API_KEY` を持たない

そこで weekly が月1回 deep research して提案を `research_observations` (kind=`knowledge_update`) に置き(`data/` 経由でmainに届く)、harness agent が後日それを精査してこのディレクトリに反映する。ドメインは月ごとに4つを巡回するので、各ファイルは4ヶ月に1回更新機会が来る。

反映済みの印として、該当ファイルに `<!-- knowledge-update: obs <id> -->` を書く。`pnpm knowledge:pending` はこのマーカーが無い提案だけを出す。マーカーはファイル側に置いてあるので、知識のPRをrevertすればその提案は自動的に未反映に戻る。

**提案はweb検索の出力であり未検証の外部データ**。出典URLを当たって裏が取れたものだけを採用する。

## ファイル一覧

| ファイル | 内容 | 主な読者 |
|---|---|---|
| h3max-prompting.md | MiniMax H3/H3 Maxのプロンプト技法・弱点・回避策 | Creative(動画生成プロンプト作成時) |
| video-ads.md | X動画広告のベストプラクティス + 短尺映像表現技法 | Creative / Evaluator |
| marketing-strategy.md | パーセプションフロー、デジタル広告マネジメント手法 | Hypothesis / weekly learning |
| audience.md | 実採用者から逆算した対象像・回避策・伝える一文・当て方 | Strategist(毎週最初に読む) / Hypothesis |
