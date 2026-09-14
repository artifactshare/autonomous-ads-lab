# 誰に届けるか: 実際の採用者から逆算した対象像

作成: 2026-09-14 / 用途: strategist の「誰に・何を・期待アクション」の逆算、targeting と hook の起点。
一次データは `data/adopter-signals.json`(本番の匿名集計、private 側 `ops:adopter-signals` が週次で更新)。

## 逆算の順序(毎週この順で問う)

1. **期待アクション**: 登録して CLI か MCP で1本目を投稿し、同僚1人がコメントする。着地でも sign_up でもない
2. **なぜその人は投稿するのか**: 「AI に作らせた成果物を、いま、誰かに渡してレビューしてもらう必要がある」瞬間があるから。登録は広告を見た瞬間ではなく、必要が発生した瞬間に起きる。$1.5/日 では刷り込みは買えないので、必要が頻繁に発生している人に当てる
3. **誰に**: 実際に定着している外部 workspace のプロファイル(下記)に最も近い人
4. **何を伝えるか**: その人が今やっている回避策(下記)を、実録で置き換えて見せる。主張ではなく実録
5. **どう当てるか**: 同じ像の人が集まる場所(手本アカウントのフォロワー類似層)に絞る。キーワードより密度が高い

## 定着している外部採用者の像(2026-09-14、confidence: high、一次データ)

- 唯一の日本以外の有料 Team workspace: 2〜9人、英語圏、加入初日に **CLI 経由で初投稿**、6週間で 41 投稿 / 112 版 / 48 コメント、最大 14 版の文書、MCP 投稿多数
- 投稿物は「AI エージェントに書かせた設計書・tech brief・競合 teardown・GTM 戦略」の HTML。CTO が同僚の設計書にインラインコメントを数十件
- つまり用途は「非エンジニアへ配る」ではなく **AI-native スタートアップの創業チームが、エージェント生成の設計書を同じ URL でレビューし合う**
- 日本の採用者(大口クライアント、日本語、報告書・手順書中心)は別の像。英語圏の広告はこの像を使わない

## その人たちが今やっている回避策と、それが嫌な理由(2026-09-14、confidence: medium、X 観測)

- 「research/ フォルダ + AGENTS.md、共有したければ agent に HTML レポートを作らせて Vercel にデプロイ」(@rauchg、1.2k likes)
- 「Slack に10個のバージョンが漂う」(@gregisenberg、817 likes)
- 「Notion がしんどい。Claude Artifacts が近いが人が編集できない。humans and agents 両方が使える shared workspace はないか」(@akshatag77、250 likes / 95 replies)
- 「read-only の Claude artifacts をチームで共有するのが huge pain」(@crod_ai)
- 「AI の出力は careful review なしに共有すると everyone can tell」(@brian_lovin、810 likes)

Claude Code / Codex 付属の共有機能を使わない構造的理由(confidence: medium):
1. 共有先が個人の AI アカウントに紐づく。チームという単位がなく、"anyone with the link" が実質 public。会社のデータを個人アカウントの下に置きたくない
2. チームは1つの agent で揃わない。モデルの優劣が月単位で入れ替わり、わざと別 lab にレビューさせる。置き場は agent の外にないと成立しない(IDE が割れていても GitHub は1つだった)
3. 共有は最後ではなくレビューの往復の途中にある。他人のコメントを agent の次のターンに戻す経路が要る
4. 成果物はチャットの外(ファイルシステム、CI)に生まれる。チャット UI の共有ボタンは届かない

## 伝えるべき一文の芯(confidence: medium、未検証)

「エージェントを問わず、チームのものとして、同じ URL でレビューを回す」。
「HTML を共有できます」は競合(Showly 等)と同じで、ベンダーが同機能を出した時点で無効になる。

## 当て方(confidence: medium、未検証)

- X Ads の `SIMILAR_TO_FOLLOWERS_OF_USER` で手本アカウント(@rauchg, @dan__rosenthal, @akshatag77, @gregisenberg)のフォロワー類似層。`pnpm ads:targeting add-similar @handle`
- 製品をそのまま求めている投稿(@akshatag77 の質問)には、広告より先に実物 URL つきで返信する(人間の作業、needs-human issue)

## 更新規律

- 週次で `data/adopter-signals.json` と `research_observations`(kind: target_people, competitor_moves)を読み、像が変わったら本文を書き換える。古い像は消さず「(YYYY-MM-DD まで)」と注記して残す
- validated への昇格条件: その像に絞った配信で、着地率 ≥30% かつ 7日以内 first_share が1件以上
