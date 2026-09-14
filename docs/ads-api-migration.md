# X Ads API 移行計画(bridge 廃止まで)

2026-09-14 時点。App 33371617 は Standard アクセス付与済み(8/31)、metrics 同期は API 化済み(#139, #140)。
残りは「入稿・差し替え」と「bridge の撤去」。実口座の構造を API で読んで確認した事実に基づく。

## 進捗

- 2026-09-14 15:00: A1〜A9 実装(`src/ads/deploy.ts`)、creative 8 を API で入稿・creative 3 を pause(#44 消化)。B1〜B4 は `src/ads/control.ts` + `pnpm ads:control`。E1/E3/E4 完了、daily は `ADS_DEPLOY_APPLY=1` で勝者を自動デプロイ。D は bridge の workflow を無効化
- 学び: `PUT promoted_tweets` は entity_status を受けない(pause は DELETE)。event log は write-through にした(途中 crash で ad_assets が消え、投稿が二重生成された)

## 現在の口座構造(API で確認)

| 層 | id | 内容 |
|---|---|---|
| funding_instrument | 1d6t8t | CREDIT_CARD / JPY / able_to_fund |
| campaign | p6lig (= 42298216) | ads-lab-exp001-final_v7, budget_optimization=LINE_ITEM |
| line_item | xirso | WEBSITE_CLICKS / PROMOTED_TWEETS / goal LINK_CLICKS / pay_by IMPRESSION / ¥220/日 / bid auto |
| targeting_criteria | (xirso) | LOCATION US/UK/CA/AU + キーワード |
| promoted_tweet | b59l0s | tweet 2093628999910187191, ACCEPTED |
| tweet | 2093628999910187191 | nullcast=true、本文 + `card://2093628998668705792` |
| card | VIDEO_WEBSITE "Ad 1" | 動画 media_key + 遷移先 URL(UTM 付き) |
| media_library | 13_2093628291458670592 | creative 3 の動画(5.2s) |

つまり「1 広告」= 動画(media_library) + VIDEO_WEBSITE カード + nullcast 投稿 + promoted_tweet の4点セット。
bridge の deploy.mts が Ads Manager 上でやろうとしていた「Add post → 旧 ad を pause」は、API ではこの4点を作って旧 promoted_tweet を PAUSED にすることに対応する。

## 必要機能の一覧

### A. 入稿(creative → 配信)— 未実装、最優先

| # | 機能 | API | 備考 |
|---|---|---|---|
| A1 | 動画 chunked upload | `POST upload.twitter.com/1.1/media/upload.json` INIT/APPEND/FINALIZE/STATUS, `media_category=amplify_video` | OAuth1 user context。STATUS を `succeeded` まで poll。ファイルは `data/creatives/{id}/final.mp4` |
| A2 | media library 登録 | `POST /accounts/:id/media_library?media_key=` | `media_status=TRANSCODE_COMPLETED` を確認 |
| A3 | VIDEO_WEBSITE カード作成 | `POST /accounts/:id/cards` components: `MEDIA{media_key}` + `DETAILS{title, destination:{WEBSITE,url}}` | url に UTM(`utm_campaign=exp-auto-{creative_id}`)。title は creatives.hook/cta から |
| A4 | nullcast 投稿作成 | `POST /accounts/:id/tweet` text + card_uri, nullcast=true, as_user_id | as_user_id は promotable_users から取得 |
| A5 | promoted_tweet 作成 | `POST /accounts/:id/promoted_tweets` line_item_id=xirso, tweet_ids | 既存 ad group に追加(bridge と同じ設計) |
| A6 | 旧広告の pause | `PUT /accounts/:id/promoted_tweets/:id` entity_status=PAUSED | DELETE でも UI 上は Paused だが、復帰できる PUT を使う |
| A7 | 審査状態の追跡 | `GET promoted_tweets` の `approval_status` | ACCEPTED まで daily で poll。REJECTED なら理由取得 → journal + issue |
| A8 | deployments 記録 | DB | `record-deployment.ts` の処理を API 実装に統合。campaign_id は decimal のまま(toApiId で変換)。post_url, card/media/promoted_tweet の id も保存 |
| A9 | dry-run / idempotency | 実装側 | `DEPLOY_APPLY=1` 以外は A1〜A3 まで(課金・配信に影響しない)で止める。creative_id ごとに media_key / card_uri / tweet_id を DB に保存し、途中失敗からの再開で二重作成しない |

### B. 配信制御・予算ガード — 一部未実装

| # | 機能 | API | 備考 |
|---|---|---|---|
| B1 | campaign / line_item の pause・resume | `PUT campaigns/:id`, `PUT line_items/:id` entity_status | `setCampaignStatus` は実装済み。line_item 版を追加 |
| B2 | 日予算の変更 | `PUT line_items/:id` daily_budget_amount_local_micro | budget controller の月次残から日額を下げる経路。現状は Ads Manager 手動 |
| B3 | 予算残の検証 | `GET funding_instruments` | able_to_fund=false / 期限切れカードの検知 → Slack |
| B4 | strategist 判断の反映 | B1 + A6 | 「creative 3 を pause」「9/16 までに 8 を live」のような判断を人手なしで実行する経路。decide.ts から呼ぶ |

### C. 新実験の立ち上げ — 将来(v0 では不要)

| # | 機能 | API |
|---|---|---|
| C1 | campaign 作成 | `POST campaigns` funding_instrument_id, name, entity_status |
| C2 | line_item 作成 | `POST line_items` objective WEBSITE_CLICKS, product_type PROMOTED_TWEETS, placements, goal, bid_strategy AUTO, daily budget |
| C3 | targeting 複製 | `POST batch/targeting_criteria`(既存 xirso の criteria をコピー) |

現在は「同じ ad group 内で広告を差し替える」設計なので C は不要。ターゲティング実験を始めるときに実装する。

### D. bridge(ads-lab-bridge)の撤去

| # | 対象 | 条件 |
|---|---|---|
| D1 | metrics.yml(06:30 scrape) | 翌朝 daily が API 経由で書けたら停止。`ingest.mts` も不要に |
| D2 | repair-stalled-metrics.yml | D1 と同時に不要 |
| D3 | deploy.yml(08:00 auto-deploy) | A が main に入った時点で停止。`deploy.mts` の `overall_score >` 同点問題(#44 の真因)も消える |
| D4 | harness.yml / prompts | bridge 専用の自己修復。repo ごと archive |
| D5 | Windows ミニPC の runner | 停止・登録解除。X ログインセッション維持の人手作業が消える |
| D6 | 公開 repo 側の文言 | daily.ts / decide.ts / html.ts / README / blockers.md の「Ads API approval pending」を更新 |

### E. 既存コードの置き換え

| # | 対象 | 変更 |
|---|---|---|
| E1 | `src/ops/decide.ts` | 「bridge が朝デプロイする」前提のコメントとフロー → 同じ daily 内で A を呼ぶ。挑戦者の採用基準は score 同点を許す(strategist が「実験として回す」と判断したものを deploy) |
| E2 | `src/ops/record-deployment.ts` | 手動記録用。API 実装後は fallback として残すか削除 |
| E3 | `src/ops/daily.ts` watchdog | 「bridge likely down」→ API 同期失敗の通知に変更(既に ads-api sync failed を journal に書く) |
| E4 | daily.yml | 既に X_ADS_* を渡している。deploy step は追加不要(daily.ts 内) |
| E5 | `docs/blockers.md`, `HANDOVER.md` Phase 3 | 完了に更新 |

## 実装順(推奨)

1. **A1〜A3 + A9(dry-run)**: creative 8 の動画を upload → media_library → card まで作る。課金なし。API の癖(動画仕様、card の components 形式)をここで潰す
2. **A4〜A8**: `DEPLOY_APPLY=1` で creative 8 を live、creative 3 を PAUSED。**#44 の 9/16 期限をこれで消化**
3. **E1, E3, D3**: decide → deploy を daily 内に統合、bridge の deploy.yml 停止
4. **D1, D2**: 翌朝の API 同期成功を確認後、bridge metrics 停止
5. **B1〜B4**: 予算・pause 制御を decide/strategist から呼べるようにする
6. **D4〜D6, E2, E5**: 撤去と文言更新
7. C は必要になったら

## 前提・制約

- Ads API の rate limit は endpoint ごと(多くは 15分/数百)。daily 1回の運用では問題なし
- 動画仕様: MP4 H.264、1:1 / 16:9、最大 ~1GB。現行 creative は 768p 16:9 8秒で問題なし
- nullcast 投稿はタイムラインに出ない。organic 投稿を兼ねたい場合は nullcast=false(現状の設計は promoted-only)
- 審査は通常数分〜数時間。REJECTED 時の理由は `promoted_tweets` に載らないことがあるため、Ads Manager の通知も併用
