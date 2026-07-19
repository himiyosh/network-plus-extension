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
| 🔍 統合キーワード検索 | 複数キーワードをそれぞれ独立した入力欄で設定可能。URL/Domain/Path、リクエスト/レスポンスの Body・Headers を横断検索。各キーワードごとに 6 色のハイライトカラーを選択でき、マッチ行はキーワード色と `Match K1` バッジで対応を表示。キーワードごとの ▲▼ ナビゲーション・マッチ数表示に対応。`Ctrl+F` で検索パネルを開閉。検索スコープ (URL/Body/Headers) は ⚙️ Scope ボタンで切替可能 |
| 🧰 カラム別フィルタ | 右クリック時は対象カラム専用のフィルタ画面を表示。`Time` はローカル時間ベースで時刻範囲を time picker から視覚的に選択可能、`Method` は複数選択 (例: GET/POST のみ)、`Domain` / `Path` は条件を複数追加して `contains` / `notcontains` などを組み合わせ可能、`URL` は Include/Exclude の複合条件 (any/all/exclude) を設定可能。`Filters` ボタンでは全カラムを一括編集可能。ステータスバーとボタンに有効なカラムフィルタ数を表示 |
| ↕️ カラムソート | ヘッダークリックでソート切替 (昇順 → 降順 → ソート解除)。時刻カラムは取得時のリクエスト epoch で正確に比較 |
| 🗂️ リクエスト詳細 | アコーディオン形式で Overview, Headers, Request, Response, Timing を表示。Timing は SSL と Connect を重複させずに可視化 |
|  HAR エクスポート | HAR 1.2 形式でヘッダー・タイミング・レスポンスボディ・クエリ文字列・PostData を含む完全なログを出力。レスポンス取得完了を待機し、base64 データと encoding を保持 |
| 🎨 テーマ切替 | System / Dark / Light の3モードを循環切替。小さいステータス・補助テキストも WCAG 2.2 AA のコントラストを維持し、設定は `chrome.storage.local` (Edge 互換 API) に永続化 |
| ⏯️ 録画制御 | Pause / Resume ボタン。録画中は赤、一時停止中はグレーのインジケータ表示 |
| ⬇️ 自動スクロール | 新規リクエスト到着時に自動的にテーブル末尾へスクロール。上方向へ手動スクロールすると自動的に OFF になり、ボタン状態にも反映 |
| 🔗 Initiator リンク | スクリプト起因のリクエストをクリックすると DevTools でソースファイルを表示 |
| 🪟 パネルリサイズ | テーブルと詳細パネルの境界をドラッグで調整可能。幅 700px 以下では上下配置へ切り替わり、境界ドラッグで高さを調整 |
| ⌨️ キーボードナビゲーション | 上下キーで行選択、選択行を自動スクロール。詳細タブは左右キー / Home / End で移動可能 |
| ♿ アクセシブル表示 | 色だけに依存しない検索一致バッジ、読み上げ対応の状態・件数・コピー通知、`prefers-reduced-motion` による装飾モーション抑制 |

### UI 安定表示ルール

- `Recording` / `Paused` の状態切替でレイアウトジャンプを発生させないため、ツールバー上部インジケータの高さは常に確保すること。
- 実装ルール: `.topbar` に常時 `border-top` (透明可) を持たせ、`recording` 時は色のみ変更する。
- 幅の狭い DevTools では、ツールバーだけを横スクロール可能にして、テーブルや詳細パネルの横位置を維持する。
- 幅 700px 以下ではリクエスト一覧を詳細パネルの上へ積み、メイン境界の向き・カーソル・ARIA を水平セパレーターへ切り替える。
- フィルター、カラム、コンテキスト、検索スコープ、検索色の各ポップアップは、画面端から 8px 以上離して内部スクロール可能にする。

## 📁 プロジェクト構造

```
network-plus-extension/
  .impeccable/
    design.json              ... DESIGN.md の拡張トークンとコンポーネント定義
  .github/
    agents/
      NetworkPlusAgent.agent.md ... Primary project agent (Hallmark routing included)
      ui-review.agent.md        ... Network+ 6-axis UI/UX review agent
    copilot-instructions.md  ... Copilot 動作ルール (コーディング規約、セキュリティ、テスト方針)
    skills/hallmark/         ... Hallmark 1.1.0 design skill (pinned vendored copy)
  docs/
    DESIGN.md                ... UI トークン、コンポーネント、テーマ運用ルール
    PRODUCT.md               ... 製品戦略、対象ユーザー、設計原則、アクセシビリティ基準
    unified-project-rules.md ... 共通プロジェクトルール (ローカル参照用, gitignore 対象)
  scripts/
    check-version-sync.js    ... package.json / manifest.json バージョン同期チェック
  tests/                     ... Jest ユニットテスト
    setup.js                 ... テスト用ブラウザ API モック
    panel.test.js            ... 純粋関数のユニットテスト
    ui-contract.test.js      ... テーマ、コントラスト、レスポンシブ、ARIA の静的契約テスト
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
3. **統合キーワード検索**: `Ctrl+F` または `🔍 Search` ボタンで検索パネルを開く。複数キーワードを入力し、各キーワードの ▲▼ ボタンでマッチ間を移動。色ボタンでハイライトカラーを変更可能
4. **カラム別フィルタ**: カラムヘッダー右クリック or ツールバーの `Column Filters` ボタンで詳細フィルタ設定
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

## 🤖 Copilot カスタマイズ

Primary Agent は [NetworkPlusAgent](.github/agents/NetworkPlusAgent.agent.md)、UI 品質ゲートは [UI/UX Review Agent](.github/agents/ui-review.agent.md) です。UI デザインには vendored Hallmark 1.1.0 を **`/hallmark`** で呼び出し、`audit` / `redesign` / `study` verb を利用できます。

Hallmark は実際の Edge DevTools パネルだけに適用します。Network+ の 3 テーマ、密度、キーボード、XSS、データ正確性、IIFE、テスト、および既存 6 軸レビューが Hallmark より優先します。固定元と更新手順は [UPSTREAM.md](.github/skills/hallmark/UPSTREAM.md) を参照してください。

## 🧪 テスト

| 対象 | 手法 | 場所 |
|------|------|------|
| **純粋関数** | Jest ユニットテスト | [tests/panel.test.js](tests/panel.test.js) |
| **DOM 操作** | 手動テスト (Edge DevTools で拡張機能をロードして確認) | - |
| **テーマ / UI 契約** | Jest 静的契約テスト + 手動テスト (System/Dark/Light 切替確認) | [tests/ui-contract.test.js](tests/ui-contract.test.js) |
| **エクスポート** | 手動テスト (HAR ファイルの内容検証) | - |

テスト環境のモック設定は [tests/setup.js](tests/setup.js) を参照。

## 🧾 バージョニングルール

- **方式**: Semantic Versioning (`MAJOR.MINOR.PATCH`)
- **同期対象**: [manifest.json](manifest.json) と [package.json](package.json) の `version` を必ず同一値にする
- **現在バージョン**: `1.5.0`

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
| [.github/agents/NetworkPlusAgent.agent.md](.github/agents/NetworkPlusAgent.agent.md) | Primary project agent と Hallmark ルーティング |
| [.github/agents/ui-review.agent.md](.github/agents/ui-review.agent.md) | Network+ 固有の 6 軸 UI/UX 品質ゲート |
| [.github/skills/hallmark/SKILL.md](.github/skills/hallmark/SKILL.md) | Hallmark 1.1.0 (`/hallmark`) |
| [.github/skills/hallmark/UPSTREAM.md](.github/skills/hallmark/UPSTREAM.md) | Hallmark の固定元、parity、更新手順 |
| [docs/DESIGN.md](docs/DESIGN.md) | UI トークン、コンポーネント、テーマ運用ルール |
| [docs/PRODUCT.md](docs/PRODUCT.md) | 対象ユーザー、製品目的、設計原則、WCAG 2.2 AA 基準 |
| docs/unified-project-rules.md | JPUCSupport 共通プロジェクトルール (ローカル参照用, gitignore 対象) |
| [scripts/check-version-sync.js](scripts/check-version-sync.js) | package.json / manifest.json バージョン同期チェックスクリプト |
| [manifest.json](manifest.json) | 拡張機能マニフェスト (Manifest V3) |

<details>
<summary>📋 変更履歴 (クリックで展開)</summary>

### v1.5.0

- グローバルフィルタとディープサーチを統合し、複数キーワード対応の統合検索機能に刷新
- 各キーワードに独立した入力欄・色選択・マッチ数表示・▲▼ナビゲーションを配置
- 検索対象: URL/Domain/Path/Method/Status/Type + Request/Response Body + Headers (スコープ切替可)
- 6 色 (Yellow/Red/Green/Blue/Purple/Orange) のキーワード別ハイライト (行背景 + テキスト)
- カラムヘッダーの sticky 表示が機能しない問題を修正
- フィルター設定の operator ドロップダウンが contains 以外表示されない問題を修正
- 大量通信時の描画パフォーマンスを requestAnimationFrame によるスロットリングで改善
- 全消去ボタンのアイコン (🗑️) とデザインを変更し、取得停止ボタンと明確に区別
- 記録停止/再生ボタンをトップバー左端に配置
- ブランドロゴ (📡 Network+ for DevTools) をグラデーション背景で表示
- 検索入力中のカーソル消失問題を修正 (フォーカス・カーソル位置の保存/復元)
- 新規リクエスト到着時に検索結果がリアルタイム更新されない問題を修正

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
