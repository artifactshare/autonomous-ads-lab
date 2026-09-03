# MiniMax H3 / H3 Max プロンプト技法 調査ノート（広告動画向け）

調査日: 2026-08-29
対象: MiniMax H3 (Hailuo 3.0 / Hailuo-03) と fal 版ポストトレーニングモデル H3 Max

confidence 基準: 公式(fal/MiniMax) = high / 第三者ガイド・作例 = medium / 推測・伝聞 = low

---

## 1. モデル基礎知識

- H3: MiniMax のオープンウェイト・マルチモーダル動画モデル。ネイティブ 2K・24fps・ステレオ音声を毎回同時生成。5〜15秒/回（extend で〜30秒）。参照入力は最大 画像9 + 動画3 + 音声3。instruction-based editing（生成済みクリップへの言葉での修正）対応。
  出典: https://fal.ai/minimax-h3 , https://fal.ai/learn/tools/minimax-h3-explained , https://x.com/fal/status/2083008450460541238 — confidence: high
- H3 Max: fal が H3 を RL でポストトレーニングした派生。**プロンプト追従・美観・音声品質を強化、768p 特化、約15倍高速**（768p 5秒クリップを3秒未満で生成）。Artificial Analysis の音声付き動画リーダーボードで I2V #1 / T2V #3。
  出典: https://fal.ai/minimax-h3-max , https://x.com/ArtificialAnlys/status/2092717615739494424 — confidence: high
- H3 Max のエンドポイント: text-to-video / image-to-video（`end_image_url` で first→last キーフレーム指定可）。reference-to-video は後日予定。アスペクト比 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16。解像度 480p / 768p（1344×768）。duration 5〜15秒（整数）。prompt expansion: balanced(デフォルト)/fast/quality。
  出典: https://fal.ai/minimax-h3-max — confidence: high
- H3 Max Turbo の text-to-video endpoint は `minimax/h3-max-turbo/text-to-video`。H3 Maxと同じ5〜15秒、480P/768P、seed、aspect ratio、balanced/quality prompt expansionを受け付ける。2026-09-03確認時の768P価格は9月7日まで$0.01/秒、その後$0.04/秒。H3 Max側も同日まで$0.02/秒、その後$0.08/秒。
  出典: https://fal.ai/models/minimax/h3-max-turbo/text-to-video/api , https://fal.ai/models/minimax/h3-max/text-to-video/api — confidence: high（価格は変動しうる）
- 価格: H3 Max 768p $0.08/秒（ローンチ後14日は半額、無料枠あり）。base H3 は $0.06/秒(768p)〜$0.13/秒(2K)。
  出典: https://fal.ai/minimax-h3-max — confidence: high（価格は変動しうる）
- **fal 公式推奨設定: 768p・5〜10秒・prompt expansion は balanced のまま・映像と音声の両方をプロンプトに書く。** — confidence: high

---

## 2. プロンプト構造のベストプラクティス

### 2.1 基本構造（6要素を順に書く）

複数の第三者ガイドが一致して推奨する順序:

**Subject → Action → Setting/Scene → Camera → Light/Style → Audio**

- Subject: ショットが追う対象を1つ
- Action: 「開始状態→目に見える1つの進行→終了状態」を持つ動作。静的な描写だけだと動かない映像になる
- Camera: **1ショットにカメラムーブは1つだけ**。複数積むとカットやブレの原因
- Audio: 誰が話すか・正確なセリフ・環境音・前景/背景の階層・「no music」「no dialogue」など不要物の明示

出典: https://reapi.ai/blog/minimax-h3-prompt-guide , https://www.inreels.ai/blog/minimax-h3-prompt-guide — confidence: medium

MiniMax 公式45プロンプトの分析では6ブロック構成:
1. Style Contract（媒体・パレット・時代・参照スタイル）
2. Timeline（`[0s-2s]` 形式の時間スライスごとの動作）
3. Camera（動き、または「no push in, no cuts」等の明示的拒否）
4. Audio（各音の入りタイミング付き。例:「at 6 seconds the jazz bass groove joins」）
5. Text（画面内文字は**引用符でリテラル指定**）
6. Negative List（拒否するトランジション・物体）

出典: https://www.atlascloud.ai/blog/tips/minimax-h3-prompt-guide — confidence: medium

### 2.2 タイムスタンプ / マルチショット

- `[0s-2s] ...` あるいは `00:00.000–00:03.000 ...` 形式で時間区切りのショットを書ける。**フレーム厳密ではなく「編集台本」**として機能する（順序と比重の指示）。
- 1ショットは2〜5秒以上。1.5秒未満のショットは崩れやすい。範囲は連続・重複なしで。
出典: https://reapi.ai/blog/minimax-h3-prompt-guide , https://cdance.ai/blog/minimax-h3-prompt-guide — confidence: medium

### 2.3 カメラワーク語彙

- **重要: 旧 Hailuo 02 のブラケットトークン（[Push in][Truck left] 等の最大3個スタック）は H3 では非推奨。カメラの動きは自然な英語でショット記述の中に書く。**
  例: "The camera tracks beside the cyclist at street level while maintaining the same distance."
  出典: https://www.inreels.ai/blog/minimax-h3-prompt-guide ほか複数ガイド — confidence: medium
- 高信頼の語彙: slow dolly in / dolly out, tracking shot, orbit shot, crane up/down, static shot, pan, tilt, rack focus, handheld track
- やや不安定（テスト前提）: crash zoom, dolly zoom, whip pan, steadicam follow, dutch angle
- ワンカット固定なら "one continuous shot, no cuts" を明示。固定なら "locked off, static wide shot, no push in"
出典: https://cdance.ai/blog/minimax-h3-prompt-guide , https://www.atlascloud.ai/blog/tips/minimax-h3-prompt-guide — confidence: medium

### 2.4 音声生成

- 映像と同パスでセリフ・SE・環境音を生成し、動作に同期する。ステレオ。 — confidence: high（fal公式）
- セリフは3層を分けて書く: ①Dialogue（**話者を特定し、正確な文言をそのまま**。言語・句読点を保持）②Soundscape（足音・雨・衣擦れ等）③BGM（劇伴であることを明示）。
- セリフは尺に収まる長さに。**声に出して読んで秒数を確認**。長すぎると早口になる。
- 複数話者は一貫したラベルで区別（例: "the barista says... the customer replies..."）。
- 無音にしたい要素は明示的に否定: "no music, no dialogue"。書かないと勝手に埋められる。
- dialogue タグ構文 `<d>[English] ...</d>` を紹介するガイドあり — confidence: low（他ソースで未確認。まずは自然文+引用符でのセリフ指定を推奨）
出典: https://cdance.ai/blog/minimax-h3-prompt-guide , https://reapi.ai/blog/minimax-h3-prompt-guide — confidence: medium

### 2.5 キャラクター/商品の一貫性

- 参照画像を使う場合（base H3 の omni-reference / H3 Max は i2v・将来の ref2v）、**各参照に役割を1つだけ明示的に割り当てる**のが公式プロンプトの定型:
  "Image 1 is the overall mood and style reference, Image 2 is the lead character reference."
  "Reference Image 1: preserve this person's face, hair, coat, and proportions."
- i2v では画像に写っている要素を繰り返し記述せず、「frame one 以降に何が変わるか」だけを書く。固定したい要素は "keep X unchanged" と守るべき不変条件を名指しする。
- 商品の形状崩れ対策: 動作・カメラ・演出を盛りすぎない。"lock product orientation"、商品の色・素材・ロゴ位置を文で固定。
出典: https://www.atlascloud.ai/blog/tips/minimax-h3-prompt-guide , https://cdance.ai/blog/minimax-h3-prompt-guide , https://reapi.ai/blog/minimax-h3-prompt-guide — confidence: medium

### 2.6 編集（base H3 のみ）

instruction-based editing は「Replace X with Y」「keep Z unchanged」の**置換形式**で書く。「make this better」のような曖昧指示は効かない。
出典: https://www.atlascloud.ai/blog/tips/minimax-h3-prompt-guide , https://fal.ai/learn/tools/minimax-h3-explained — confidence: medium

---

## 3. 広告向けに効くパターン（5〜10秒・フック重視）

### 3.1 設計指針

- **H3 Max は 768p・5〜10秒がスイートスポット**（fal公式推奨）。SNS広告のフック動画に尺・速度・コストが合う。9:16 / 1:1 / 16:9 を用途で選ぶ。 — confidence: high
- 冒頭0〜2秒に最も強い視覚変化（クラッシュズーム、注ぎ・落下・点灯などの物理イベント）を置く。タイムライン記法で先頭ブロックにフックを明記。 — confidence: medium（ガイド群の構成原則からの応用。low寄り）
- 音声ファースト設計: 商品のSE（炭酸の泡、スニーカーの着地音、ファスナー音）を具体的に書くと知覚品質が大きく上がる。BGMは "subtle bass-heavy electronic pulse" 程度に抑え "no dialogue" を明示するとクリーンな広告調になる。 — confidence: medium
- 画面内テキスト（キャッチコピー・ロゴ・価格）は原則**後工程で載せる**。動画内に必要なら §4 の回避策を使う。 — confidence: medium

### 3.2 実プロンプト例

**例1: 商品ターンテーブル（スニーカー、6秒、1:1 or 9:16）** — 出典ガイドの before/after 実例
```
00:00.000–00:03.000 A matte white sneaker with neon green accents sits on a glossy black
turntable, rotating slowly. Camera orbits at eye level. Hard studio spotlight from above
creates dramatic shadows. Clean white background.
00:03.000–00:06.000 Crash zoom into the sole tread pattern, then rack focus to the knit
texture of the upper. Subtle bass-heavy electronic pulse. Hyperrealistic product
photography style, 8K detail. No on-screen text, no dialogue.
```
出典: https://cdance.ai/blog/minimax-h3-prompt-guide — confidence: medium

**例2: UGC風クリエイター実演（ハンディ掃除機、8秒、9:16）** — ガイド掲載の商用実例を整形
```
Vertical 9:16 handheld selfie framing. A woman in her 20s faces the lens holding a compact
handheld vacuum in her right hand. She points to the nozzle with her left index finger,
bends toward the sofa, and removes one line of crumbs in a single pass, then looks back
at the camera and smiles. One continuous shot, slight natural handheld sway, bright
daylight apartment. She says "One pass. That's it." Vacuum motor hum, fabric rustle,
no music. No on-screen text.
```
出典: https://cdance.ai/blog/minimax-h3-prompt-guide — confidence: medium

**例3: 飲料の物理フック（5秒、9:16）** — ガイドの原則（物理イベント+音声ファースト）からの構成例
```
[0s-2s] Macro shot: an ice cube drops in slow motion into a glass of sparkling yuzu soda,
golden liquid erupts in fine bubbles. Static macro camera, shallow depth of field.
[2s-5s] Slow dolly out reveals the chilled bottle beside the glass on a sunlit wooden
counter, condensation droplets running down the label. Crisp fizz and ice clink, soft
summer ambience, no music, no dialogue, no on-screen text. Hyperrealistic commercial
food photography style.
```
confidence: low（原則からの構成例。要テスト）

**例4: ランニングシューズ3ショット広告（10秒、16:9）** — ガイド掲載構成
```
[0s-3s] Close-up: hands tie the laces of a red running shoe at dawn, breath visible in
cold air. Static shot.
[3s-7s] Side tracking shot at street level: the runner sprints along an empty riverside
road, camera keeps constant distance. Footsteps and rhythmic breathing.
[7s-10s] Low-angle shot: she crosses under a bridge into warm sunlight, slight slow
motion. A bass pulse builds from 3 seconds and peaks at the end. No dialogue,
no on-screen text, no cuts inside each shot.
```
出典: https://cdance.ai/blog/minimax-h3-prompt-guide （構成を再現） — confidence: medium

**例5: i2v で商品カットを動かす（H3 Max image-to-video）**
商品スチルを input image に、必要なら決めカットを end_image_url に指定し、プロンプトには変化分だけ書く:
```
Keep the product, label, and lighting unchanged. The camera slowly pushes in toward the
bottle while steam rises behind it and the background lights bloom softly. Gentle whoosh
and ambient hum, no music, no dialogue.
```
出典: https://fal.ai/minimax-h3-max （end_image_url）, i2v原則は https://cdance.ai/blog/minimax-h3-prompt-guide — confidence: medium

---

## 4. 弱点と回避策

| 弱点 | 症状 | 回避策 | confidence |
|---|---|---|---|
| 画面内テキスト | 指定しない文字は「文字状ノイズ」に崩れる。中国語が勝手に混入することも | 必要な文字列は**引用符でリテラル指定**+ "do not misspell, do not add other text, do not introduce Chinese text"。原則はテキストなしで生成し後編集でテロップを載せる。"No on-screen text" を常套句に | medium |
| 勝手なカット/ブレ | カメラ指示の競合 | カメラムーブは1つ、"one continuous shot, no cuts" を明示 | medium |
| 静止画的な出力 | 動作の記述がない | 因果のある1動作+環境の反応（湯気、波紋、影の移動）を必ず書く | medium |
| 商品形状の崩れ | 動作/カメラ/演出の盛りすぎ | 商品の向きを固定、色・素材・ロゴ位置を文で固定、動きは商品以外(カメラ・背景)に持たせる | medium |
| セリフの早口/話者違い | 尺に対して長い、話者ラベル不統一 | 音読して秒数確認、話者に安定したラベル、短く | medium |
| 音のごちゃつき | 音声指示が曖昧 | Dialogue/SE/BGM を分離して書き、不要な層は "no music" 等で明示的に消す | medium |
| 参照ドリフト | 参照画像の役割が不明確・競合 | 1参照=1役割を明文化、最も明確なアイデンティティ画像を残す | medium |
| スタイル矛盾 | "photorealistic anime" 等 | スタイルは1系統に統一 | medium |
| 尺の上限 | 1回15秒まで | extend(base H3, 〜30秒)か後編集で結合 | high |
| H3 Max の解像度 | 768pまで（2K不可） | 2K が要る納品は base H3 を使う。SNS 広告は 768p で十分なことが多い | high |
| 旧ブラケット構文の混用 | [Push in] 等が効かない/悪影響 | H3系では自然文でカメラを書く | medium |

反復改善の作法: プロンプトと設定を毎回保存し、失敗を平文で記録し、**1回に1変数だけ**変えて再試行する。
出典: https://cdance.ai/blog/minimax-h3-prompt-guide — confidence: medium

---

## 5. すぐ使えるテンプレート（広告用）

```
[アスペクト比・秒数・スタイル契約]  e.g. Vertical 9:16, 8 seconds, hyperrealistic commercial style.
[0s-Xs] フック: 最も強い視覚イベント + カメラ1ムーブ
[Xs-Ys] 展開: 商品ディテール（色・素材・ロゴ位置を固定）
[Ys-Zs] 決めカット: 終了フレームの状態を明記
Audio: SE具体名(入りタイミング) / セリフは引用符で正確に / 不要層は no music 等で否定
Negative: No on-screen text, no cuts, do not add other people, do not misspell ...
```
confidence: 各ガイドの合成（medium）

## 主要出典一覧

- fal 公式 H3 Max: https://fal.ai/minimax-h3-max (high)
- fal 公式 H3 解説: https://fal.ai/learn/tools/minimax-h3-explained / https://fal.ai/minimax-h3 (high)
- fal 発表ポスト: https://x.com/fal/status/2083008450460541238 (high)
- Artificial Analysis 評価: https://x.com/ArtificialAnlys/status/2092717615739494424 (high)
- 公式45プロンプト分析: https://www.atlascloud.ai/blog/tips/minimax-h3-prompt-guide (medium)
- プロンプトガイド: https://cdance.ai/blog/minimax-h3-prompt-guide / https://reapi.ai/blog/minimax-h3-prompt-guide / https://www.inreels.ai/blog/minimax-h3-prompt-guide (medium)
- スペック/価格まとめ: https://www.orcarouter.ai/blog/minimax-h3-hailuo-3-explained (medium)
