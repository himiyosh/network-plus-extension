---
applyTo: "**"
description: "ナレッジ検索・調査エージェント構築ルール（出典グラウンディング / 多エージェント品質ゲート / 評価駆動 / MCP オーケストレーション）"
---

# AI ナレッジ・調査エージェント構築ルール

この文書は、**外部ソース（ドキュメント / Wiki / Issue トラッカー / テレメトリ / ログ / API）を検索し、出典付きで回答する「ナレッジ検索・調査エージェント」**を、ハルシネーションを抑えつつ品質を測定可能な形で構築・運用するための共通ルールです。

単発のコード生成ではなく、**複数のサブエージェントが検索・委任・レビューを行い、出典に基づいて結論を出す**タイプのシステム（RAG エージェント、サポート調査エージェント、社内ナレッジ Bot、マルチエージェント・オーケストレーション）に効きます。実運用したマルチエージェント調査システムから、ドメイン非依存の部分だけを抽出しています。

> **対になる文書**:
>
> - 作業の進め方（探索計画検証・ブランチ・UI 品質・セキュリティ）は `agentic-engineering-rules.md`。
> - 応答スタイル・言語・自己改善・エンコーディング・MCP の基本は `agent-persona-rules.md`。
>
> 本書はそれらと重複させず、**「出典に基づく信頼できる回答」「多エージェント品質ゲート」「評価駆動」「MCP オーケストレーション」**という net-new な役割だけを扱います。

---

## 0. この文書の使い方

- すべてのルールに `MUST / SHOULD / MAY` の強度を付けています。プロジェクトごとに、どれを MUST として採用するかを `copilot-instructions.md` で宣言してください。
- 全部を一度に強制しない。検索・調査・出典提示を伴うエージェントを 1 つでも作るなら、まず **1.（出典グラウンディング）** から導入するのが費用対効果が高い。
- ドメイン固有名（具体的な Wiki 名、テレメトリストア名、サービス名、社内ポリシー）は各プロジェクト側に置き、本書は**仕組みだけ**を共通化する。

| 強度 | 意味 |
| --- | --- |
| MUST | 破ると回答の信頼性・安全性・運用に重大な問題が出る（出典なし断定、誤 URL、顧客情報の外部送信） |
| SHOULD | 原則守る。例外時は理由を記録する（Evidence Ledger、Reviewer 順次実行、accuracy 計測） |
| MAY | 状況に応じて採用する（Decision Record、Persona 追加、複数モード） |

---

## 1. 出典グラウンディング（Evidence-Grounded Output）

> 調査・検索エージェント最大のリスクは、**出典にない結論を自然な文章で補完してしまう**こと。以下は「事実」と「推論」を構造的に分離する仕組みです。

### 1.1 No-Inference Gate（MUST）

- 出典に**明示的に書かれている事実だけ**を回答に含める。出典にない情報を論理的推論で補い、断定として書かない。
- 出典から直接読み取れない場合は、断定せず **「出典に明記なし - 要確認」** と書き、確認方法を添える。
- 推論を提示する場合は **「推定（根拠: …）」** と明示し、事実と視覚的に分離する。
- **回答出力の直前に No-Inference ゲートを 1 回実行する**。各主張について「出典の文言から直接読み取れるか / 論理的飛躍がないか」を点検する。

No-Inference チェックリスト（回答前に毎回）:

1. 各主張に**出典（URL / 記事名 / クエリ / ファイル名）**が紐づいているか。
2. 各主張は出典の文言から**直接**読み取れるか（飛躍がないか）。
3. 「期待動作」「仕様」「不要」等の断定に一次ソースがあるか。
4. 出典にない情報を「〜と考えられる」で事実化していないか。

1 つでも NG なら、該当箇所を「出典に明記なし - 要確認」または「推定（根拠: …）」に直してから出力する。

### 1.2 Evidence Ledger（SHOULD）

調査レポート・分析回答には、結論の前後に**証拠台帳**を置く。集計結果や一部のログから全体傾向を断定しないための装置。

| 列 | 内容 |
| --- | --- |
| Evidence ID | `E-001` 形式 |
| Source | Docs / Wiki / Issue / Log / Telemetry / API など種別 |
| Source URL / Query | URL、ID、クエリ、ファイル名 |
| Finding | 直接確認できた事実 |
| Supports | この証拠が支える結論 |
| Limitations | 直接確認**できていない**点 |

- 集計クエリ（count / group by 等）の結果から個別要素の帰属を推論したら、**個別フィルタで裏付けクエリを実行**してから「確認済み」と書く。集計だけに基づく推論は「推定」と明記する。
- 「確認済み」と「推定」を厳密に区別する。直接読み取れた事実のみ「確認」。

### 1.3 Superseded Findings（棄却した仮説の退避 / SHOULD）

- 調査途中で立てて**後に棄却した初期仮説**が、最終回答・レポートに残らないようにする。
- 棄却した仮説は削除ではなく、**`## Superseded Findings`（棄却済み所見）** セクションへ退避し、「なぜ棄却したか」を 1 行添える。
- これにより「途中の見解」と「最終結論」が混ざらず、レビュー時に判断経緯を追える。

### 1.4 Source URL Validation Gate（MUST）

URL を**推測で組み立てない**。検索結果・取得結果から得た URL のみを根拠にする。

- URL の状態を分類して扱う: `verified`（取得・存在確認済み） / `unverified`（未確認） / `forbidden`（権限不足） / `404 疑い`。
- 未確認 URL を「根拠」として断定に使わない。出すなら「未確認」と明示する。
- 特殊文字（アポストロフィ、スペース、`&` 等）を含むパスは **URL エンコード**してから Markdown リンクに埋め込む。リンク構文（`[text](url)`）が閉じているか出力前に確認する。
- 認証が必要な内部リンク（社内 Wiki / Issue / Code）は **「社内限定（要 VPN / 認証）」と注記**し、外部・顧客にそのまま転送しない。
- ID ベースの URL（`/page/{id}/...`）が最も安定する場合は、推測しやすいパスベース URL より ID ベースを優先する。`{id}` は検索結果由来の値のみ使い、**ハッシュ計算・類似ページからのコピーで捏造しない**。確定できなければリンクを省略し、検索語を案内する。

### 1.5 ドキュメント鮮度チェック（SHOULD）

検索スニペットには、ページ冒頭の **Important / Deprecated / Preview バナーが含まれない**ことがある。

- ライセンス・課金・廃止・GA/Preview 状態など**変化しやすい情報**をスニペットから引用する場合は、**全文を取得して冒頭バナーを確認**してから回答する。
- 「Starting {date}」「Effective {date}」等は現在日付と比較し、発効済みかを判断する。
- スニペットと全文が矛盾したら**全文（特に冒頭バナー）を正**とする。社内ナレッジと公式ドキュメントが食い違う場合は公式を正とし、社内ナレッジの更新遅延を疑う。

---

## 2. 多エージェント品質ゲート（Quality Gate）

> 1 つのエージェントが「生成」と「検証」を兼ねると、自分の誤りに気づきにくい。**回答を生成する Orchestrator** と、**検出のみ行う Reviewer**（Critic / 反証 / ペルソナ）を分離する。

### 2.1 Reviewer は回答を所有しない（MUST）

- **Orchestrator（生成役）が最終回答の所有者であり続ける**。Reviewer は最終回答を直接生成せず、**検出事項と修正提案のみ**返す。
- Orchestrator は Reviewer 結果を無条件採用しない。**採用 / 棄却 / 修正 / 保留**を自分で判断する。
- Reviewer の全文を、そのまま利用者向け回答に貼らない（要点だけ反映）。
- Reviewer（特にペルソナ）には**顧客情報・PII・生ログを渡さない**。必要ならプレースホルダー化する。

### 2.2 Quality Gate モード（SHOULD）

回答の重要度に応じてレビュー強度を変える。常時フルレビューは遅くなる。

| モード | 用途 | 実行 Reviewer |
| --- | --- | --- |
| `off` | 単純な事実提示、速度優先を明示 | なし |
| `fast` | 通常の技術回答 | Critic + 主要ペルソナ 1 |
| `balanced`（既定） | 高品質回答 | Critic + 反証 Critic + ペルソナ 2 |
| `full` | 外部公開回答、エスカレーション、断定 | Critic + 反証 + 関連ペルソナ全件 |
| `human_review_required` | 重大リスク / 影響大 | 回答を止め、人間に確認を求める |

Reviewer の役割分担例（ドメインに合わせて読み替える）:

- **Critic**: 事実確認、出典照合、矛盾検出、信頼度スコア付与。
- **Adversarial（反証）Critic**: coverage-first。重要度で絞る前に、根拠不足・過剰断定・代替仮説・見落としを**広めに**列挙する。
- **Persona Reviewer**: 外部検索しない。利用者視点での実行可能性・読みやすさ・不足質問のみを確認（例: 管理者視点 / エンドユーザー視点）。

### 2.3 Severity と Finding Category（SHOULD）

検出は重要度と種別でタグ付けし、Orchestrator の動作を決める。

| Severity | 意味 | Orchestrator の動作 |
| --- | --- | --- |
| `BLOCKER` | 事実誤り、ポリシー違反、出せない表現 | 回答停止。修正または人間確認 |
| `HIGH` | 根拠不足、過剰断定、実行不能な次アクション | 修正してから回答 |
| `MEDIUM` | 注記・条件・追加確認で改善できる | 反映または補足化 |
| `LOW` | 読みやすさ・冗長さ | 余裕があれば反映 |

Finding Category 例: `unsupported_claim` / `over_inference` / `source_conflict` / `stale_information` / `procedural_gap` / `actionability` / `readability` / `policy_or_privacy` / `missing_question` / `alternative_hypothesis`。

### 2.4 Reviewer Output Schema（SHOULD）

Reviewer は**形式を固定**する。Reviewer ごとに別形式（独自の `Decision: FAIL` 等）を許すと、Orchestrator が統合できない。

```markdown
## Quality Gate Review

### Reviewer
{Reviewer 名}

### Overall Decision
| Field | Value |
|---|---|
| readiness | READY / NEEDS_REVISION / BLOCKED |
| highest_severity | NONE / LOW / MEDIUM / HIGH / BLOCKER |
| confidence | HIGH / MEDIUM / LOW |

### Findings
| # | severity | category | finding | evidence_gap | recommended_action |
|---|---|---|---|---|---|

### Required Revisions
- {なければ None}

### Optional Improvements
- {なければ None}
```

### 2.5 Reviewer は順次実行する（SHOULD）

- 複数 Reviewer を**並列**に呼ぶと、実行結果の混線やペルソナ出力の重複が起きやすい。**順次**実行し、各結果を確認してから次へ進む。
- `BLOCKER` が明確になった時点で後続 Reviewer を省略し、`human_review_required` へ移行してよい。
- ある Reviewer が**名前解決できず**呼べない場合でも、Quality Gate 全体を省略しない。呼べる Reviewer で不足観点を補い、registry 反映漏れ（要リロード）を最後に明示する（→ 6. Failure Triage）。

### 2.6 Decision Record（MAY）

中期運用では、ゲート実行を最小スキーマで記録すると改善に効く。

| Field | 内容 |
| --- | --- |
| `schemaVersion` | `quality-gate/v1` |
| `mode` | off / fast / balanced / full / human_review_required |
| `answer_type` | 回答種別（外部回答 / 調査サマリ / エスカレーション / 内部メモ 等） |
| `delegated_reviewers` | 実行した Reviewer |
| `findings` | severity, category, action の要約 |
| `final_decision` | blocked / revised / human_review_required |
| `metrics` | blocker_count, high_count, latency_seconds |

---

## 3. コンポーネント責務分離（Agent / Skill / Prompt / Instruction）

> 検索・知識・テンプレートを 1 つのエージェントに詰めると、常時ロードが膨らみ起動条件が曖昧になる。役割で分ける。

| コンポーネント | 役割 | 横展開時の注意 |
| --- | --- | --- |
| **Agent** | ツール使用・検索・委任・レビュー。**独立コンテキスト**が必要な実行主体 | 出力契約・failure handling・停止条件を明示する |
| **Skill** | 必要時だけ読む知識パック・テンプレート・判断表 | frontmatter を短くし、詳細は参照ファイルへ分ける |
| **Instruction** | 適用範囲を持つルール | `applyTo` を狭くし、全体適用を増やしすぎない |
| **Prompt** | 単発ワークフローの入口 | 入口を薄くし、実体は script / skill / docs に逃がす |

### 3.1 Agent と Skill の判断（SHOULD）

以下のいずれかなら **Agent**: 独立した重い MCP を多数使う / 長文の検索結果で親コンテキストを圧迫したくない / 並列実行したい / 異なる責務で隔離が必要 / `@名前`で直接呼びたい / 第三者視点のロールが必要。

以下のいずれかなら **Skill**: 主体がテンプレート・ガイドライン・手順 / 専門知識をキーワードでオンデマンドロード / 複数 Agent から再利用 / 短時間で完結。

### 3.2 Progressive Disclosure / Context Policy（SHOULD）

- **常時ロードしてよいもの**: 短い共通ルール、適用範囲の狭い instruction、各 Agent の薄い定義。
- **常時ロードしないもの**: 大きな参照テーブル、ログ構造リファレンス、スキーマ、長いテンプレート。これらは**必要時に参照ファイルとして読む**。
- 重要情報を巨大文書の**中央に埋めない**（"Lost in the Middle"）。先頭・末尾・参照ファイルに分ける。

### 3.3 リファクタリングの危険信号

- **Agent にしたが Skill が適切**: 中身がテンプレートを埋めるだけ / MCP 宣言が形骸化 / 親との情報往復が冗長 / 並列も長文検索もない。
- **Skill にしたが Agent が適切**: 途中で重い MCP を複数呼ぶ必要が出た / 長文結果で親を圧迫 / 並列したい / `@`直接起動の要望が出た。

---

## 4. 評価駆動（Eval-Driven）

> 「対象がテストに含まれている（coverage）」と「期待どおり動いた（accuracy）」は別物。体感ではなくデータで測る。

### 4.1 Coverage と Accuracy を分ける（MUST）

- **Coverage**: 対象 Agent / Skill / route / cluster が評価セットに含まれている割合。
- **Accuracy**: 実応答の `actual` が `expected` と一致した割合。
- 評価セット（JSONL 等）に `expected_*` を書くだけで満足しない。**実応答で選ばれた `actual_*` を記録**して突合する。

| メトリクス | 意味 |
| --- | --- |
| Coverage | 評価セットに対象が含まれている割合 |
| Accuracy | actual が expected と一致した割合 |
| Gate pass rate | lint / parse / consistency / smoke が PASS した割合 |
| Regression count | 前回 PASS → FAIL に変わった件数 |

### 4.2 評価データは匿名・合成（MUST）

- テストケースには**顧客情報・PII を含めない**。匿名・合成データで routing / workflow / quality gate を評価する。
- 評価結果 JSON はローカル出力し、Git 追跡対象や外部ツールに送らない。

### 4.3 ローカル品質ゲートを 1 コマンド化（SHOULD）

- lint / encoding（U+FFFD scan）/ parse / consistency / smoke を**単一コマンド**にまとめる。個別実行は抜け漏れる。
- root 許可ファイル・生成物 denylist・例外 allowlist を `project-structure-rules.json` 相当で**repo ごとに**定義し、root 汚染や生成物の誤追跡を検出する。
- CI 化できる repo では同じゲートを PR validation に載せる。

最小テンプレート例:

```text
docs/customization/
├── authoring-standards.md        # 責務分離・frontmatter・出力契約・検証基準
├── improvement-history.md        # 改善前/後・期待効果・検証・参考資料
└── cross-project-practices.md    # 他プロジェクトへ持ち出す知見
tests/
├── README.md                     # 匿名評価データの場所・禁止ルール・実行コマンド
└── routing.jsonl                 # expected_* を定義
scripts/maint/
├── run-smoke-tests.*             # coverage と accuracy を分けて測る
├── validate-repo.*               # lint/encoding/parse/consistency/smoke を一括
└── project-structure-rules.json  # root 許可・生成物 denylist・allowlist
```

---

## 5. MCP + サブエージェント オーケストレーションの落とし穴

> MCP の基本利用ルールは `agent-persona-rules.md` を参照。本節は**複数サーバー定義 × サブエージェント委任**で踏みやすい固有の罠を扱う。

- **サーバー名は完全一致（MUST）**: Agent の `tools` 参照は、MCP 設定ファイルのサーバー名と**case-sensitive で完全一致**させる。省略名・別名は解決失敗の原因。
- **両方を同時更新（MUST）**: サーバーを追加・改名したら、**MCP 設定**と**参照する Agent の `tools`** を**同一コミット**で更新する。整合性チェックを 1 コマンド化しておく。
- **ユーザーレベル設定の上書きに注意（SHOULD）**: ユーザープロファイル側の MCP 設定が、ワークスペース設定を**上書き**することがある。ワークスペースを一意のソースにしたいなら、ユーザー側を空に保つ。
- **`disabled: true` の残存（SHOULD）**: 過去の事故対応で残ったフラグが原因で「未接続」に見えることがある。設定を grep で一括スキャンする。
- **委任前に warm-up（SHOULD）**: サブエージェント委任は、MCP の遅延起動（lazy spawn）のトリガーにならないことがある。**Orchestrator 側でツールを 1 回呼んで warm-up**してから委任する。warm-up したい MCP は**親 Agent の `tools` にも宣言**が必要（子だけでは不可）。
- **設定変更はリロード必須（MUST）**: `tools` frontmatter や MCP 設定の変更は、エディタの再読み込み（reload window）まで反映されないことがある。

---

## 6. 失敗時の切り分け（Failure Triage / MUST）

ツールやエージェントが失敗したとき、**「未接続」「見つからない」と曖昧に報告しない**。原因を分類して、正確な原因と修復手順を返す。

| 失敗パターン | 切り分け手順 |
| --- | --- |
| subagent not found | ファイル存在 → frontmatter `name:` 一致 → diagnostics → Agent picker 非表示設定 → 新規チャットの registry 反映（要リロード）を順に確認 |
| MCP tool が見つからない | deferred tool loading → limit / namespace → サーバー名一致 → user-level 設定の上書き → disabled flag を確認 |
| 認証エラー | エラー文字列で分類（トークン期限切れ → 再ログイン案内 / 権限不足 → アクセス権確認 / CLI 未導入 → 環境設定）。汎用「未接続」にしない |
| URL が開けない | 404 / 権限不足 / 未取得 / 推測 URL を分けて記録 |
| テレメトリ・クエリが実行できない | `executed` / `manual_mode` / `blocked_missing_keys` / `blocked_access` に分類して停止理由を明示 |
| Markdown / emoji 文字化け | UTF-8 no BOM、U+FFFD scan、コンソール emoji 禁止を適用（詳細は persona ルール） |

- 失敗を回避策で済ませて終わらない。**同セッション内で恒久対応**する（設定修正・整合性チェック追加・ルール更新）。「とりあえず動いた」「未接続のためスキップ」は禁止。
- 同種の失敗を 2 回受けたら、3 回目を待たずに該当ファイル（rules / constraints / lessons learned）へ恒久反映する。

---

## 7. 発見事項の記録義務（Discovery Logging Rule / MUST）

調査・トラブルシュート中に得た**技術的発見**（新しいアクセス方法・スキーマ・データソース名・設定・仕様）は、チャットの記憶に留めず**対応するファイルへ即座に書く**。

- トリガー: 新しい DB 名 / テーブル構造 / MCP 設定 / サービス仕様 / 回避策を発見したとき。
- セッション終了まで溜めない。**発見したその場で**該当ドキュメントを更新する。
- 既存記載と矛盾する発見は、追記だけでなく**既存を修正**する。
- これにより、次のセッション・他メンバーが同じ発見を再取得せずに済む（集合知の入口）。

---

## 8. 横展開・集合知化（SHOULD）

同じ失敗をプロジェクトごとに繰り返さないため、改善を**比較可能な粒度**で残す。

- 実装・ワークフロー・評価基盤を変更したら、`improvement-history.md` に **改善前 / 改善後 / 期待効果 / 検証 / 参考資料** を残す。期待効果は before/after 比較で書く。
- 他プロジェクトにも効く知見・テンプレート・スクリプトは `cross-project-practices.md` に「持ち出す観点」を書き、shared template へ昇格する。
- PR / merge ゲートに **Impact / Validation / References / Knowledge Sharing** 欄を入れ、「変更して終わり」を防ぐ。
- 月次またはリリース単位で各 repo の improvement-history を横断比較し、効いた施策は共通化、効かなかった施策は失敗理由ごと記録する。

---

## 9. チェックリスト

回答・レポートを出す前:

- [ ] 各主張に出典が紐づき、出典の文言から直接読み取れる（No-Inference Gate 通過）。
- [ ] 推論は「推定（根拠: …）」、不明は「出典に明記なし - 要確認」と明示した。
- [ ] URL は verified / 未確認 / 権限 / 404 疑いを区別し、リンク構文が閉じている。
- [ ] 棄却した初期仮説は Superseded Findings へ退避した。
- [ ] 集計からの個別推論は裏付けクエリで確認した（または「推定」と明記）。

エージェントシステムを構築・改修したら:

- [ ] Agent / Skill / Prompt / Instruction の責務が混ざっていない。
- [ ] 大きな参照は常時ロードせず、参照ファイル化した。
- [ ] Quality Gate の Reviewer は順次実行し、Orchestrator が採否を判断する。
- [ ] coverage と accuracy を分けて測り、actual を記録した。
- [ ] MCP サーバー名一致・両方同時更新・warm-up を確認した。
- [ ] 失敗は分類して報告し、恒久対応した。
- [ ] 発見事項を該当ファイルへ書き、improvement-history を更新した。

---

## 引用元・参考資料一覧

- OpenAI: Prompt Engineering / Optimizing LLM Accuracy（ground truth 評価で失敗理由を分解し、prompt / retrieval / fact-checking のどこを直すか判断）。
- Anthropic: Building Effective Agents / Prompting Best Practices / Evaluation Tool（simple and composable、role と output contract の明示、review / refine、test cases と side-by-side 比較）。
- Anthropic: The Complete Guide to Building Skills for Claude（Progressive Disclosure、オンデマンド化、参照ファイル分離）。
- Google: Prompt Design Strategies（objective / instructions / constraints / context / output format、prompt health checklist）。
- Microsoft: Declarative Agent Instructions（Purpose、Goal / Action / Transition、Output Contract、Self-evaluation）。
- 研究概念: RAG（出典で grounding）、ReAct（reasoning と tool action を環境結果で更新）、Lost in the Middle（重要情報を中央に埋めない）、MemGPT（長期状態・改善履歴・評価結果を外部へ逃がす）。

---

## 注意

- 本書はドメイン非依存の**仕組み**だけを共通化している。具体的なソース名・サービス名・社内ポリシー・顧客データ取り扱い規定は、各プロジェクトの `copilot-instructions.md` 側に置くこと。
- 顧客情報・PII・機密データを、評価データ・外部検索クエリ・Reviewer・サードパーティ MCP に送らない、という原則はすべてのプロジェクトで MUST とする（具体的な分類・転送経路の制約は各組織のポリシーに従う）。
