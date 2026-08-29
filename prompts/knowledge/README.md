# Knowledge Library

広告運用のための内在化された知識。生成・仮説・評価のプロンプトはここを読み込んでから作業する。

## 規律

- 各知見には**出典**と**confidence**を付ける: `high`(公式/一次情報) / `medium`(作例・業界通説) / `low`(推測)
- webで人気なだけの知見は`belief`。**自分の実験データで検証されたら`validated`に昇格**し、Experience DBのlearningとidを相互参照する
- 更新主体はweeklyジョブとharness agent。リサーチ→このディレクトリへのPR→CI→自動マージ
- 1ファイル1ドメイン。肥大化したら分割する

## ファイル一覧

| ファイル | 内容 | 主な読者 |
|---|---|---|
| h3max-prompting.md | MiniMax H3/H3 Maxのプロンプト技法・弱点・回避策 | Creative(動画生成プロンプト作成時) |
| video-ads.md | X動画広告のベストプラクティス + 短尺映像表現技法 | Creative / Evaluator |
| marketing-strategy.md | パーセプションフロー、デジタル広告マネジメント手法 | Hypothesis / weekly learning |
