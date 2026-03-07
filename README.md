# 🌐 Network+ for DevTools

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
| 📄 CSV エクスポート | フィルタ適用後の表示行を UTF-8 BOM 付き CSV で出力 |
| 📦 HAR エクスポート | HAR 1.2 形式でヘッダー・タイミング・レスポンスボディ・クエリ文字列・PostData を含む完全なログを出力 |
| 🎨 テーマ切替 | System / Dark / Light の3モードを循環切替。`chrome.storage.local` (Edge 互換 API) に永続化 |
| ⏯️ 録画制御 | Pause / Resume ボタン。録画中は赤、一時停止中はグレーのインジケータ表示 |
| ⬇️ 自動スクロール | 新規リクエスト到着時に自動的にテーブル末尾へスクロール (トグル可能) |
| 🔗 Initiator リンク | スクリプト起因のリクエストをクリックすると DevTools でソースファイルを表示 |
| 🪟 パネルリサイズ | テーブルと詳細パネルの境界をドラッグで調整可能 |
| ⌨️ キーボードナビゲーション | 上下キーで行選択、選択行を自動スクロール |

## 📁 プロジェクト構造

```
network-plus-extension/
  .github/
    copilot-instructions.md  ... Copilot 動作ルール (コーディング規約、セキュリティ、テスト方針)
  tests/                     ... Jest ユニットテスト
    setup.js                 ... テスト用ブラウザ API モック
    panel.test.js            ... 純粋関数のユニットテスト
  icons/                     ... 拡張機能アイコン (16x16, 48x48, 128x128 SVG)
  manifest.json              ... 拡張機能マニフェスト (Manifest V3, CSP 明示設定)
  devtools.html              ... DevTools ページ (devtools.js をロード)
  devtools.js                ... chrome.devtools.panels.create() で Network+ パネルを生成
  panel.html                 ... パネル UI レイアウト (ツールバー、テーブル、詳細サイドバー、ステータスバー)
  panel.js                   ... コアロジック (15セクション分割): キャプチャ、フィルタ、レンダリング、エクスポート、テーマ
  panel.css                  ... CSS カスタムプロパティによるライト/ダーク/システムテーマ
  eslint.config.mjs          ... ESLint 設定 (flat config)
  .prettierrc                ... Prettier 設定
  .gitignore                 ... Git 除外設定
  package.json               ... npm 設定・スクリプト・Jest 設定
  README.md                  ... このファイル
```

## 🚀 インストール方法

1. このリポジトリをクローンまたはダウンロード
2. Microsoft Edge で `edge://extensions/` を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このフォルダを選択
5. DevTools を開くと「**Network+**」タブが追加される

## 🛠️ 開発

```bash
npm install          # 依存関係インストール
npm test             # Jest テスト実行 (カバレッジ付き)
npm run lint         # ESLint 実行
npm run version:check # package.json と manifest.json の version 同期チェック
npm run format       # Prettier フォーマット
```

## 🧾 バージョニングルール

- **方式**: Semantic Versioning (`MAJOR.MINOR.PATCH`)
- **同期対象**: `manifest.json` と `package.json` の `version` を必ず同一値にする
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
- `manifest.json` と `package.json` の `version` を同時更新
- `npm run version:check` を実行して同期を確認
- 機能追加・仕様変更時は README の該当セクションも同一コミットで更新

## 🧰 技術スタック

- **Manifest V3** — Microsoft Edge 拡張機能 (Chromium ベース, CSP 明示設定)
- **Vanilla JS (ES2020)** — フレームワーク・ビルドツール不要、`const`/`let`・アロー関数使用
- **CSS Custom Properties** — テーマ切替
- **Edge 拡張 API (`chrome.devtools`)** — ネットワークリクエストキャプチャ、パネル生成、ソースファイルオープン
- **ESLint + Prettier** — コード品質・フォーマット統一
- **Jest** — ユニットテスト

## 🔒 セキュリティ

- ユーザーデータ (URL、ヘッダー名/値等) の DOM 描画はすべて `textContent` または DOM API を使用 (`innerHTML` 未使用)
- Content Security Policy を `manifest.json` で明示設定 (`script-src 'self'`)

## 📜 ライセンス

MIT
