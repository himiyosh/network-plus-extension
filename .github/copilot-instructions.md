# Network+ for DevTools - Copilot Instructions

> 本ファイルは `network-plus-extension` プロジェクトにおける Copilot の動作ルールを定義する。
> 共通ルールは [unified-project-rules.md](../unified-project-rules.md) を参照。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| **プロジェクト名** | Network+ for DevTools |
| **目的** | Microsoft Edge DevTools に強化版の Network パネルを追加する拡張機能 |
| **技術スタック** | Vanilla JS (ES2020), CSS Custom Properties, Edge Extension (Manifest V3) |
| **ビルドツール** | なし (ビルドレス) |
| **テスト** | Jest (Node.js 環境 + ブラウザ API モック) |
| **Lint / Format** | ESLint (flat config) + Prettier |
| **対象ブラウザ** | Microsoft Edge (最新安定版, Chromium ベース) |

### アーキテクチャ

```
Microsoft Edge DevTools
  +-- devtools.html        ... chrome.devtools.panels.create() でパネル登録
       +-- panel.html       ... パネル UI
            +-- panel.js    ... 全ロジック (IIFE, 15セクション構成)
            +-- panel.css   ... テーマ対応スタイル
```

- **DevTools Panel Extension**: `chrome.devtools.network.onRequestFinished` でリクエストをキャプチャ
- **ES Modules 不可**: DevTools パネルページは `<script type="module">` をサポートしないため、**IIFE 単一ファイル構成**を採用
- **ビルドレス**: バンドラ不使用。ファイルをそのまま Edge にロードする

---

## 2. コーディング規約

### 2.1 JavaScript (ES2020)

| カテゴリ | ルール |
|----------|--------|
| **変数宣言** | `const` を基本とし、再代入が必要な場合のみ `let` を使用。`var` は使用禁止 |
| **関数** | アロー関数 (`() => {}`) を基本とする。ただし `this` バインドが必要な場合は `function` を使用 |
| **反復** | `for...of` または配列メソッド (`map`, `filter`, `some`) を使用。`for (var i=0;...)` は非推奨 |
| **DOM 生成** | `Array.from()` を使用。`Array.prototype.slice.call()` は使用禁止 |
| **文字列** | テンプレートリテラル (`` ` ``) を推奨 |
| **セミコロン** | 必須 (Prettier で強制) |
| **クォート** | シングルクォート (`'`) を使用 (Prettier 設定: `singleQuote: true`) |

### 2.2 XSS 防止 (絶対遵守)

- **`innerHTML` にユーザーデータを結合することを絶対禁止**
- ユーザー由来のデータ (URL, ヘッダー名/値, レスポンスボディ, Initiator 情報等) の DOM 描画は、以下のいずれかのみ使用:
  - `element.textContent = value`
  - `document.createElement()` + `element.appendChild()`
  - `document.createTextNode()`
- `innerHTML` の使用が許可されるケース: **静的な SVG アイコン文字列のみ** (ユーザーデータを含まないリテラル)
- 新しい UI コンポーネントを追加する際は、既存の安全なヘルパー関数を活用する:
  - `createKvGrid(items)` --- Key-Value グリッドの安全な生成
  - `createHeaderSection(title, headers)` --- ヘッダーセクションの安全な生成
  - `createTableRow(row, onClick)` --- テーブル行の安全な生成
  - `createInnerAccordionItem(title, contentEl)` --- アコーディオンの安全な生成

### 2.3 panel.js のセクション構成

`panel.js` は IIFE 内で以下の 15 セクションに分割されている。新しいコードは適切なセクションに配置すること:

| # | セクション | 内容 |
|---|-----------|------|
| 1 | **Constants** | 定数定義 (マジックナンバー禁止、名前付き定数に抽出) |
| 2 | **DOM Helpers** | `$()`, `$all()`, `setStatus()` |
| 3 | **Pure Utility Functions** | `fmtBytes()`, `fmtTime()`, `extractUrlParts()` 等 (テスト可能) |
| 4 | **State Management** | `state` オブジェクト、`filteredRows` キャッシュ |
| 5 | **Theme** | テーマの読込/保存/適用/切替 |
| 6 | **Column Preferences** | カラム設定の読込/保存 |
| 7 | **Filtering** | `filterRows()`, `getRowFilterValue()` |
| 8 | **Data Model** | `buildRowFromRequest()`, `cacheResponseContent()` |
| 9 | **Safe DOM Rendering** | `createKvGrid()`, `createHeaderSection()` |
| 10 | **Table Row Creation** | `createTableRow()` (共通化された行生成) |
| 11 | **UI Components** | `createCheckboxItem()`, `createDropdownFilter()` |
| 12 | **Rendering** | `renderHeader()`, `renderBody()`, `render()` |
| 13 | **Detail Panel** | `selectRow()`, 詳細パネル描画 |
| 14 | **Export** | `exportCSV()`, `exportHAR()`, `buildHarLogFromRows()` |
| 15 | **Initialization** | `init()`, イベントリスナー登録、ネットワークサブスクリプション |

### 2.4 テスト可能な設計

- 純粋関数 (副作用なし、DOM 非依存) は **Section 3: Pure Utility Functions** に配置し、IIFE の `return` でエクスポートする
- 既存のエクスポート対象: `fmtBytes`, `fmtTime`, `extractUrlParts`, `formatInitiator`, `parseQueryString`, `guessMimeType`, `toHarHeaders`, `debounce`, `getRowFilterValue`, `DEFAULT_METHOD_FILTERS`
- 新しい純粋関数を追加した場合は、`return` オブジェクトに追加し、対応するテストも追加すること

### 2.5 パフォーマンス

| 手法 | 説明 |
|------|------|
| **インクリメンタル追加** | 新規リクエスト到着時は全体再描画せず、`createTableRow()` で 1 行追加 |
| **DocumentFragment** | `renderBody()` でのバッチ DOM 挿入 |
| **debounce** | フィルタ入力は `FILTER_DEBOUNCE_MS` (150ms) でデバウンス |
| **filteredRows キャッシュ** | `filterRows()` の結果を `state.filteredRows` にキャッシュ |

### 2.6 CSS

| カテゴリ | ルール |
|----------|--------|
| **テーマ** | CSS カスタムプロパティ (`--fg`, `--bg`, `--border` 等) を使用。ハードコードした色値は禁止 |
| **テーマ定義箇所** | `:root` (ライトデフォルト), `@media (prefers-color-scheme: dark)`, `html[data-theme="dark"]`, `html[data-theme="light"]` の 4 箇所 |
| **新しい色の追加** | 上記 4 箇所すべてにカスタムプロパティを追加すること |
| **単位** | `px` を基本とする (DevTools パネルはズーム非対応) |

---

## 3. セキュリティ / シークレット管理

### 3.1 Content Security Policy

- `manifest.json` の `content_security_policy.extension_pages` で CSP を明示設定: `script-src 'self'; object-src 'self'`
- インラインスクリプト (`<script>` タグ内の直接コード) は CSP 違反のため使用禁止
- 外部スクリプトの読み込みは禁止

### 3.2 XSS 防止

- 上記 2.2 を絶対遵守
- `innerHTML` でのユーザーデータ描画は Pull Request でリジェクト対象

### 3.3 シークレット

- 本プロジェクトにシークレット (API キー、トークン等) は存在しない
- 今後 API 連携を追加する場合は、`chrome.storage.local` に格納し、ソースコードにハードコードしない

### 3.4 権限の最小化

- `manifest.json` の `permissions` は必要最小限に保つ
- 現在の権限: `storage` (テーマ設定永続化), `downloads` (CSV/HAR エクスポート)
- 新しい権限を追加する場合は、README の「セキュリティ」セクションに理由を記載すること

---

## 4. 社内コンプライアンスポリシー

> **参照ポリシー**:
> - REDACTED: [Guidance for Support Engineers in using Copilot Chat/Agent](https://REDACTED/en-us/topic/2551d022-d53d-4abc-c733-4aa959b7fb87)
> - REDACTED: [Handling support data (commercial customers)](https://REDACTED/en-us/topic/e7f0b758-57f8-41e9-1b42-fbea2fab36cf)

- お客様の **PII をプロンプトに直接入力してはならない**
- お客様の**パスワードの送受信は絶対禁止**
- MCP サーバーは **承認済みのみ** 使用可。オープンソース MCP サーバーでのお客様データ処理は禁止
- トラブルシューティング完了後は **Copilot ログおよびサポートデータのローカルコピーを速やかに削除**すること

---

## 5. テスト / 品質保証

### 5.1 テスト方針

| 対象 | 手法 | 場所 |
|------|------|------|
| **純粋関数** | Jest ユニットテスト | `tests/panel.test.js` |
| **DOM 操作** | 手動テスト (Edge DevTools で拡張機能をロードして確認) | - |
| **テーマ** | 手動テスト (System/Dark/Light 切替確認) | - |
| **エクスポート** | 手動テスト (CSV/HAR ファイルの内容検証) | - |

### 5.2 テスト実行

```bash
npm test                   # Jest テスト実行 (カバレッジ付き)
npm run lint               # ESLint 実行
```

### 5.3 品質ゲート

- **コミット前に必ず実行**: `npm test` と `npm run lint` が両方 PASS であること
- ESLint: **0 errors, 0 warnings** を維持 (未使用の catch 変数は `_` プレフィックスでマーク)
- Jest: **全テスト PASS** を維持
- 新しい純粋関数を追加した場合は、対応するテストも同一コミットで追加すること

### 5.4 テスト環境の制約

- DevTools パネルは ES Modules 非対応のため、テストでは `global` にブラウザ API をモックする (`tests/setup.js`)
- `panel.js` は IIFE の `return` で純粋関数をエクスポートし、末尾の `module.exports` で Node.js に公開する
- DOM 操作を含む関数 (レンダリング等) はユニットテスト対象外。手動テストで確認する

### 5.5 手動テストチェックリスト

コードを変更した後、Edge で拡張機能をリロードして以下を確認:

- [ ] DevTools に「Network+」タブが表示される
- [ ] ページをリロードするとリクエストが一覧に表示される
- [ ] グローバルフィルタが機能する
- [ ] Method/Status ドロップダウンフィルタが機能する
- [ ] 行クリックで詳細パネルにリクエスト情報が表示される
- [ ] 上下キーで行を選択できる
- [ ] CSV エクスポートで正しいファイルがダウンロードされる
- [ ] HAR エクスポートで正しいファイルがダウンロードされる
- [ ] Theme ボタンで System/Dark/Light が切り替わる
- [ ] Pause/Resume が動作する
- [ ] カラムのリサイズが機能する
- [ ] ヘッダー右クリックでカラム表示切替メニューが出る

---

## 6. Lessons Learned

### LL-001: innerHTML + ユーザーデータ = XSS 脆弱性
- **事象**: `selectRow()` の Overview, Headers, Timing ペインで、`innerHTML` に `row.url`, ヘッダー名/値等のユーザーデータを文字列結合で埋め込んでいた
- **根本原因**: 初期実装で `innerHTML` の手軽さを優先し、XSS リスクを見落としていた。DevTools パネルは CSP で `script-src 'self'` を設定しているため `<script>` タグ注入は防げるが、イベントハンドラ属性 (`onerror` 等) による攻撃は防げない
- **対策**: 全ユーザーデータ描画箇所を `textContent` / `createElement` / `createTextNode` に置換。安全なヘルパー関数 (`createKvGrid`, `createHeaderSection`) を導入し、新規 UI でも安全なパターンを踏襲できるようにした
- **教訓**: Edge (Chromium) 拡張機能の CSP があっても `innerHTML` + ユーザーデータは XSS リスクがある。DOM API による描画を原則とし、`innerHTML` は静的リテラルのみに制限すること

### LL-002: DevTools パネルは ES Modules 非対応
- **事象**: モジュール分割のため `<script type="module">` を panel.html に導入しようとしたが、DevTools パネルページではモジュールが動作しなかった
- **根本原因**: Edge DevTools の拡張パネルは特殊なコンテキストで実行され、ES Modules のサポートが制限されている
- **対策**: IIFE 単一ファイル構成を維持し、セクションコメントで論理的に分割する。テスト可能な純粋関数は IIFE の `return` でエクスポートし、`module.exports` で Node.js からアクセス可能にする
- **教訓**: DevTools 拡張のランタイム制約を事前に確認すること。ビルドツール (webpack/rollup) を導入すればモジュール分割は可能だが、ビルドレス設計とのトレードオフを考慮する

### LL-003: selectedIndex によるフィルタ変更時の行選択不整合
- **事象**: フィルタを変更すると、選択行がずれる（別の行がハイライトされる）
- **根本原因**: `state.selectedIndex` がフィルタ前の配列インデックスだったが、`renderBody()` はフィルタ後の配列で行を描画していたため、インデックスが不一致になった
- **対策**: `selectedIndex` を廃止し、`selectedRow` としてオブジェクト参照で選択を管理するように変更。フィルタ変更後も正しい行が選択される
- **教訓**: フィルタ可能なリストでは、インデックスではなくオブジェクト参照やユニーク ID で選択状態を管理すること
