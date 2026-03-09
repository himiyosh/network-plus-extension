# 🌐 Network+ for DevTools

![Edge Extension](https://img.shields.io/badge/Edge-Extension-0078d4?logo=microsoftedge)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4caf50)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES2020-f7df1e?logo=javascript)
![Jest](https://img.shields.io/badge/Test-Jest-c21325?logo=jest)
![License](https://img.shields.io/badge/License-MIT-blue)

Microsoft Edge DevTools に「**Network+**」パネルを追加する Edge 拡張機能です。  
標準の Network パネルの代替・補完として、強化されたフィルタリング、エクスポート、テーマ切替などの機能を提供します。

## ✨ 機能一覧

| 機能 | 説明 |
|------|------|
| 📡 リアルタイムキャプチャ | `chrome.devtools.network.onRequestFinished` (Edge 拡張 API の `chrome.*` namespace) でリクエストをインクリメンタルに取得・表示 |
| 🧱 カスタムカラム (11種) | ID, Time, Method, Status, Domain, Path, Type, Duration, Size, Initiator, URL |
| 👁️ カラム表示/非表示 | ツールバーの `Columns` ボタンでカラムの表示切替。設定は `localStorage` に永続化 |
| ↔️ カラムリサイズ | ドラッグでカラム幅を調整可能。設定は永続化 |
| 🔎 グローバルフィルタ | URL, Method, Status, Type を横断検索 (debounce 付き) |
| 🧰 カラム別フィルタ | 右クリック時は対象カラム専用のフィルタ画面を表示。`Time` はローカル時間ベースで時刻範囲を time picker から視覚的に選択可能、`Method` は複数選択 (例: GET/POST のみ)、`Domain` / `Path` は条件を複数追加して `contains` / `notcontains` などを組み合わせ可能、`URL` は Include/Exclude の複合条件 (any/all/exclude) を設定可能。`Filters` ボタンでは全カラムを一括編集可能 |
| ↕️ カラムソート | ヘッダークリックでソート切替 (昇順 → 降順 → ソート解除) |
| 🗂️ リクエスト詳細 | アコーディオン形式で Overview, Headers, Request, Response, Timing を表示 |
|  HAR エクスポート | HAR 1.2 形式でヘッダー・タイミング・レスポンスボディ・クエリ文字列・PostData を含む完全なログを出力 |
| 🎨 テーマ切替 | System / Dark / Light の3モードを循環切替。`chrome.storage.local` (Edge 互換 API) に永続化 |
| ⏯️ 録画制御 | Pause / Resume ボタン。録画中は赤、一時停止中はグレーのインジケータ表示 |
| ⬇️ 自動スクロール | 新規リクエスト到着時に自動的にテーブル末尾へスクロール (トグル可能) |
| 🔗 Initiator リンク | スクリプト起因のリクエストをクリックすると DevTools でソースファイルを表示 |
| 🪟 パネルリサイズ | テーブルと詳細パネルの境界をドラッグで調整可能 |
| ⌨️ キーボードナビゲーション | 上下キーで行選択、選択行を自動スクロール |

### UI 安定表示ルール

- `Recording` / `Paused` の状態切替でレイアウトジャンプを発生させないため、ツールバー上部インジケータの高さは常に確保すること。
- 実装ルール: `.topbar` に常時 `border-top` (透明可) を持たせ、`recording` 時は色のみ変更する。

## 📁 プロジェクト構造

```
network-plus-extension/
  .github/
    copilot-instructions.md  ... Copilot 動作ルール (コーディング規約、セキュリティ、テスト方針)
  docs/
    unified-project-rules.md ... 共通プロジェクトルール (ローカル参照用, gitignore 対象)
  scripts/
    check-version-sync.js    ... package.json / manifest.json バージョン同期チェック
  tests/                     ... Jest ユニットテスト
    setup.js                 ... テスト用ブラウザ API モック
    panel.test.js            ... 純粋関数のユニットテスト
  icons/                     ... 拡張機能アイコン (16x16, 48x48, 128x128 SVG)
  vendor/                    ... サードパーティライブラリ
  manifest.json              ... 拡張機能マニフェスト (Manifest V3, CSP 明示設定)
  devtools.html              ... DevTools ページ (devtools.js をロード)
  devtools.js                ... chrome.devtools.panels.create() で Network+ パネルを生成
  panel.html                 ... パネル UI レイアウト (ツールバー、テーブル、詳細サイドバー、ステータスバー)
  panel.js                   ... コアロジック (15セクション分割): キャプチャ、フィルタ、レンダリング、エクスポート、テーマ
  panel.css                  ... CSS カスタムプロパティによるライト/ダーク/システムテーマ
  eslint.config.mjs          ... ESLint 設定 (flat config)
  .prettierrc                ... Prettier 設定
  .gitignore                 ... Git 除外設定
  es-metadata.yml            ... 1ES Inventory-As-Code メタデータ
  package.json               ... npm 設定・スクリプト・Jest 設定
  README.md                  ... このファイル
```

## 🏗️ アーキテクチャ

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

## 🚀 セットアップ

### 1. リポジトリの取得

```bash
git clone https://github.com/user/network-plus-extension.git
cd network-plus-extension
```

### 2. 前提条件

- **Microsoft Edge** (最新安定版, Chromium ベース)
- **Node.js** (テスト・Lint 実行用)

### 3. 依存関係のインストール

```bash
npm install
```

### 4. Edge へのインストール

1. Microsoft Edge で `edge://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このフォルダを選択
4. DevTools を開くと「**Network+**」タブが追加される

## 📖 使い方

1. DevTools を開き (F12)、「**Network+**」タブを選択
2. ページをリロードすると、ネットワークリクエストがリアルタイムで一覧表示される
3. **グローバルフィルタ**: テキスト入力で URL, Method, Status, Type を横断検索
4. **カラム別フィルタ**: カラムヘッダー右クリック or ツールバーの `Filters` ボタンで詳細フィルタ設定
5. **ソート**: カラムヘッダークリックで昇順/降順/解除を切替
6. **リクエスト詳細**: 行クリックで Fiddler 風のタブ付きインスペクター (Request/Response) を表示
7. **HAR エクスポート**: ツールバーの Export ボタンで HAR 1.2 形式ファイルをダウンロード
8. **テーマ切替**: Theme ボタンで System/Dark/Light を循環切替
9. **キーボード操作**: 上下キーで行選択

## 🛠️ 開発

```bash
npm install          # 依存関係インストール
npm test             # Jest テスト実行 (カバレッジ付き)
npm run lint         # ESLint 実行
npm run version:check # package.json と manifest.json の version 同期チェック
npm run format       # Prettier フォーマット
```

## 🧪 テスト

| 対象 | 手法 | 場所 |
|------|------|------|
| **純粋関数** | Jest ユニットテスト | [tests/panel.test.js](tests/panel.test.js) |
| **DOM 操作** | 手動テスト (Edge DevTools で拡張機能をロードして確認) | - |
| **テーマ** | 手動テスト (System/Dark/Light 切替確認) | - |
| **エクスポート** | 手動テスト (HAR ファイルの内容検証) | - |

テスト環境のモック設定は [tests/setup.js](tests/setup.js) を参照。

## 🧾 バージョニングルール

- **方式**: Semantic Versioning (`MAJOR.MINOR.PATCH`)
- **同期対象**: [manifest.json](manifest.json) と [package.json](package.json) の `version` を必ず同一値にする
- **現在バージョン**: `1.4.0`

| 変更種別 | 上げる番号 | 例 |
|---|---|---|
| 破壊的変更 (後方互換なし) | `MAJOR` | フィルタ設定フォーマット変更、既存 UI 動作の互換性破壊 |
| 機能追加 (後方互換あり) | `MINOR` | 新しいソート機能、演算子追加 |
| バグ修正 / ドキュメント修正 | `PATCH` | フィルタ判定バグ修正、README 修正 |

運用ポリシー (重要):
- `version` は**コミットごとに更新しない**。更新は**リリース時のみ**行う。
- 開発中の複数コミットは同一バージョンのまま進め、リリース確定時に 1 回だけ更新する。
- 基本方針は `PATCH` 優先。`MINOR` はユーザー影響のある機能追加をまとめてリリースする時だけ使用する。
- 1 機能を複数回コミットした場合でも、最終リリースでは 1 回のバージョン更新に集約する。

バージョン更新時チェックリスト:
- [manifest.json](manifest.json) と [package.json](package.json) の `version` を同時更新
- `npm run version:check` を実行して同期を確認
- 機能追加・仕様変更時は README の該当セクションも同一コミットで更新

## 🧰 技術スタック

- **Manifest V3** --- Microsoft Edge 拡張機能 (Chromium ベース, CSP 明示設定)
- **Vanilla JS (ES2020)** --- フレームワーク・ビルドツール不要、`const`/`let`・アロー関数使用
- **CSS Custom Properties** --- テーマ切替
- **Edge 拡張 API (`chrome.devtools`)** --- ネットワークリクエストキャプチャ、パネル生成、ソースファイルオープン
- **ESLint + Prettier** --- コード品質・フォーマット統一
- **Jest** --- ユニットテスト

## 🔒 セキュリティ

- ユーザーデータ (URL、ヘッダー名/値等) の DOM 描画はすべて `textContent` または DOM API を使用 (`innerHTML` 未使用)
- Content Security Policy を [manifest.json](manifest.json) で明示設定 (`script-src 'self'`)
- 拡張機能の権限は必要最小限に限定: `storage` (テーマ設定永続化), `downloads` (HAR エクスポート)

## ⚠️ 注意事項 / 制約

- **Microsoft Edge 専用** --- Chrome でも動作する可能性はあるが、テスト・サポート対象は Edge のみ
- **DevTools パネルは ES Modules 非対応** --- IIFE 単一ファイル構成を採用しているため、`import`/`export` は使用不可
- **ビルドレス設計** --- バンドラ不使用。ファイルをそのまま Edge にロードする
- **ローカル専用** --- ネットワーク通信や外部 API とのデータ送受信は行わない

## 📚 関連ドキュメント

| ファイル | 説明 |
|---|---|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Copilot 動作ルール (コーディング規約、セキュリティ、テスト方針) |
| docs/unified-project-rules.md | JPUCSupport 共通プロジェクトルール (ローカル参照用, gitignore 対象) |
| [scripts/check-version-sync.js](scripts/check-version-sync.js) | package.json / manifest.json バージョン同期チェックスクリプト |
| [manifest.json](manifest.json) | 拡張機能マニフェスト (Manifest V3) |

<details>
<summary>📋 変更履歴 (クリックで展開)</summary>

### v1.4.0

- カラム別フィルタ強化 (Time: time picker, Method: 複数選択, Domain/Path: 複数条件, URL: 複合条件)
- Fiddler 風タブ付き詳細インスペクター (Request/Response 各サブタブ)
- カラムリサイズ機能
- Auto-scroll トグル
- Initiator リンク (DevTools ソースファイルオープン)

### v1.3.0

- HAR エクスポート (HAR 1.2 完全対応)
- キーボードナビゲーション (上下キー)

### v1.2.0

- グローバルフィルタ (debounce 付き)
- カラムソート (昇順/降順/解除)

### v1.1.0

- テーマ切替 (System/Dark/Light)
- 録画制御 (Pause/Resume)

### v1.0.0

- 初回リリース: リアルタイムキャプチャ、カスタムカラム、カラム表示切替

</details>

## 📜 ライセンス

MIT
