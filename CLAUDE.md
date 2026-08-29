# CLAUDE.md

作業セッションの終わりに `journal/YYYY-MM-DD.md` へ公開前提の作業ジャーナルを書く(なければ作成、同日は追記)。内容: Done / Spent / Learnings / Next。secrets・個人情報(電話番号、住所等)・非公開URLは書かない。予算消費は失敗分も含め正直に記録する。

自動ジョブ(GitHub Actions daily/weekly)も `appendJournal` で同じジャーナルに追記する。自動実行の痕跡(予算チェック、判断、消費)も必ず公開ジャーナルに残すこと。

LLM呼び出しは必ず `src/llm/policy.ts` の `modelFor(role)` でモデルを選ぶ。fable-5は仮説系(hypothesis role)のみ・週3回上限。詳細は docs/model-policy.md。

生成・仮説・評価のLLMプロンプトを組むときは `src/llm/knowledge.ts` の `loadKnowledge()` で `prompts/knowledge/` の該当ドメインを読み込むこと。知識の追加・更新は出典とconfidence付きで(規律は prompts/knowledge/README.md)。
