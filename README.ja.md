<div align="center">

<img src="docs/store-assets/logo-300.png" alt="" width="88" height="88">

# Network+ for DevTools

**Microsoft Edge / Google Chrome の DevTools に載せる、パワーユーザー向けネットワークパネル。**
複数キーワード検索、列ごとのフィルタ、2 リクエストの diff、そして既定でサニタイズされる HAR エクスポート。

[![Quality gates](https://github.com/himiyosh/network-plus-extension/actions/workflows/quality-gates.yml/badge.svg)](https://github.com/himiyosh/network-plus-extension/actions/workflows/quality-gates.yml)
[![Latest release](https://img.shields.io/github/v/release/himiyosh/network-plus-extension?label=release)](https://github.com/himiyosh/network-plus-extension/releases/latest)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4caf50)](manifest.json)
[![Node 22 | 24](https://img.shields.io/badge/Node-22%20%7C%2024-339933?logo=nodedotjs&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/himiyosh)

[English](README.md) · **日本語**

[クイックスタート](#-クイックスタート) · [機能](#-機能) · [使い方](#-使い方) · [データ安全性](#-データ安全性) · [開発](#-開発) · [ドキュメント](#-ドキュメント) · [スポンサー](#-スポンサー)

<img src="docs/media/network-plus-tour.gif" alt="Network+ パネルのツアー: リクエストグリッドとタブ式のリクエスト/レスポンスインスペクタ、フェーズガイド付きの Timing 内訳、ローカルサンプルの証拠ガイド、サニタイズ済み HAR を既定とするエクスポートダイアログ。" width="880">

<sub>フレームは内蔵のローカルサンプルキャプチャから撮影。表示されるトラフィックはすべて合成の <code>.test</code> データで、実リクエストは一切送信されません。</sub>

</div>

**今すぐ試す:** [最新リリースの ZIP をダウンロード](https://github.com/himiyosh/network-plus-extension/releases/latest) · [問題を報告](https://github.com/himiyosh/network-plus-extension/issues/new/choose) · [スポンサーになる](https://github.com/sponsors/himiyosh)

---

## ✨ なぜ Network+ か

標準の Network パネルはトラフィックを「見せる」ことに長けています。Network+ が作られたのはその**後**の瞬間のためです — 4,000 件のリクエストを前に、顧客を待たせながら、失敗している 1 つの呼び出しを見つけて説明しなければならない時のために。

- **証拠を見つける。** URL・ヘッダ・ボディを横断して複数キーワードを同時検索。キーワードごとに専用のハイライト色・件数・前後ナビゲーションが付きます。
- **文脈を失わず絞り込む。** 列ごとのフィルタ(時刻範囲、メソッド複数選択、`contains` / `notcontains` ルール、URL の include/exclude ロジック)を組み合わせ、定番の設定はビュープリセットとしてワンクリックで呼び出せます。
- **2 つのリクエストを直接比較。** ちょうど 2 行を選択して、URL・クエリ・メソッド・ステータス・ヘッダ・ボディを並べて diff。
- **ブラウザタブへポップアウト。** ワンクリックで同じパネルを通常のタブとして開き、DevTools セッションをライブでミラー。DevTools はドックしたまま大画面で調査でき、追加権限も不要です。
- **漏らさず共有。** すべてのコピーと HAR エクスポートは既定でサニタイズ。完全版の出力は毎回の確認が必要で、選択が記憶されることはありません。
- **上限のある動作。** リクエスト保持数とレスポンスボディキャッシュには明示的な上限・可視カウンタ・予測可能な破棄があり、静かに無限成長することはありません。
- **キーボードで完結。** すべての操作がマウスなしで可能。System / Dark / Light の 3 テーマはいずれも WCAG 2.2 AA のコントラストを満たします。
- **ビルドなし・テレメトリなし・外部通信なし。** 素のファイルをそのまま Edge / Chrome に読み込みます。権限は `storage` の 1 つだけで、どこにも何も送信しません。

<details>
<summary><b>スクリーンショットをもっと見る</b></summary>

| | |
|---|---|
| <img src="docs/store-assets/screenshot-1-request-detail-1280x800.png" alt="失敗している 503 POST を選択し、レスポンスヘッダをインスペクタに表示したリクエストグリッド。"> | <img src="docs/store-assets/screenshot-2-timing-guidance-1280x800.png" alt="合計 2.45 秒のうち 2.20 秒が待機時間で占められていることを示すレスポンス Timing タブと、展開されたフェーズガイド。"> |
| **リクエストインスペクタ** — ヘッダ・ボディ・クエリ・Cookie・タイミング・生テキストをタブ式の Request / Response ビューで。 | **Timing 内訳** — フェーズごとの数値とバー、各フェーズが何を証明し何を証明しないかを説明するインラインガイド。 |
| <img src="docs/store-assets/screenshot-3-sample-guide-1280x800.png" alt="答えを見る前に 4 つの調査質問を投げかけるサンプル証拠ガイドのダイアログ。"> | <img src="docs/store-assets/screenshot-4-sanitized-export-1280x800.png" alt="Export sanitized HAR を第一のアクションとし、完全版 HAR には別の確認ステップを置いたエクスポートダイアログ。"> |
| **ローカルサンプルキャプチャ** — 3 リクエストの合成キャプチャと問いかけ先行のガイドで、実トラフィックに向ける前にパネルの読み方を学べます。 | **サニタイズ済みエクスポート** — 安全な出力が既定のアクション。完全版は毎回読むことになる警告の先にあります。 |

</details>

## 🚀 クイックスタート

### リリース ZIP からインストール

1. [最新リリース](https://github.com/himiyosh/network-plus-extension/releases/latest)から ZIP をダウンロードします — 変更内容は同じページのリリースノートに書かれています。
2. 新しいフォルダに展開します。ブラウザが読み込むのは `manifest.json` を含むフォルダで、ZIP そのものではありません。
3. Microsoft Edge で `edge://extensions/`(Google Chrome では `chrome://extensions/`)を開き、**開発者モード**をオンにします。
4. **展開して読み込み(Load unpacked)** を選び、手順 2 のフォルダを指定します。
5. DevTools(<kbd>F12</kbd>)を開くと **Network+** タブが増えています。

> [!NOTE]
> Network+ は Microsoft Edge Add-ons / Chrome Web Store にはまだ公開されていません。上の手順は開発者モードでの unpacked 読み込みです。レビュー済みのデータ取り扱い・申請内容は[プライバシーノーティス](docs/privacy.md)、[Edge Add-ons 申請書類](docs/edge-addons-submission.md)、[Chrome Web Store 申請書類](docs/chrome-web-store-submission.md)を参照してください。

### ソースからインストール

必要環境: 最新安定版の Microsoft Edge または Google Chrome。テスト・lint ツール用に Node.js 22 または 24 LTS。

```bash
git clone https://github.com/himiyosh/network-plus-extension.git
cd network-plus-extension
npm ci
```

その後 `edge://extensions/` または `chrome://extensions/` を開き、**開発者モード**をオンにして **展開して読み込み** からクローンしたリポジトリのルートを選択します。ビルド手順はありません — ブラウザはソースファイルをそのまま読み込みます。

### ブラウザサポート

| ブラウザ | 状態 | 備考 |
|---|---|---|
| Microsoft Edge | プライマリ | 開発・リリース検証の基準環境。Edge Add-ons 申請書類を整備済み |
| Google Chrome | サポート | 下記のとおり検証済み。Chrome Web Store 申請書類と必須プロモタイルを整備済み |
| Firefox / Safari | 非サポート | DevTools 拡張 API と Manifest V3 の実装が異なるため |

ソースにブラウザ分岐はありません。使用している拡張 API は `chrome.devtools.network`、`chrome.devtools.panels`、`chrome.storage.local`、`chrome.runtime` のみ — すべて Chromium 標準です。

Chrome での検証内容:

- Chrome 151 が `manifest.json` を拡張エラーなしで読み込むこと。
- 実ブラウザ回帰テスト 98 件すべてが Chrome 151 で通ること(`CHROME_BIN=<path> npx jest tests/status-summary-browser.test.js tests/browser-availability-policy.test.js`)。
- 実際の Chrome DevTools ウィンドウに `Network+` タブが現れることは手動で確認。この最後の 1 点だけは自動化の外にあります: DevTools 拡張パネルは自動化環境では安定して読み込まれず、組み込みパネルの列挙すら成功しないため、CI では断言できません。

### 初回起動

パネルを開いてまだ何もキャプチャしていない状態で **Explore sample capture** を選ぶと、3 件の合成リクエスト(200 の API 呼び出し、遅い 503、304 のキャッシュヒット)が読み込まれます。ネットワーク送信は行わず、ライブ記録を一時停止するのでサンプルが実リクエストと混ざることはありません。**Exit · restore prior recording state** ですべてが元どおりに戻ります。

## 🧰 機能

### キャプチャと保持

- `chrome.devtools.network.onRequestFinished` によるライブキャプチャ。アニメーションフレームごとに追記され、既存行が再描画されることはありません。
- 保持数の既定は新しい方から 20,000 件で、100〜100,000 件に設定可能。無制限は明示的な警告を確認した場合のみ。
- レスポンスボディは 1 件あたり 1 MiB・共有キャッシュ全体で 32 MiB に別建てで制限され、行そのものは残す LRU 破棄が働きます。
- 記録の一時停止 / 再開、上にスクロールすると自動で切れるオートスクロール、10 秒間の **Undo clear** 付き `Clear`。
- HAR(`.har`)と Fiddler SAZ(`.saz`)のインポート。インポートはアトミックで、ファイルが拒否されても現在のキャプチャは壊れません。`_webSocketMessages` を含む Chrome の HAR は、そのフレームがライブ WebSocket キャプチャと同じ Request / Response の Body ペインに展開されます。
- **オプトインのストリームキャプチャ(WebSocket + SSE)。** ステータスバーの **Stream capture** トグルが、DevTools の eval API 経由でページの `WebSocket` と `EventSource` のコンストラクタをラップし(追加権限なし)、接続を行として記録します。WebSocket の送信フレームは Request の Body ペイン、受信フレームと Server-Sent Events(名前付きイベントも、ページがリスナーを登録した時点から)とライフサイクルは Response の Body ペインに入り、他のボディと同様に検索・サニタイズ付きエクスポートの対象です。見えるのはキャプチャ ON 中に作られた接続だけで、ラッパーが通信を改変することはなく、ページ遷移後は自動で再インストールされます。
- **ナビゲーションでキャプチャは消えません。** 行はページ遷移をまたいで保持され、上限付きキャッシュへ先読み済みのボディはそのまま読めます。取得が間に合わなかったボディは、後でエラーになる代わりに明示的な注記付きでマークされ、ステータスバーが両方の件数を報告します。

### 調べる

- 13 列 — ID・ClientStart・ServerDone・Method・Status・Domain・Path・Type・Duration・Size に加え、既定で非表示の Initiator・URL・Waterfall。表示・幅・並び順はすべて永続化されます。
- タブ式インスペクタ: Request(Headers / Body / Query / Cookies / Raw)と Response(Headers / Body / Preview / Cookies / Timing / Raw)。Body と Raw の各ビューにはペイン下部に固定された専用キーワード検索があり、ヒットのハイライトと Enter / Shift+Enter ナビゲーションが使えます。レスポンスボディは `Content-Type` が宣言する文字コードでデコードされます(Shift_JIS・EUC-JP なども正しく表示)。
- フェーズごとの Timing 内訳(blocked・DNS・connect・TLS・send・wait・receive)。インラインガイドと、ブラウザ報告のタイミングが証明できないことの明示付き。
- **Compare 2 selected requests** — <kbd>Ctrl</kbd>/<kbd>⌘</kbd> クリックでちょうど 2 行を選ぶと、URL・クエリパラメータ・メソッド・ステータス・プロトコル・ヘッダ・ボディを diff。一致・変更・片側のみの値が色分けされます。
- **API トラフィック向けの Operation 列** — Columns メニューに既定 OFF で用意: GraphQL の `operationName`(なければ query / mutation / subscription 名を解析、バッチ対応)と JSON-RPC の `method` を POST ボディから抽出し、「POST /graphql」の行を「何をしているか」で読めるようにします。他の列と同じくソート・フィルタでき、Request の Headers ペインにも表示されます。
- **JWT をインラインでデコード** — JWT の形をしたヘッダ値(Authorization: Bearer など、リクエスト側・レスポンス側とも)は、Headers ペインに展開セクションが付き、デコード済みヘッダとクレーム、読みやすい `exp` / `nbf` / `iat` 時刻、「expired N min ago」の期限切れ表示を確認できます。表示のみの機能です: 署名は検証せず、サニタイズ付きコピーではトークン本体は従来どおり秘匿されます。
- **編集して再送(Edit and resend)** — 行メニューから、キャプチャ済みリクエストをそのまま再送するか、メソッド・URL・ヘッダ・ボディをダイアログで編集してから送れます。組み立てたリクエストは検査対象ページ自身が発行するため、Cookie・CORS・ページのセキュリティポリシーは通常どおり適用され(ブラウザ管理ヘッダはブラウザ管理のまま)、応答は新しい行としてキャプチャされます。DevTools セッション限定で、ポップアウトのミラータブは読み取り専用のままです。
- Initiator のリンクは発生元のソースファイルを DevTools で開きます。
- **ブラウザタブへポップアウト** — ツールバーの 🪟 ボタンで、このパネルを DevTools セッションをミラーする通常のタブとして開けます。新しいリクエストは即座に流れ込み、クリアやインポートも 1 秒以内に追従し、レスポンスボディは必要時に DevTools 側から取得されます。キャプチャの所有権は DevTools 側のまま(タブでは一時停止・クリア・インポート・保持設定を非表示)、DevTools を閉じてもタブの行は残り、Initiator はタブではプレーンテキスト表示になります。
- Waterfall 列は各リクエストの開始オフセットとタイミングフェーズをインラインで可視化します。

### 探す

- 統合された複数キーワード検索(<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd>): キーワードごとの入力欄、6 色のハイライト、キーワード別の件数と ▲▼ ナビゲーション、URL / Body / Headers のスコープ切替、一致オプション(大文字小文字 / 単語一致 / 正規表現)、非一致行を隠す **Matches only** トグル(HAR エクスポートは表示中のセットに従います)。スコープ・一致オプション・トグルはセッションをまたいで保存されますが、キーワード文字列は保存されません。
- 列ごとのフィルタ: ClientStart / ServerDone のローカル時刻レンジピッカー、メソッド複数選択、ドメイン・パスへの繰り返し可能な `contains` / `notcontains` ルール、URL の any / all / exclude ロジック。
- ビュープリセット — Columns メニューが保存ビュー(列の表示 + フィルタルール)を 1 つ保持します。Apply で復元(何も保存していなければ工場出荷状態)、Update で現在のビューを上書き保存。プリセットが保存するのは列とフィルタの構成だけで、キャプチャしたトラフィックは決して含まれません。
- ステータスバー統計: 2xx / 3xx / 4xx / 5xx / その他の件数と、フィルタに追随して再計算される平均・最小・最大レスポンスタイム。

### 安全に共有する

- **Markdown としてコピー。** 行メニューから、issue にそのまま貼れるサニタイズ済み Markdown ブロック(メソッド・リダクション済み URL・ステータス・Operation・時間)をコピーできます。複数行選択時はコンパクトな Markdown 表も選べます。無加工版は他と同じ完全出力確認の先にあります。
- **サニタイズ済み HAR**(`network-plus-sanitized.har`)が通常のエクスポートです。**完全版 HAR** は別のアクションで、毎回確認する警告の先にあります。
- **選択した行だけをエクスポート。** 行を選択している場合(<kbd>Ctrl</kbd>/<kbd>⌘</kbd> クリック、<kbd>Shift</kbd> クリック)、エクスポートダイアログに件数付きの「Selected requests only」スコープが現れます。ファイル名には `-selected` が付くので取り違えません。既定は毎回「All displayed requests」にリセットされます。
- コピー操作 — Summary、URL、リクエスト/レスポンスボディ、生リクエスト/レスポンス、cURL、fetch、PowerShell — は既定でサニタイズされ、リダクション後もコマンドとして有効な構文を保ちます。
- Keyboard Shortcuts ダイアログの `Copy safe support summary` は、許可リストに基づく環境スナップショット(バージョン、Edge メジャー、粗い OS ファミリ、テーマ、保持設定、記録状態、表示設定)のみをコピーし、キャプチャしたトラフィックは含めません。公開の場に貼る前に内容を確認してください。

### 仕上げ

- System / Dark / Light テーマ(`chrome.storage.local` で永続化)。いずれも小さい文字で WCAG 2.2 AA、コントロール境界で 3:1 を満たします。
- 完全なキーボード操作。<kbd>?</kbd> でショートカット一覧。
- 320 px からのレスポンシブ対応。700 px 未満ではリクエスト一覧が詳細パネルの上に積み重なります。
- 一致バッジは色だけに頼らず、状態変化はスクリーンリーダーに通知され、装飾的なモーションは `prefers-reduced-motion` を尊重します。

## 📖 使い方

1. DevTools(<kbd>F12</kbd>)を開き、**Network+** タブを選びます。
2. 問題を再現します。行はライブで流れ込みます。**Pause** で作業セットを固定できます。
3. <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> を押してキーワードを追加します。キーワードごとに色と ▲▼ ナビゲーションが付きます。
4. 列ヘッダを右クリックするとその列に絞ったフィルタが、**Filters** からは全フィルタの一括編集ができます。うまくいった構成は **Columns** メニューのプリセット欄にある **Update** で保存します。
5. 行をクリックして調べます。<kbd>Ctrl</kbd>/<kbd>⌘</kbd> クリックで 2 行目を選び、コンテキストメニューから **Compare 2 selected requests** を選択します。
6. **Export sanitized HAR** でエクスポートするか、単一リクエストを cURL / fetch / PowerShell としてコピーします。

### Network+ をブラウザタブとして開く

パネルは、DevTools セッションをミラーする通常のブラウザタブとしても動かせます。ドッキングされたパネルでは手狭なときに便利です。

1. 調べたいページで DevTools を開き、**Network+** タブに切り替えます。
2. ツールバー右側、テーマ切替と `⌨️ ?` の間にある **🪟 ボタン**をクリックします(ツールチップ: "Open Network+ in a browser tab")。
3. 新しいタブが開き、即座にミラーが始まります。既存の行がまず表示され、新しいリクエストはライブで流れ込み、レスポンスボディは必要時に DevTools 側から取得されます。

キャプチャの主体は DevTools 側なので、作業中は DevTools を開いたままにしてください。DevTools を閉じてもタブの行は残り、"The DevTools session disconnected" と表示されます。🪟 ボタンは DevTools 内でのみ表示されます。ブラウザが新しいタブをブロックした場合は、DevTools ページのポップアップを許可してからもう一度クリックしてください。

### キーボードショートカット

| ショートカット | 動作 |
|---|---|
| <kbd>↑</kbd> / <kbd>↓</kbd> | 行の移動 |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | 行の選択 / 詳細を開く |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> | 検索パネルの開閉 |
| <kbd>Ctrl</kbd>+<kbd>L</kbd>(Windows/Linux)· <kbd>⌘</kbd>+<kbd>K</kbd>(macOS) | 全リクエストのクリア |
| <kbd>?</kbd> | ショートカット一覧の表示 |
| <kbd>Esc</kbd> | 現在のパネル・ポップアップ・検索を閉じる |
| <kbd>ContextMenu</kbd> / <kbd>Shift</kbd>+<kbd>F10</kbd> | 行のコンテキストメニュー |
| 列ヘッダで <kbd>Enter</kbd> / <kbd>Space</kbd> | 昇順 → 降順 → 解除のソート |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> | フォーカス中の列を左 / 右へ移動 |
| リサイザ・仕切り上で <kbd>←</kbd> / <kbd>→</kbd> | 小刻みにリサイズ(<kbd>Shift</kbd> で大きく) |

<kbd>?</kbd> のアプリ内ダイアログには、700 px 未満で使う縦仕切りのキーも含めた全バインディングが載っています。

### Timing タブの読み方

レスポンスの **Timing** タブには、数値と凡例の隣に `What do the timing phases mean?` というネイティブの開閉 UI があります。<kbd>Enter</kbd> または <kbd>Space</kbd> で開くので、意味の理解が色やホバーに依存することはありません。

| フェーズ | 報告される時間 |
|---|---|
| **Blocked** | リクエスト開始前にブラウザ内部で待った時間。利用可能な接続待ちなど。 |
| **DNS** | 接続前のホスト名解決。 |
| **Connect** | 接続の確立。TLS が別に報告される場合はここから除外され、フェーズが二重に数えられることはありません。 |
| **TLS (SSL)** | TLS/SSL ネゴシエーション。 |
| **Send** | HTTP リクエストの送信。 |
| **Wait (TTFB)** | 送信完了からレスポンス開始までの待ち — いわゆる TTFB。 |
| **Receive** | 最初のバイト以降のレスポンス受信。 |

**観測の限界:** これらは 1 つのリクエストについてブラウザが報告した時間です。報告された遅延の所在を絞る助けにはなりますが、パケットロス、ケーブルや無線の障害、サーバ側の確定的な根本原因を証明するものではありません。

定義は [HAR 1.2 仕様(timings)](http://www.softwareishard.com/blog/har-12-spec/)、[W3C Resource Timing Level 2](https://www.w3.org/TR/resource-timing-2/)、[Chrome DevTools Network 概要](https://developer.chrome.com/docs/devtools/network/overview/)に従います。

## 🔒 データ安全性

Network+ はクリップボードと HAR ダウンロードだけを外向きの出口として扱い、安全な形式を既定にしています。完全版出力の確認はその 1 回のアクションにのみ適用され、設定として保存されることはありません。

- **URL** — 資格情報と、すべてのクエリ値・フォーム様フラグメント値は、パラメータ名にかかわらず `[REDACTED]` に置換されます。名前・順序・パス・SPA のフラグメントルートは、解析できる限り保持されます。
- **ヘッダ** — 値を保持するのは小さな構造的許可リスト(`Accept`、`Content-Type`、`Content-Length`、エンコーディング、接続、キャッシュ指示)のみ。URL を含むヘッダは URL サニタイザを通し、Cookie・`X-*`・auth / token / key / trace の形をしたものは名前だけ残して値を失います。
- **ボディ** — JSON はバイト数・深さ・ノード数の上限内で解析され、資格情報や PII の形をしたキーは防御的ヒューリスティクスでリダクションされます。フォームボディはすべての値が置換されます。不透明・バイナリ・multipart・base64・上限超過のものは推測せず `[OMITTED BY NETWORK+]` と印を付けます。
- **フェイルクローズ** — サニタイザが処理できないものがあれば、生データへフォールバックせず操作自体が失敗します。クリップボードやダウンロードのエラーが、コンソール・ステータステキスト・エラーメッセージに内容を漏らすことはありません。
- **HAR の来歴** — サニタイズ済みアーカイブは、ポリシー・件数・ボディの不完全性を `_networkPlus` 以下に記録します。

これは外に送るものの偶発的な漏えいを減らす仕組みです。DevTools 内で見えるものへのリダクションレイヤーではありません: ローカルの調査ではキャプチャした値がそのまま表示されます。詳細は[プライバシーノーティス](docs/privacy.md)へ。

## 🔧 仕組み

```
Edge / Chrome DevTools
└── devtools.html          chrome.devtools.panels.create() でパネルを登録
    └── panel.html         パネル UI
        ├── panel.js       全ロジック(単一 IIFE・15 セクション)
        └── panel.css      CSS カスタムプロパティによる System / Dark / Light テーマ
```

- **DevTools パネル拡張。** リクエストは `chrome.devtools.network.onRequestFinished` 経由で届きます。
- **ポップアウト ミラータブ。** 同じ `panel.html` を `?view=window` で開いたものです。DevTools パネルが `chrome.runtime` ポートを張って直列化した行をストリームし、1 秒ごとの sync ハートビートで差分を照合、レスポンスボディはオンデマンドで供給します。追加権限はありません。
- **ナビゲーションの扱い。** `chrome.devtools.network.onNavigated` はテーブルをクリアしません。ブラウザはナビゲーション確定時点で前ドキュメントのボディ提供をやめるため、未取得のボディを unavailable として印付けするだけです。
- **ES モジュール不使用。** DevTools のパネルページは `<script type="module">` をサポートしないため、全ロジックが 1 つの IIFE ファイルにあります。これはプラットフォーム制約であって、スタイルの選択ではありません。
- **ビルドレス。** バンドラもトランスパイラもありません。`npm run extension:package` は 10 個のランタイムファイルの明示的な許可リストを、コードを一切変換せずに ZIP へコピーします。

| 上限 | 値 |
|---|---|
| リクエスト行 | 既定 20,000 · 100〜100,000 で設定可能 · 無制限は明示的な確認後のみ |
| レスポンスボディ | 1 件あたり 1 MiB · 共有キャッシュ全体で 32 MiB |
| インポートファイル | 1 ファイル 32 MiB |
| SAZ アーカイブ | 20,000 エントリ · 展開後 1 エントリ 4 MiB · 展開後合計 64 MiB |

ステータスバーは、有効な保持ポリシー、ボディキャッシュ使用量、行破棄・ボディ省略・ボディ破棄・プレビュー省略の累計を常時表示します。レンダリングパイプライン、破棄ルール、インポート検証、UI 安定性ルールは [docs/architecture.md](docs/architecture.md) を参照してください。

## 🧪 開発

```bash
npm ci                    # ロックファイルから依存をインストール
npm test                  # カバレッジ付き Jest
npm run lint              # ファーストパーティ JavaScript 全体に ESLint
npm run format            # Prettier で整形(CI 同等の確認は format:check)
npm run version:check     # リリースバージョン 5 箇所 + バージョン非依存の README 経路
npm run integrity:check   # package-lock.json の来歴
npm run extension:check   # manifest・権限・参照・CSP・配布許可リスト
npm run extension:package # 検証済みリリース ZIP を dist/ にビルド
npm run store:check       # Edge/Chrome 申請書類・プライバシーノーティス・ストア PNG の整合
npm run contract:check    # コーディネータトポロジとエージェントのツール制限契約
npm run audit:strict      # npm audit --audit-level=high
npm run text:check -- --base <base-sha> --head <head-sha>   # 変更行の空白 / エンコーディング
```

[`.github/workflows/quality-gates.yml`](.github/workflows/quality-gates.yml) は Node.js 22 / 24 のマトリクスで、`npm ci`・Jest・ESLint・リリースバージョン同期・Prettier・ロックファイル来歴・変更行テキスト整合・拡張パッケージ整合・Edge/Chrome 申請キット整合・依存監査・コーディネータ契約を実行します。

### テスト

| 領域 | 手法 | 場所 |
|---|---|---|
| 純粋関数 | Jest ユニットテスト | [tests/panel.test.js](tests/panel.test.js) |
| テーマ / UI 契約 | Jest 静的契約テスト | [tests/ui-contract.test.js](tests/ui-contract.test.js) |
| 拡張パッケージ整合 | Jest + CI | [tests/extension-package.test.js](tests/extension-package.test.js) |
| リポジトリ整合 | Jest + CI | [tests/repository-integrity.test.js](tests/repository-integrity.test.js) |
| ストア申請キット | Jest + CI | [tests/store-readiness.test.js](tests/store-readiness.test.js) |
| サポート受付フォーム | Jest + CI | [tests/support-intake.test.js](tests/support-intake.test.js) |
| 変更行の整合 | Jest + CI | [tests/text-integrity.test.js](tests/text-integrity.test.js) |
| CI ガバナンス | Jest 静的回帰 | [tests/ci-governance.test.js](tests/ci-governance.test.js) |
| コーディネータ契約 | Jest 静的契約テスト | [tests/coordinator-contract.test.js](tests/coordinator-contract.test.js) |
| DOM 挙動・エクスポート内容・テーマ切替 | Edge DevTools での手動確認 | [docs/manual-test-checklist.md](docs/manual-test-checklist.md) |

ブラウザ API のモックは [tests/setup.js](tests/setup.js) にあります。

### プロジェクト構成

```
network-plus-extension/
├── manifest.json        明示的な CSP を持つ Manifest V3 マニフェスト
├── devtools.html/.js    Network+ パネルの登録
├── panel.html/.js/.css  パネルの UI・ロジック・テーマ
├── icons/               16 / 48 / 128 px の拡張アイコン
├── vendor/              サードパーティライブラリ(fflate)
├── scripts/             リポジトリ・パッケージ・バージョン・ストアの検証スクリプト
├── tests/               Jest スイートとブラウザ API モック
├── docs/                アーキテクチャ・設計・プロダクト・プライバシー・変更履歴・ストア資産
└── .github/             ワークフロー・エージェント・Copilot 指示・issue フォーム・funding 設定
```

## 🤝 コントリビュート

Issue も Pull Request も歓迎です。PR を開く前に:

1. `main` からブランチを切ります — `main` への直接 push はできません。
2. コミットメッセージは英語の Conventional Commit 形式で: `feat:`、`fix:`、`docs:`、`refactor:`、`chore:`、`test:`。
3. `npm test`、`npm run lint`、および変更に関係するチェックを実行します。
4. README・関係する `docs/`・テストを、挙動の変更と同じ PR で更新します。ユーザーに見えるランタイム・UI・アイコン・funding・プライバシー・ストア資産・README の変更には `docs/CHANGELOG.md` → `Unreleased` への bullet 追加が必須で、`npm run changelog:check` が PR 差分全体に対してこれを強制します。
5. 通常の Pull Request レビューを使い、有用な場合はコードレビューやセキュリティレビューを追加します。CI はレビューコメントマーカーやレビュアーセッション UUID を要求しません。

リポジトリの規約、パネルのセクション構成、XSS ルール、レビュートポロジは [.github/copilot-instructions.md](.github/copilot-instructions.md) に文書化されています。

**バージョニング**は Semantic Versioning に従います。`version` はコミットごとではなくリリース時にのみ上がり、[manifest.json](manifest.json)・[package.json](package.json)・[package-lock.json](package-lock.json) のトップレベルとルートエントリ・[panel.js](panel.js) のテストフォールバック定数の間で常に一致していなければなりません。`npm run version:check` が 5 箇所すべてを検証します。README は意図的にバージョン非依存です — リリースへのリンクはすべて `releases/latest` を指すため、リリースカットで README を編集する必要はなく、`version:check` がまさにそれを強制します。

**リリース**はマージ以外の手作業を必要としません。バージョンバンプが `main` に到達すると、[Publish Release ワークフロー](.github/workflows/release.yml)がパッケージを再ビルドし、バージョン・パッケージ・ストアキットのゲートを再実行し、アーカイブのダイジェストが申請書類に記録された値と等しいことを検証してから、ZIP を添付した `vX.Y.Z` の GitHub リリースをその版の変更履歴から生成したノート付きで公開します。`vX.Y.Z` タグを自分で push しても同じワークフローが動きます。既にリリースのあるバージョンは再公開されずスキップされるため、再実行は安全です。

## 🔐 セキュリティ

- DOM に描画されるユーザーデータはすべて `textContent` または DOM API を経由します。`innerHTML` はどこにも使われていません。
- Content Security Policy は [manifest.json](manifest.json) に明示的に宣言されています: `script-src 'self'; object-src 'self'`。
- 拡張が要求する権限は `storage` の 1 つだけで、テーマと検索設定(スコープ・一致オプション・Matches only の状態 — 検索キーワードやキャプチャしたトラフィックは決して含まない)の永続化に使います。HAR ダウンロードはローカルの Blob URL と一時的な `<a download>` 要素を使うため、`downloads` 権限は不要です。
- マニフェストは現在使用中の 8 個のトップレベルキーのみを許可します。ホスト権限・バックグラウンドワーカー・コンテンツスクリプトはバリデータが門前で拒否します。
- `npm run extension:check` は、権限の厳密な一致と実使用、ランタイムパスのシンボリックリンク・ルート境界、リソースのローカル性、インラインスクリプト禁止、CSP、配布許可リストを検証します。

## 🚧 制限事項

- **Chromium ブラウザのみ。** Edge と Chrome をサポートします。Firefox と Safari は DevTools 拡張の実装が異なり対象外です。[ブラウザサポート](#ブラウザサポート)を参照。
- **DevTools パネルでは ES モジュール不可。** `panel.js` で `import` / `export` は使えません。
- **設計としてビルドレス。** パッケージングは変換も依存解決も行わず、監査済みランタイムファイルのみをアーカイブします。
- **ローカル完結。** ネットワークリクエストなし、外部 API なし、テレメトリなし。
- **タイミングは手がかりであって証明ではない。** 表示される値はブラウザ報告の観測値で、パケットロス・物理層の障害・サーバ側の確定的な根本原因を立証するものではありません。

## 📚 ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | レンダリングパイプライン、保持とボディキャッシュ、インポート検証、UI 安定性ルール |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | リリース履歴 |
| [docs/manual-test-checklist.md](docs/manual-test-checklist.md) | キーボード・サンプルガイド・大量キャプチャの手動検証チェックリスト |
| [docs/privacy.md](docs/privacy.md) | ローカル処理・保存・Clear/Undo・クリップボード/HAR 出力に関する公開ノーティス |
| [docs/PRODUCT.md](docs/PRODUCT.md) | 対象ユーザー、プロダクトの目的、設計原則、WCAG 2.2 AA ベースライン(日本語) |
| [docs/DESIGN.md](docs/DESIGN.md) | UI トークン、コンポーネント、テーマルール(日本語) |
| [docs/edge-addons-submission.md](docs/edge-addons-submission.md) | en-US の Edge Add-ons 申請フィールド、プライバシー申告、審査ノート |
| [docs/chrome-web-store-submission.md](docs/chrome-web-store-submission.md) | en-US の Chrome Web Store 掲載情報、プライバシー申告、資産、テスト手順、運用チェックリスト |
| [docs/coordinator-topology.md](docs/coordinator-topology.md) | コーディネータセッションのトポロジ、任意の PR レビュー、クリーンアップゲート(日本語) |
| [docs/store-assets/](docs/store-assets/) | 300x300 ロゴ、440x280 プロモタイル、1280x800 合成スクリーンショット、機械可読インベントリ |
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | コントリビュータとエージェント向けのコーディング・セキュリティ・テストルール(日本語) |
| [.github/agents/](.github/agents/) | プロジェクトのプライマリエージェントと 6 軸 UI/UX レビューエージェント |

## 💬 サポート

質問とバグ報告は [GitHub Issues](https://github.com/himiyosh/network-plus-extension/issues/new/choose) へ。Issue は公開されます: 投稿前に資格情報・顧客データ・実トラフィックを取り除き、`Copy safe support summary` の出力も貼る前に確認してください。

## 💖 スポンサー

Network+ は個人開発の MIT ライセンスプロジェクトで、テレメトリ・広告・アカウント・有料プランはありません。**すべての機能は無料で、支援によって機能が解放・制限・変更されることは決してありません。**

| 場所 | リンク | 備考 |
|---|---|---|
| GitHub Sponsors | [github.com/sponsors/himiyosh](https://github.com/sponsors/himiyosh) | 単発または毎月 · プラットフォーム手数料なし |
| Ko-fi | [ko-fi.com/studio344](https://ko-fi.com/studio344) | 単発 · アカウント不要 |

同じリンクはパネル内の Network+ ブランドボタン — ドット絵カワウソと湯気の立つカップのツールバーマーク — の先にあるサポートダイアログにもあります。Network+ がこれらのサイトにキャプチャしたトラフィックや利用データを送ることはなく、あなたが訪問・支援したかどうかを知ることもできません。

金銭以外の支援も同じくらい力になります: [バグ報告や改善提案](https://github.com/himiyosh/network-plus-extension/issues/new/choose)、リポジトリへのスター、同僚への紹介など。

## 📄 ライセンス

[MIT](LICENSE) © himiyosh
