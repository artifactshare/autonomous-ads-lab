# ブロッカー調査結果 (2026-08-29)

## 進捗 (2026-08-29 実施済み)

- [x] X developer account 作成（@artifactshare_ / アカウント名 "Artifact Share"、PPU Pilot契約に同意）
- [x] Developer App 作成済み: **App ID 33371617**（Default Project, Pay Per Use, active。consumer key発行済み、access token / bearer は未生成）
- [x] **Ads API Access Form 送信完了**（Standard相当、"Success! Someone from the X Developer Platform will reach out shortly."）
- [x] 広告アカウント作成確認: **account ID `18ce55x0rpo`**（ads.x.com、Ads Manager操作可能）
- [ ] 広告アカウントの支払い方法設定（カード入力は人間作業）
- [ ] fal.ai アカウント作成 + `FAL_KEY` 発行（人間作業）
- [ ] Ads API承認待ち。1週間応答なければ devcommunity へ催促スレッド

## 1. X Ads API

- 申請フロー: developer account (console.x.com) → Developer App 作成 → [Ads API Access Form](https://docs.x.com/forms/ads-api-access) で App ごとに申請。手順正本: [Step-by-step guide](https://docs.x.com/x-ads-api/getting-started/step-by-step-guide)
- アクセスレベルは **Standard** が必要（Campaign Management / Creatives / Analytics の read & write）
- Free tier でも申請可・追加費用なし。最低支出要件なし
- 広告アカウント (ads.x.com) が必要。承認後は user access token の再生成が必要（OAuth 1.0a）
- **審査期間は非公開で、数週間〜数ヶ月、応答なしも常態化**。却下より放置が主リスク
- 催促は devcommunity の Ads API Access カテゴリに App ID つきでスレッドを立てるのが慣例

**判断: 承認待ちを前提にせず、手動運用（Ads Manager）を初回の既定とする。API は「来たら自動化」。縮退パスを本線に昇格。**

## 2. fal 動画生成

「H3 Max」は実在: **`minimax/h3-max/text-to-video` / `image-to-video`**（fal Research post-trained版）。

| モデル | 5秒1本 | $10で | seed | アスペクト比 |
|---|---|---|---|---|
| `minimax/h3-max/text-to-video` (768p) | $0.40（〜9/1割引 $0.20） | 25本（割引中50本） | 可 | 16:9 / 1:1 / 9:16 ほか |
| `fal-ai/bytedance/seedance/v1/pro/fast/text-to-video` (1080p) | ≈$0.245 | 約40本 | 可 | 16:9 / 9:16 / 1:1 |
| `fal-ai/veo3.1/fast` (720p+) | $0.50〜0.75 | 13〜20本 | 不明 | 要スキーマ確認 |
| `fal-ai/kling-video/v2.5-turbo/pro/text-to-video` | $0.35 | 約28本 | 不可 | 16:9 / 9:16 / 1:1 |

- H3 Max は1日5本まで無料枠あり。5秒768pを約3秒で生成、音声同時生成対応
- seed 再現性＋全アスペクト比＋単価で **primary: H3 Max、secondary: Seedance Pro Fast**。品質比較に Veo 3.1 Fast を少量
- $10/月 → 月20〜50本生成可能。1 generation 2〜4 candidates は余裕で成立

## 人間側のTODO

1. X developer account + App 作成、Ads API Access Form 送信（Standard、今日中推奨）
2. ads.x.com で広告アカウント確認/作成、支払い方法設定
3. devcommunity 催促スレッド（1週間応答なければ）
4. fal.ai アカウント作成、API キー発行 → `FAL_KEY` 環境変数へ
