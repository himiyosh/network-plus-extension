# Network+ for DevTools — 改善・新機能提案レポート

> 初回生成日: 2026-03-09
> 初回分析対象バージョン: 1.4.0
> 現在のリリース: 1.8.0
> 初回分析対象スナップショット: 2026-03-09 時点の v1.4.0 (`panel.js` 2400+ 行・15 セクション、`panel.css`、`panel.html`、`manifest.json`)

---

## Current state (2026-08-18, v1.8.0)

`package.json`、`manifest.json`、README、`panel.js`、`package-lock.json` のリリースメタデータは v1.8.0 で同期している。GitHub Release には、同じ確定コミットから生成した `network-plus-extension-1.8.0.zip` を添付する（公開は未実施）。

Cycle 1 で提案したコマンドコピー、フィルタープリセット、統計、Waterfall、ショートカット一覧、2 リクエスト比較、レスポンス Body 検索、カラム並べ替えは Cycle 2 以降で実装され、その後の回帰修復とハードニングも Cycle 3〜7 に記録している。現行 README は保持上限、sanitized outbound data、アクセシビリティ、HAR/SAZ import、Edge / Chrome 対応、サポート導線を含む v1.8.0 の機能と制約を正としている。

現行の品質ゲートは Jest、ESLint、version sync、Prettier、text/lock/package integrity、audit、coordinator contract で構成され、CI は Node.js 22/24 で実行する。本レポート内の `43/43` や `54/54` などの正確な件数は 2026-03-09 の履歴値であり、現在のテスト総数を表さない。

---

## Cycle 1: 初回分析 (2026-03-09)

この Cycle の機能評価、提案、行数、テスト数、ロードマップはすべて 2026-03-09 時点の v1.4.0 スナップショットであり、現在の未実装一覧や将来計画ではない。後続 Cycle での実装・修復履歴を削らず、当時の判断根拠として保存する。

### 実施した改善 (2026-03-09 v1.4.0 スナップショット)

| # | 種別 | 内容 | コミット |
|---|---|---|---|
| 1 | fix | ESLint `no-undef` エラー修正 (`TextDecoder`/`TextEncoder` をグローバルに追加) | `82efcab` |
| 2 | docs | unified-project-rules.md 準拠 (README 構造改善、es-metadata.yml、.gitignore 整備) | `299de75` |
| 3 | feat | UI/UX Review Agent 作成 (6 軸レビューフレームワーク) | `299de75` |
| 4 | feat | NetworkPlusAgent 統合オーケストレーター作成 (8 ロール自動選択) | `82efcab` |

### UI/UX レビュー結果 (2026-03-09 v1.4.0 スナップショット)

| 軸 | 状態 | 指摘事項 |
|---|---|---|
| 🎨 テーマ一貫性 | ✅ OK | 4 箇所すべてにテーマ変数定義済み。ハードコード色値なし |
| 📐 レイアウト・密度 | ✅ OK | `.topbar` の border-top でレイアウトジャンプ防止済み |
| ⌨️ 操作性・キーボード | ✅ OK | Ctrl+F、上下キー、ソート、フィルタ、タブ切替すべて実装 |
| 🔒 XSS 安全性 | ✅ OK | innerHTML 使用 1 箇所のみ (静的 SVG リテラル)。ユーザーデータとの結合なし |
| 📊 データ表示品質 | ✅ OK | Status/Method/Duration の色分け、fmtBytes/fmtTime のフォーマット、空状態メッセージ |
| 🧹 コード品質 | ✅ OK | 当時の結果: ESLint 0/0、Jest 43/43 PASS、15 セクション構成準拠 |

---

### 🔍 新機能提案 (2026-03-09 v1.4.0 スナップショット)

#### 当時の機能マップ

| カテゴリ | 当時の実装済み | 当時の未実装 (提案対象) |
|---|---|---|
| キャプチャ | リアルタイムキャプチャ, Pause/Resume | ウォーターフォール表示 |
| フィルタ | グローバル, カラム別, 正規表現, 複合条件 | フィルタプリセット保存/復元 |
| 表示 | 11 カラム, ソート, リサイズ, 表示切替 | カラムドラッグ並替永続化 |
| 詳細パネル | Fiddler 風タブ, JSON ハイライト, Copy | cURL/fetch/PowerShell コピー |
| エクスポート | HAR エクスポート | — |
| インポート | HAR/SAZ インポート | — |
| テーマ | System/Dark/Light 3 モード | — |
| 操作 | キーボードナビ, 右クリック, ハイライト, マルチ選択 | ショートカット一覧 |
| 連携 | Initiator リンク | cURL/fetch/PowerShell コピー |

#### 当時の提案一覧

| # | 優先度 | 機能名 | カテゴリ | 工数 | 実装セクション |
|---|---|---|---|---|---|
| 1 | **P0** | cURL / fetch / PowerShell コマンドコピー | 連携 | 🟢 S | Section 13 (Detail Panel) |
| 2 | **P0** | フィルタプリセット保存・復元 | フィルタ | 🟡 M | Section 7 + Section 15 |
| 3 | **P1** | リクエスト統計サマリーパネル | 分析 | 🟡 M | Section 12 (Rendering) |
| 4 | **P1** | タイミングウォーターフォール表示 | 可視化 | 🔴 L | Section 13 + CSS |
| 5 | **P1** | キーボードショートカット一覧 (Help) | 操作性 | 🟢 S | Section 15 + HTML |
| 6 | **P2** | リクエスト diff 比較 | 分析 | 🔴 L | Section 13 拡張 |
| 7 | **P2** | レスポンスボディ検索 | フィルタ | 🟡 M | Section 7 |
| 8 | **P2** | カラムドラッグ並べ替え永続化 | 表示 | 🟡 M | Section 6 + Section 12 |

#### 当時の提案詳細

##### #1: cURL / fetch / PowerShell コマンドコピー (P0 🟢)

- **概要**: 選択したリクエストを cURL / fetch / PowerShell (Invoke-WebRequest) コマンドとしてクリップボードにコピー
- **ユーザー価値**: DevTools の「Copy as cURL」相当。開発者が API デバッグ時に最も頻繁に使う操作。毎日数十回使われうる高頻度機能
- **実装セクション**: Section 13 (Detail Panel) — 右クリックメニューまたは詳細パネルにボタン追加
- **リスク**: なし (navigator.clipboard.writeText は DevTools パネルで使用可能)
- **依存関係**: なし

##### #2: フィルタプリセット保存・復元 (P0 🟡)

- **概要**: 現在のフィルタ設定 (グローバル + カラム別) を名前付きプリセットとして chrome.storage.local に保存・復元
- **ユーザー価値**: 特定のデバッグシナリオ (「API のみ」「エラーのみ」「特定ドメイン」) を毎回手作業で設定する手間を削減
- **実装セクション**: Section 7 (Filtering) + Section 15 (Init) — ツールバーにプリセット選択 UI
- **リスク**: storage 容量制限 (chrome.storage.local は 10MB)。プリセット数に上限を設ける
- **依存関係**: chrome.storage.local (既存権限)

##### #3: リクエスト統計サマリーパネル (P1 🟡)

- **概要**: ステータスバーまたは折りたたみパネルに統計表示 — 合計リクエスト数、HTTP メソッド分布、ステータスコード分布、合計転送サイズ、平均レスポンス時間
- **ユーザー価値**: ページのネットワーク健全性を一目で把握
- **実装セクション**: Section 12 (Rendering)
- **リスク**: フィルタ変更のたびに再計算。debounce で軽減
- **依存関係**: なし

##### #4: タイミングウォーターフォール表示 (P1 🔴)

- **概要**: Chrome DevTools 風に、各リクエストのタイミングを横棒グラフで視覚化。DNS/Connect/TLS/TTFB/Content を色分け
- **ユーザー価値**: ボトルネック特定が視覚的に即可能。Fiddler タイムライン相当
- **実装セクション**: Section 13 + CSS
- **リスク**: 大量リクエスト時のレンダリングパフォーマンス
- **依存関係**: なし

##### #5: キーボードショートカット一覧 (P1 🟢)

- **概要**: `?` キーまたは Help ボタンでショートカット一覧をオーバーレイ表示
- **ユーザー価値**: 既存ショートカットの発見可能性を向上
- **実装セクション**: Section 15 + HTML/CSS
- **リスク**: なし
- **依存関係**: なし

##### #6: リクエスト diff 比較 (P2 🔴)

- **概要**: 2 つのリクエストのヘッダー・クエリ・ボディの差分を並列比較
- **ユーザー価値**: 成功/失敗 API コールの違いをヘッダー単位で特定
- **実装セクション**: Section 13 拡張 (マルチ選択活用)
- **リスク**: 大きな JSON ボディの diff パフォーマンス
- **依存関係**: なし

##### #7: レスポンスボディ検索 (P2 🟡)

- **概要**: キャッシュ済みレスポンスコンテンツから特定文字列・JSON キーを検索
- **ユーザー価値**: 「どの API レスポンスに特定のエラーメッセージが含まれるか」を特定
- **実装セクション**: Section 7 (Body contains 演算子追加)
- **リスク**: レスポンスボディ未キャッシュ時の制限
- **依存関係**: なし

##### #8: カラムドラッグ並べ替え永続化 (P2 🟡)

- **概要**: カラムヘッダーのドラッグ&ドロップで並び順を変更し localStorage に永続化
- **ユーザー価値**: 作業スタイルに合わせたカラム配置カスタマイズ
- **実装セクション**: Section 6 + Section 12 (drag-over CSS は既存)
- **リスク**: カラムリサイズとの競合
- **依存関係**: なし

#### 当時の推奨ロードマップ

```
v1.5.0 (次回リリース):
  [P0] #1 cURL/fetch/PowerShell コピー     🟢 S
  [P0] #2 フィルタプリセット保存・復元      🟡 M
  [P1] #5 キーボードショートカット一覧      🟢 S

v1.6.0:
  [P1] #3 リクエスト統計サマリー            🟡 M
  [P2] #7 レスポンスボディ検索              🟡 M
  [P2] #8 カラムドラッグ並替永続化          🟡 M

v2.0.0 (メジャー):
  [P1] #4 タイミングウォーターフォール      🔴 L
  [P2] #6 リクエスト diff 比較              🔴 L
```

---

## Cycle 2: 全機能実装 (2026-03-09)

### 実装結果

| # | 優先度 | 機能名 | 状態 | コミット |
|---|---|---|---|---|
| 1 | P0 | cURL / fetch / PowerShell コピー | ✅ 完了 | `577af76` |
| 2 | P0 | フィルタプリセット保存・復元 | ✅ 完了 | `577af76` |
| 3 | P1 | リクエスト統計サマリーパネル | ✅ 完了 | `577af76` |
| 4 | P1 | タイミングウォーターフォール表示 | ✅ 完了 | `577af76` |
| 5 | P1 | キーボードショートカット一覧 | ✅ 完了 | `577af76` |
| 6 | P2 | リクエスト diff 比較 | ✅ 完了 | `577af76` |
| 7 | P2 | レスポンスボディ検索 | ✅ 完了 | `577af76` |
| 8 | P2 | カラムドラッグ並替永続化 | ✅ 既存実装 | (v1.4.0 で実装済み) |

### 品質ゲート (2026-03-09 v1.4.0 実装時スナップショット)

| チェック | 結果 |
|---|---|
| Jest テスト | ✅ 当時 54/54 PASS (11 新規テスト追加) |
| ESLint | ✅ 0 errors, 0 warnings |
| Version sync | ✅ OK (1.4.0) |

### 追加テスト

- `generateCurl`: 3 テスト (null, GET, POST with headers/body)
- `generateFetch`: 3 テスト (null, GET, POST with headers/body)
- `generatePowerShell`: 3 テスト (null, GET, POST with headers)
- `computeStats`: 2 テスト (empty, multi-row statistics)

---

## Cycle 3: v1.6.0 リリースハードニング (2026-07-25)

### リリース結果

- PR #9〜#12 で統合したresponsive/a11y、data-integrity、batch rendering、capture retention、sanitized outbound dataをv1.6.0として確定
- 未使用の`downloads`権限を削除し、実使用する`storage`だけをmanifestと自動回帰チェックで固定
- manifest、HTML参照、local-only script、inline script禁止、CSP、UTF-8、PNG、配布allowlistを依存追加なしで検証
- 監査済みランタイム10ファイルだけを格納する再現可能なZIP作成と、Node.js 22/24のCI gateを追加
- packageをprivateにし、repository/homepage/bugs/engines、MIT LICENSE、1.6.0 release metadataを同期

---

## Cycle 4: Waterfall / Statistics — パフォーマンスと正確性の修正 (Issue #20 / PR #23, 2026-07-26)

### 実施した修正

| # | 種別 | 内容 |
|---|---|---|
| 1 | perf | `computeWaterfallRange(rows)` 純粋関数を追加し、`renderBody()` で1回だけ計算して `state.waterfallRange` にキャッシュ。`createTableRow` が毎行 `state.filteredRows` をスキャンする O(n²) を O(1) に改善 |
| 2 | fix | `appendIncrementalRows` — Waterfall 列が表示中の場合はインクリメンタル追加ファストパスを無効化。新規行追加時に既存バーの位置がずれる問題を解消 |
| 3 | fix | `computeWaterfallBar` — `offsetPct + widthPct <= 100` を保証するクランプ修正。利用可能スペースが 0.5% 未満の場合も正確に処理 |
| 4 | fix | タイミングセグメントの合計が 100% を超えた場合に正規化し、セグメントバーが fill をはみ出さないよう修正 |
| 5 | a11y | Waterfall gridcell に `aria-label="Waterfall: starts at X, duration Y"` を付与。装飾的なバー内部 (`.wf-track`) には `aria-hidden="true"` を設定 |
| 6 | test | `computeWaterfallRange` の単体テスト追加 (null/空配列、範囲なし、3行、1,000行の決定論的検証) |
| 7 | test | `computeWaterfallBar` に境界値テスト追加 (offsetPct + widthPct ≤ 100, セグメント合計 ≤ 100%) |
| 8 | test | `computeStats` 1,000行の決定論的検証 |
| 9 | test | `ui-contract.test.js` に回帰ガード追加 — createTableRow が `state.filteredRows` をスキャンしないこと、`state.waterfallRange` を使うこと、Waterfall 表示時にファストパスが無効になること、aria-label/aria-hidden の存在確認 |

### 品質ゲート

| チェック | 結果 |
|---|---|
| Jest テスト | ✅ PASS (13 新規テスト追加) |
| ESLint | ✅ 0 errors, 0 warnings |
| Version sync | ✅ OK (1.6.0) |

---

## Cycle 5: Issue #16 / PR #28 — 比較パネル完成度 (2026-07-26)

### 対象 PR

PR #28 「feat: restore two-request diff comparison」のレビューコメント対応。

### 実施した修正

| # | 種別 | 内容 |
|---|---|---|
| 1 | fix | `diffHeaders` を multimap 方式に変更し `Set-Cookie` 等の重複ヘッダーを occurrence-index でペアリングして保持するよう修正 |
| 2 | feat | `describeRequestBodyForComparison(row)` 新規追加。`requestPostData.text` をキャッシュから読み取り、`TRUNCATE_LIMIT` を適用 |
| 3 | fix | `describeBodyForComparison` / `describeRequestBodyForComparison` の両関数に `TRUNCATE_LIMIT`（2000 文字）上限を追加。超過時は `{ stateLabel: 'truncated', text: …(先頭2000文字), totalLength: N }` を返す |
| 4 | feat | 比較パネルに「Request Bodies」セクションを追加（「Response Bodies」の前に配置） |
| 5 | fix | `createBodyComparisonBlock` に `truncated` ステートの表示を追加。「showing N of M chars」ノーティスを本文の下に表示 |
| 6 | fix | 蒸発（eviction）時に `hideComparisonPanel()` を呼び出し、比較パネルを実際に非表示にするよう修正（以前は state のみクリアしてパネルが残っていた） |
| 7 | fix | `renderComparisonPanel`: 閉じるボタンのクリック時に `state.comparisonInvokingRowId` を参照してフォーカスを呼び出し元の行に復元 |
| 8 | feat | `showComparisonPanel`: `setTimeout(0)` で閉じるボタンにフォーカスを移動（コンテキストメニューのクローズ後に実行） |
| 9 | feat | `init` 内に comparePanel の `keydown` リスナーを追加し Escape キーでパネルを閉じてフォーカスを復元 |
| 10 | feat | `renderComparisonPanel`: `role="region"` + `aria-labelledby` を panel に設定し、heading に id を付与してラベル関係を確立 |
| 11 | fix | `.compare-close-btn:focus-visible` を CSS に明示追加 |

### 品質ゲート

| チェック | 結果 |
|---|---|
| Jest テスト | ✅ PASS |
| ESLint | ✅ 0 errors, 0 warnings |
| Version sync | ✅ OK (1.6.0) |

### 追加テスト

**panel.test.js**
- `diffHeaders`: `Set-Cookie` 重複保持 (2 テスト)
- `describeBodyForComparison`: truncated state / at-limit available (2 テスト)
- `describeRequestBodyForComparison`: 全ケース (8 テスト)

**ui-contract.test.js**
- `describeRequestBodyForComparison` エクスポート確認
- request body descriptor が fetch しないことの確認
- 比較パネルに Request Bodies / Response Bodies 両セクション存在確認
- `showComparisonPanel` の setTimeout フォーカス確認
- Escape キーハンドラの init 設置確認
- 閉じるボタンの invoking row フォーカス復元確認
- `diffHeaders` multimap 使用確認
- `.compare-close-btn:focus-visible` CSS 存在確認

---

## Cycle 6: フィルタープリセット・ショートカット一覧の復元 (Issue #18 / PR #29, 2026-07-25)

### 背景

Commit `2321d67` が deep search 実装時に panel.js を大幅置換し、Cycle 2 で完成させたフィルタープリセット保存/復元機能とキーボードショートカット一覧を消失させた。`docs/improvement-report.md` には完了済みと記録されているが v1.6.0 ランタイムでは機能が存在しなかった。

### 実施した修正

| # | 種別 | 内容 |
|---|---|---|
| 1 | feat | `FILTER_PRESET_KEY` / `MAX_FILTER_PRESETS` / `MAX_PRESET_NAME_LENGTH` 定数を Section 1 に追加 |
| 2 | feat | `serializeFilterState(columnFilterRules)` — ディープクローンで JSON-safe なフィルタールール複製 (キャプチャデータを含まない) を Section 3 に追加 |
| 3 | feat | `deserializeFilterState(raw)` — 不明キーを除去しデフォルト値で補完する安全な逆シリアライズ関数を Section 3 に追加 |
| 4 | feat | `normalizePresetName(name)` — プリセット名のトリム・切り詰め純粋関数を Section 3 に追加 |
| 5 | feat | `loadFilterPresets()` / `saveFilterPresets(presets)` を Section 7 (Filtering) に追加。localStorage を使用し、実 UTF-8 バイト数で上限チェック、MAX_FILTER_PRESETS を強制。`loadFilterPresets` は `{ presets, error }` を返し呼び出し元が corruption を `setStatus` で表示できる |
| 6 | feat | `createPresetDropdownContent()` UI コンポーネントを Section 11 に追加。apply / delete / save / clear-all の 4 アクションをすべて XSS-safe DOM API で実装 |
| 7 | feat | `Presets` ボタン (`aria-haspopup="dialog"`) を panel.html に追加し、Section 15 でドロップダウン表示・フォーカス復帰をワイヤリング |
| 8 | feat | ショートカットヘルプ `<dialog id="shortcutDialog">` を panel.html に追加 (静的 HTML、ユーザーデータなし)。`?` キー + `⌨️ ?` ボタンで開閉し、Esc / Close / バックドロップクリックで閉じてフォーカス復帰 |
| 9 | style | プリセットドロップダウン (`.preset-menu`, `.preset-row`, `.preset-name-input` 等) と `#shortcutDialog` / `kbd` 要素の CSS を panel.css に追加。すべての色値は CSS カスタムプロパティを使用 |
| 10 | test | `serializeFilterState` / `deserializeFilterState` / `normalizePresetName` / `loadFilterPresets` / `saveFilterPresets` の単体テストを `tests/panel.test.js` に追加 |
| 11 | test | フィルタープリセットとショートカット一覧の消失を防ぐ静的回帰テストを `tests/ui-contract.test.js` に追加 |
| 12 | docs | README と本レポートを更新 |

### 品質ゲート

| チェック | 結果 |
|---|---|
| Jest テスト | ✅ PASS |
| ESLint | ✅ 0 errors, 0 warnings |
| Version sync | ✅ OK (1.6.0) |

---

## Cycle 7: PR #30 — HAR/SAZ import hardening (2026-07-26)

### 実施した修正

| # | 種別 | 内容 |
|---|---|---|
| 1 | fix | HAR/SAZ の検証・正規化・行オブジェクト生成がすべて成功してから既存キャプチャを置換する atomic import に変更し、失敗時は元データを保持 |
| 2 | security | 入力ファイルを 32 MiB 以下、SAZ を 20,000 entry 以下、各 entry の展開後 4 MiB 以下、archive 全体の展開後合計 64 MiB 以下に制限 |
| 3 | perf | SAZ を 16 KiB chunk で streaming 展開し、同時展開を最大 4 entry に制限。保持対象となる完全な HTTP session だけを行オブジェクト化 |
| 4 | fix | hostile/malformed HAR の `log.entries`、request/response、文字列、数値、header、post-data、timing を検証・安全な型へ正規化 |
| 5 | a11y | Import を single-flight 化し、処理中はボタンと file input を無効化して `aria-busy` と状態表示を同期 |
| 6 | test | pure helper、archive budget/streaming、atomic replacement、busy state の回帰テストと 3,000-entry SAZ stress check を追加 |
| 7 | ci/review | Node.js 22/24 の既存 CI quality gates で検証し、Network+ の 6 軸 specialist review を実施 |

### 品質ゲート

PR #30 では version、repository/text/package integrity、audit、coordinator contract、構文・静的チェック、SAZ stress/data-descriptor checks、6 軸 specialist review を完了した。Jest、ESLint、Prettier は当該作業環境の依存取得障害でローカル実行できず、Node.js 22/24 CI の gate 対象とした。

---

## Cycle 8: 依存監査・フィルター正当性・CI 安定性・レビュー信頼境界 (PR #116 / #117 / #118 / #119, 2026-08-07)

> **履歴記録**: この cycle で導入した mandatory review mechanism は 2026-08-13 の repository owner 指示で廃止された。以下は当時の検証結果であり、現在の運用手順ではない。

中断していた継続改善を利用者指示で再開したバッチ。1 本ずつ独立レビュー (fresh context, adversarial) を通し、exact-head marker を得てから merge した。

### 実施した修正

| # | 種別 | PR | 内容 |
|---|---|---|---|
| 1 | security | #116 | brace-expansion を修正版 1.1.18 / 2.1.4 / 5.0.9 (GHSA-rgw5-rvv9-x895) へ lockfile 更新。js-yaml (GHSA-5p4m-2wfm-xmqj) は当初 `@istanbuljs/load-nyc-config` 配下を 5.2.2 へ override したが、これは調査の誤りだった。3.15.1 / 4.3.1 は `v3-legacy` / `v4-legacy` タグで公開済み (2026-07-31) であり、`load-nyc-config` が宣言する `^3.13.1` の範囲内の 3.15.1 で足りる。#122 で override を撤去し 3.15.1 へ是正した |
| 2 | chore | #116 | audit がクリーンになったため、期限付き一時許可 `scripts/check-audit-policy.js` をポリシー自身の指示どおり撤去し `audit:strict` を素の `npm audit --audit-level=high` に置換。放置すると 2026-08-09 の期限切れで全 CI が赤になるところだった |
| 3 | fix | #117 | Domain / Path 列フィルターの `isEmpty` / `isNotEmpty` が multiText 分岐で黙って無効化されていた欠陥を修正。評価・active 判定・条件行 UI の 3 経路を `isValuelessFilterOperator` へ統一 |
| 4 | test | #118 | browser suite の DevTools 起動待ちを deadline + 指数バックオフ + 診断付きメッセージ (経過時間・上限・最終観測) へ強化し、起動上限 15s→45s / テスト上限 45s→90s。CI の起動タイムアウト flake (run 31186834840) の恒久対策 |
| 5 | security | #119 | independent-review 検証の code-trust boundary を追加。`pull_request_target` / `issue_comment` は base repository の default branch から workflow 定義が解決される性質を使い、PR 由来のコードを一切 checkout も実行もせずに default branch の checker だけで exact-head marker を検証し、`independent-review` commit status を fail closed で発行する |

### レビュー信頼境界の検証 (#119)

独立レビューは 3 回 FAIL を返した。うち 2 回が境界の実穴を突き、1 回は文書の不正確さのみを指摘した。下表の 3 行目は review ではなく自主的な赤チーム走行で見つけたものである。

| # | 指摘 | 対応 |
|---|---|---|
| 1 | review 1 回目: pin が 6 件の改ざんを見逃す。うち `continue-on-error` + `steps.verify.conclusion` は検証失敗を success として発行する fail-open | パターン禁止方式を廃し、step allowlist・`run:` 本文の禁止構文・status 投稿規律・step 本文 digest の多層方式へ |
| 2 | review 1 回目: resolve step 失敗時に status が一切出ず required check が pending のまま残る | head を `pull_request_target` payload から取得し、PR を開く / 更新する経路から API 依存を除去 |
| 3 | 赤チーム走行: step 本文を 1 バイトも変えずに gate を無力化できる (job 級 `container:` / `defaults.run.shell` / job 級 `env:` shadowing / 2 つ目の job / `on:` `paths-ignore` / top-level `env:`) | top-level key・job id・job key の列挙と job header digest を追加 |
| 4 | review 2 回目: `on:` より上の領域がどの digest にも入らず、鍵の列挙が行 regex。Prettier 正準形の `'defaults':` で `run.shell` を差し替えても全ゲート緑 | 最終 catch-all を **workflow ファイル全体の digest** とし、regex による領域分割への依存を排除 |
| 5 | review 3 回目: 26 件の敵対的変異はすべて捕捉されたが、README と PR 本文に実装と一致しない記述が残っていた | 記述を実装に合わせ、開示していなかった 2 つの限界を本文へ明記 |

境界が実際に機能することは使い捨て PR で実測した。

```
PR #121 (checker / そのテスト / boundary テスト / trusted workflow を削除し、
         quality-gates の marker step も除去した PR)
  -> run 31224000405 が main の定義と main の checker で実行され、
     independent-review = failure を発行。PR 側に検証機構は 1 つも無い
```

### 境界が守らない範囲 (実測)

```
PR #120: repository default workflow permission = read でも、
         PR 内 workflow が permissions: statuses: write を宣言して
         commit status を投稿できた (creator=github-actions[bot], app id 15368)
         -> ELEVATION_ALLOWED
```

commit status は required checks と同じ Actions app の名前空間にあるため branch protection では投稿者を区別できなかった。当時、この境界が拘束したのは**検証ロジックであって結果の名前空間ではない**。checker / テスト / workflow の書き換えによる無自覚な弱体化は機械的に不可能になった一方、`independent-review` を投稿する workflow を意図的に追加する偽装は防げず、独立所有 GitHub App の check を issue #95 に残課題として記録した。

また `tests/trusted-review-boundary.test.js` は PR 側で編集可能な tree にあり PR 側で編集可能な Jest 設定から実行されるため、enforcement ではなく **merge レビューを効かせるための review aid** だった。強制力は base-resolved な workflow 側にあった。

### 品質ゲート

| チェック | 結果 |
|---|---|
| Jest | ✅ 813/813 (Cycle 開始時 768) |
| ESLint | ✅ 0 errors, 0 warnings |
| Prettier / version / text / integrity / extension / store / contract | ✅ すべて OK |
| npm audit --audit-level=high | ✅ 0 vulnerabilities |
| 独立レビュー | ✅ 4 PR とも exact-head marker を取得して merge |
