# 🌐 Network+ for DevTools

![Edge Extension](https://img.shields.io/badge/Edge-Extension-0078d4?logo=microsoftedge)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4caf50)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES2020-f7df1e?logo=javascript)
![Jest](https://img.shields.io/badge/Test-Jest-c21325?logo=jest)
![License](https://img.shields.io/badge/License-MIT-blue)

Microsoft Edge DevTools に「**Network+**」パネルを追加する Edge 拡張機能です。標準の Network パネルの代替・補完として、強化されたフィルタリング、エクスポート、テーマ切替などの機能を提供します。

## ✨ 機能一覧

| 機能 | 説明 |
|------|------|
| 📡 リアルタイムキャプチャ | `chrome.devtools.network.onRequestFinished` (Edge 拡張 API の `chrome.*` namespace) でリクエストを取得。自然な追加順では 1 フレーム内の新規行だけをまとめて追記し、ソート・フィルター・検索中は安全な全体描画へ切り替え |
| 🧠 キャプチャ保持上限 | 既定で最新 5,000 リクエストを保持し、超過時は最古行を一括整理。`Retention` から 100〜100,000 件へ変更でき、警告を確認した明示操作時のみリクエスト行を無制限に保持。レスポンス Body は常に 1 Body あたり 1 MiB、合計 32 MiB の独立した上限を適用 |
| 🧱 カスタムカラム (11種) | ID, Time, Method, Status, Domain, Path, Type, Duration, Size, Initiator, URL |
| 👁️ カラム表示/非表示 | ツールバーの `Columns` ボタンでカラムの表示切替。設定は `localStorage` に永続化 |
| ↔️ カラムリサイズ | ドラッグまたはフォーカスした境界の左右キー (`Shift` 併用で大きく調整) でカラム幅を変更可能。設定は永続化 |
| 🔍 統合キーワード検索 | 複数キーワードをそれぞれ独立した入力欄で設定可能。URL/Domain/Path、リクエスト/レスポンスの Body・Headers を横断検索。各キーワードごとに 6 色のハイライトカラーを選択でき、マッチ行はキーワード色と `Match K1` バッジで対応を表示。キーワードごとの ▲▼ ナビゲーション・マッチ数表示に対応。遅延取得されたレスポンス Body もフレーム単位でまとめて検索結果へ反映し、現在の移動位置を可能な限り維持。検索できない Body がある場合は件数を明示。`Ctrl+F` で検索パネルを開閉。検索スコープ (URL/Body/Headers) は ⚙️ Scope ボタンで切替可能 |
| 🧰 カラム別フィルタ | 右クリック時は対象カラム専用のフィルタ画面を表示。`Time` はローカル時間ベースで時刻範囲を time picker から視覚的に選択可能、`Method` は複数選択 (例: GET/POST のみ)、`Domain` / `Path` は条件を複数追加して `contains` / `notcontains` などを組み合わせ可能、`URL` は Include/Exclude の複合条件 (any/all/exclude) を設定可能。`Filters` ボタンでは全カラムを一括編集可能。ステータスバーとボタンに有効なカラムフィルタ数を表示 |
| ↕️ カラムソート | ヘッダーのクリックまたは `Enter` / `Space` でソート切替 (昇順 → 降順 → ソート解除)。`Alt+←` / `Alt+→` でカラムを並べ替え、順序を永続化。時刻カラムは取得時のリクエスト epoch で正確に比較 |
| 🗂️ リクエスト詳細 | アコーディオン形式で Overview, Headers, Request, Response, Timing を表示。選択中レスポンスは上限付き共有 Body キャッシュから描画し、遅延完了した別リクエストによる表示上書きを防止。Body が省略・退避・取得不能の場合は理由を明示し、取得元が残る退避 Body は選択時に安全に再取得。Timing は SSL と Connect を重複させずに可視化 |
| 📤 安全な HAR エクスポート | 通常操作では `network-plus-sanitized.har` を出力し、機密値を置換して解析不能・不透明・base64・multipart・制限超過 Body を明示的に省略。`_networkPlus` に方針、件数、Body の不完全性を記録。`network-plus-full.har` は Authorization、Cookie、query、Body の警告を確認したその 1 回だけ出力 |
| 🎨 テーマ切替 | System / Dark / Light の3モードを循環切替。小さいステータス・補助テキストは WCAG 2.2 AA、操作境界と主要セパレーターは 3:1 以上のコントラストを全テーマで維持し、設定は `chrome.storage.local` (Edge 互換 API) に永続化 |
| ⏯️ 録画制御 | Pause / Resume ボタン。録画中は赤、一時停止中はグレーのインジケータ表示 |
| ⬇️ 自動スクロール | 新規リクエスト到着時に自動的にテーブル末尾へスクロール。上方向へ手動スクロールすると自動的に OFF になり、ボタン状態にも反映 |
| 📋 安全なクリップボードコピー | Summary、URL、request/response Body、Raw request/response、cURL、fetch、PowerShell は `Copy sanitized` が既定。完全コピーは同じ警告ダイアログで操作ごとに確認し、確認前に clipboard へ書き込まない |
| 🔗 Initiator リンク | スクリプト起因のリクエストをクリックすると DevTools でソースファイルを表示 |
| 🪟 パネルリサイズ | テーブルと詳細パネルの境界をドラッグまたは矢印キーで調整可能。幅 700px 以下では上下配置へ切り替わり、上下キーで高さを調整。Request/Response 境界も上下キーに対応 |
| ⌨️ キーボードナビゲーション | フォーカス行を上下キーで選択して自動スクロール。`Context Menu` または `Shift+F10` で行アクションを開き、メニュー内は上下キー / Home / End / Escape で操作。詳細タブは左右キー / Home / End で移動可能 |
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
    workflows/quality-gates.yml ... Node.js 22/24 quality gates
    dependabot.yml           ... npm / GitHub Actions dependency updates
  docs/
    DESIGN.md                ... UI トークン、コンポーネント、テーマ運用ルール
    PRODUCT.md               ... 製品戦略、対象ユーザー、設計原則、アクセシビリティ基準
    unified-project-rules.md ... 共通プロジェクトルール (ローカル参照用, gitignore 対象)
  scripts/
    check-extension-package.js ... 配布ファイルの整合性検証と ZIP 作成
    check-version-sync.js    ... package.json / manifest.json バージョン同期チェック
    check-repository-integrity.js ... package-lock.json の provenance チェック
    check-text-integrity.js  ... 変更差分の whitespace / encoding チェック
  tests/                     ... Jest ユニットテスト
    extension-package.test.js ... 配布 ZIP / manifest / HTML の回帰テスト
    setup.js                 ... テスト用ブラウザ API モック
    panel.test.js            ... 純粋関数のユニットテスト
    ui-contract.test.js      ... テーマ、コントラスト、レスポンシブ、ARIA の静的契約テスト
    repository-integrity.test.js ... リポジトリ整合性チェックのユニットテスト
    text-integrity.test.js   ... 変更差分チェックのユニットテスト
  icons/                     ... 拡張機能アイコン (16x16, 48x48, 128x128 PNG)
  vendor/                    ... サードパーティライブラリ
  LICENSE                    ... MIT License
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

### 描画パフォーマンス

- ソートなしまたは ID 昇順で、カラムフィルターと検索キーワードが未使用の場合、ライブ取得行を `requestAnimationFrame` ごとに `DocumentFragment` で一括追記します。既存の行は再生成しません。
- フレーム確定時に条件を再確認し、ソート・フィルター・検索状態が変わった場合は全体描画へフォールバックします。別の描画が先に完了した場合も行 ID で重複を防ぎます。
- 通常選択、矢印キー選択、Ctrl/Cmd トグルは影響行だけを差し替えます。範囲選択や削除など多数行へ影響する操作は安全な全体描画を利用します。

### キャプチャ保持と Body キャッシュ

- リクエスト行は既定で最新 5,000 件を保持します。ライブキャプチャ、HAR インポート、SAZ インポートは同じ保持判定を使用し、ID は削除・Clear・Import 後も単調増加します。
- 上限超過時は最古行をまとめて削除し、フィルター結果、フォーカス、単一/複数選択、検索一致、保留中の増分描画、DOM 行、詳細ペイン、統計を同時に整理します。
- レスポンス Body キャッシュは 1 Body あたり 1 MiB、合計 32 MiB です。合計上限では最終アクセスが古い Body から退避し、行自体は保持します。
- 1 MiB を超える Body は部分データとして保存せず省略します。詳細、検索、HAR は省略・退避・取得不能を完全データとして表示しません。
- 退避 Body は DevTools の取得元が利用できる間、詳細表示時に再取得できます。HAR は Body を 1 件ずつ一時取得するため、共有キャッシュを無制限に復元しません。
- ステータスバーは現在の保持ポリシー、Body キャッシュ使用量、累積の行退避数、Body 省略数、Body 退避数、プレビュー省略数を常時表示します。
- 有界モードの HAR 読み込みは最終保持範囲だけを行オブジェクト化し、SAZ は 256 件ずつ同じ保持ポリシーへ投入するため、入力件数分の行オブジェクトを二重保持しません。
- これらはリクエスト行数とレスポンス Body 共有キャッシュの上限です。保持中の各行が参照する URL、ヘッダー、requestPostData、DevTools のリクエストオブジェクト、およびインポート解析中のファイルデータを含む拡張機能全体の絶対メモリ上限ではありません。機密データの編集・出力ポリシーは後続の data-safety 層で扱います。
- 保存済み設定が不正または読み書き不能な場合は既定値へ戻し、その理由を保持ステータスまたは操作ステータスへ表示します。

### 外向きデータの安全性

Network+ は clipboard copy と HAR download を外向きデータ面として扱い、通常操作を常に sanitized output にします。確認済み full output はその操作 1 回にだけ有効で、設定や既定値として保存しません。

- URL は username/password の両方と、名前に関係なく query および form-like fragment の全 value を `[REDACTED]` へ置換します。parameter 名、順序、重複、path、SPA fragment route は可能な範囲で維持し、解釈不能な fragment は全体を置換します。
- Header は `Accept`、`Content-Type`、`Content-Length`、encoding、connection、cache directive などの小さな構造 allowlist だけ値を保持します。`Referer` / `Referrer` / `Location` / `Content-Location` / `X-Original-URL` / `X-Rewrite-URL` は URL sanitizer を通し、Cookie、custom `X-*`、auth/security/token/credential/signature/key/trace/request-ID/client-certificate header、`Link` / `Refresh` など安全に解析しない URL header は名前を保って値を置換します。
- Cookie object の値は名前にかかわらず `[REDACTED]` へ置換します。
- JSON Body は byte・depth・node 上限内だけ構造解析し、password の contains variant、token/secret/credential/authorization suffix、`sig` / `key` / `jwt` / SAML assertion / ticket / nonce / state / session、および email / phone / address / SSN / tax ID / national ID / birth date / name 系の PII key を防御的 heuristic で再帰置換します。false positive は sanitized mode で許容し、確認済み full output だけが原値を保持します。`application/x-www-form-urlencoded` Body は全 value を置換します。
- invalid JSON/form、opaque/binary、multipart、base64、上限超過 Body は内容を推測せず `[OMITTED BY NETWORK+]` または HAR の `_networkPlus.status = "omitted"` で明示します。
- Sanitizer が処理できない場合は fail closed とし、元データへ fallback しません。clipboard/download の失敗は内容を console、status、error text に含めず通知します。
- cURL、fetch、PowerShell は置換・省略後も quote/escaping を適用し、command syntax を維持します。

この方針は外向き copy/download の誤共有を減らすもので、DevTools 内の Request/Response 表示、ローカルキャプチャ、メモリ内データを秘匿・消去する機能ではありません。ローカル inspection では取得済みの完全値が表示される場合があります。

## 🚀 セットアップ

### 1. リポジトリの取得

```bash
git clone https://github.com/himiyosh/network-plus-extension.git
cd network-plus-extension
```

### 2. 前提条件

- **Microsoft Edge** (最新安定版, Chromium ベース)
- **Node.js 22 または 24 LTS** (テスト・Lint・品質チェック実行用)

### 3. 依存関係のインストール

```bash
npm ci
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
5. **ソート/並べ替え**: カラムヘッダーのクリックまたは `Enter` / `Space` で昇順/降順/解除を切替。`Alt+←` / `Alt+→` で順序を変更
6. **リクエスト詳細**: 行クリックで Fiddler 風のタブ付きインスペクター (Request/Response) を表示
7. **HAR エクスポート**: Export ダイアログでは `Export sanitized HAR` を通常利用する。`Export full HAR` は警告対象を確認し、その 1 回だけ完全データを出力
8. **テーマ切替**: Theme ボタンで System/Dark/Light を循環切替
9. **保持設定**: `Retention` ボタンで保持件数を変更。`Keep unlimited requests` は警告表示後にのみ保存でき、Body キャッシュの 1 MiB / 32 MiB 上限は無制限モードでも維持される
10. **キーボード操作**: 上下キーで行選択、`Context Menu` / `Shift+F10` で行メニュー、各境界の矢印キーでサイズ調整。Filter / Columns / Scope / Color は開いた後に内容へフォーカスし、`Escape` で閉じてトリガーへ戻る

## 🛠️ 開発

```bash
npm ci                  # lockfile に基づく依存関係インストール
npm test                # Jest テスト実行 (カバレッジ付き)
npm run lint            # 全 first-party JavaScript の ESLint 実行
npm run version:check   # manifest/package/package-lock の version 同期チェック
npm run integrity:check # package-lock.json の provenance チェック
npm run extension:check # manifest、権限、参照、CSP、配布 allowlist の検証
npm run extension:package # dist/ に検証済みのリリース ZIP を作成
npm run text:check -- --base <base-sha> --head <head-sha> # 変更差分の whitespace / encoding チェック
npm run format:check    # CI 対象ファイルの Prettier チェック
npm run format          # CI 対象ファイルの Prettier フォーマット
```

本拡張機能はビルドレス構成です。ソースを直接 Edge に読み込むため、コンパイルやバンドルを行うビルドコマンドはありません。`extension:package` は実行コードを変換せず、明示したランタイム10ファイルだけを `dist/` の ZIP へ格納します。

`.github/workflows/quality-gates.yml` は Node.js 22 / 24 の matrix で `npm ci` を使用し、Jest、ESLint、release version sync、Prettier、lockfile provenance、変更差分の text integrity、拡張機能パッケージ整合性を検証します。

## 🤖 Copilot カスタマイズ

Primary Agent は [NetworkPlusAgent](.github/agents/NetworkPlusAgent.agent.md)、UI 品質ゲートは [UI/UX Review Agent](.github/agents/ui-review.agent.md) です。UI デザインには vendored Hallmark 1.1.0 を **`/hallmark`** で呼び出し、`audit` / `redesign` / `study` verb を利用できます。

Hallmark は実際の Edge DevTools パネルだけに適用します。Network+ の 3 テーマ、密度、キーボード、XSS、データ正確性、IIFE、テスト、および既存 6 軸レビューが Hallmark より優先します。固定元と更新手順は [UPSTREAM.md](.github/skills/hallmark/UPSTREAM.md) を参照してください。

## 🧪 テスト

| 対象 | 手法 | 場所 |
|------|------|------|
| **純粋関数** | Jest ユニットテスト | [tests/panel.test.js](tests/panel.test.js) |
| **リポジトリ整合性** | Jest ユニットテスト + CI | [tests/repository-integrity.test.js](tests/repository-integrity.test.js) |
| **拡張機能パッケージ整合性** | Jest ユニットテスト + CI | [tests/extension-package.test.js](tests/extension-package.test.js) |
| **変更差分整合性** | Jest ユニットテスト + CI | [tests/text-integrity.test.js](tests/text-integrity.test.js) |
| **DOM 操作** | 手動テスト (Edge DevTools で拡張機能をロードして確認) | - |
| **テーマ / UI 契約** | Jest 静的契約テスト + 手動テスト (System/Dark/Light 切替確認) | [tests/ui-contract.test.js](tests/ui-contract.test.js) |
| **エクスポート** | 手動テスト (HAR ファイルの内容検証) | - |

テスト環境のモック設定は [tests/setup.js](tests/setup.js) を参照。

### キーボード手動テスト

[Copilot Instructions の手動テストチェックリスト](.github/copilot-instructions.md#66-手動テストチェックリスト) と併せて、次を確認してください。

- [ ] ヘッダーの `Enter` / `Space` で `aria-sort` と表示順が同期し、`Alt+←` / `Alt+→` 後も同じヘッダーへフォーカスが戻る
- [ ] カラム、メイン分割、Request/Response 分割の各境界を矢印キーで変更でき、最小サイズを下回らない
- [ ] 行の上下選択、`Ctrl` / `Cmd+C`、複数選択、`Context Menu` / `Shift+F10` のメニュー操作とフォーカス復帰が維持される
- [ ] 通常の Summary / URL / Body / Raw / cURL / fetch / PowerShell copy が sanitized と表示され、完全 copy は警告確認後だけ clipboard へ書き込まれる
- [ ] Export ダイアログの sanitized HAR と full HAR が別 filename になり、full HAR の確認状態が次の操作へ残らない
- [ ] Filter / Columns / Scope / Color をキーボードで開閉でき、初期フォーカス、`Escape`、画面端でのクランプが機能する

### 大量通信・増分描画の手動テスト

- [ ] ソートなしまたは ID 昇順、フィルター・検索なしで大量通信を発生させ、既存行の DOM が維持されたまま新規行だけがフレーム単位で追加される
- [ ] ID 降順、他カラムのソート、カラムフィルター、検索キーワードの各状態で、新規通信が正しい表示順・可視性・検索バッジを保つ
- [ ] 新規通信のフレーム待機中にソートまたはフィルターを変更しても、重複行や古い検索状態が発生しない
- [ ] 通常クリック、上下キー、Ctrl/Cmd トグルで DOM 順序・フォーカス・詳細・選択件数/サイズが維持される
- [ ] 最下部にいる場合だけ自動スクロールし、上へ手動スクロールした後は新規通信でも位置が移動しない
- [ ] Clear、HAR/SAZ Import、Columns 変更、Keep/Delete Selected の直後も件数・転送量・行 ID が一致する

## 🧾 バージョニングルール

- **方式**: Semantic Versioning (`MAJOR.MINOR.PATCH`)
- **同期対象**: [manifest.json](manifest.json)、[package.json](package.json)、[package-lock.json](package-lock.json) の top-level / root `version` を必ず同一値にする
- **現在バージョン**: `1.6.0`

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
- [manifest.json](manifest.json)、[package.json](package.json)、[package-lock.json](package-lock.json) の `version` を同時更新
- `npm run version:check` を実行して4箇所の同期を確認
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
- Content Security Policy を [manifest.json](manifest.json) で明示設定 (`script-src 'self'; object-src 'self'`)
- 拡張機能の権限は `storage` のみ。テーマ設定の永続化に `chrome.storage.local` を使用する
- HAR はローカルの Blob / Object URL と一時的な `<a download>` で保存し、`chrome.downloads` API と `downloads` 権限は使用しない
- `npm run extension:check` は権限の完全一致と実使用を検証し、未使用権限の再追加、外部/inline script、不正なCSP、配布allowlist逸脱を拒否する

## ⚠️ 注意事項 / 制約

- **Microsoft Edge 専用** --- Chrome でも動作する可能性はあるが、テスト・サポート対象は Edge のみ
- **DevTools パネルは ES Modules 非対応** --- IIFE 単一ファイル構成を採用しているため、`import`/`export` は使用不可
- **ビルドレス設計** --- バンドラ不使用。`extension:package` は変換や依存解決を行わず、監査済みランタイムファイルだけをZIP化する
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
| [scripts/check-extension-package.js](scripts/check-extension-package.js) | 拡張機能の参照・権限・配布内容チェックとZIP作成 |
| [scripts/check-version-sync.js](scripts/check-version-sync.js) | manifest/package/package-lock バージョン同期チェックスクリプト |
| [manifest.json](manifest.json) | 拡張機能マニフェスト (Manifest V3) |
| [LICENSE](LICENSE) | MIT License |

<details>
<summary>📋 変更履歴 (クリックで展開)</summary>

### v1.6.0

- 幅700px以下の上下分割、viewport内ポップアップ、全テーマのWCAG 2.2 AAコントラストを含むresponsive/a11y hardening
- キーボードでのソート、カラム並べ替え、行/メニュー/タブ移動、境界リサイズ、フォーカス復帰を強化
- epoch時刻ソート、Timingの重複排除、遅延Body競合防止、保持時の選択・統計整合性を含むdata-integrity hardening
- 自然順のライブ取得をフレーム単位のDocumentFragment追記へ切り替え、batch renderingと検索更新を安定化
- リクエスト保持上限とレスポンスBodyの個別/合計上限、退避・省略状態、HAR/SAZ import保持ポリシーを追加
- HAR、clipboard、cURL、fetch、PowerShellをsanitized既定にし、full outputを操作ごとの警告確認に限定
- Node.js 22/24でJest、ESLint、format、version、text/lock/package integrity、auditを実行するCI gatesを整備
- 未使用の`downloads`権限を削除し、実使用される`storage`だけを自動回帰チェックで固定
- 明示allowlistの10ランタイムファイルだけを格納する再現可能なリリースZIP作成を追加

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

[MIT License](LICENSE)
