# Project memory

<!-- agentic-rules:begin -->
<!-- Managed by the agentic-rules bundle (platform: claude-code, profile: core). -->
<!-- Do not hand-edit inside this block. Re-copy from the pinned source ref instead. -->

## 常時適用ルール

組織非依存の安全契約、work cycle、validation、evidence は `.claude/rules/agentic-core.md` にあり、
Claude Code が launch 時に自動ロードする。**このファイルから import しない。**
`@` import は working directory の外を指すと承認ダイアログの対象になり、一度拒否すると恒久的に無効化されるため、
安全契約をそこへ依存させない。

## 詳細ルール（Progressive Disclosure。常時ロードしない）

以下は**読み込まない**。表の「いつ読むか」に該当する作業へ入る直前に、その 1 ファイルだけを読む。
すべてこのプロジェクト内の相対パスであり、bundle の配布時に実体がコピーされる。

| いつ読むか | パス |
| --- | --- |
| 実装方針、検証、ブランチ運用、依存、Web スタックの判断に迷った時 | `.claude/knowledge/agentic-rules/agentic-engineering-rules.md` |
| 応答スタイル、自己改善、エンコーディング、MCP の扱いを確認する時 | `.claude/knowledge/agentic-rules/agent-persona-rules.md` |
| 出典付き調査、RAG、ナレッジ検索エージェントを設計・実装する時 | `.claude/knowledge/agentic-rules/agentic-knowledge-system-rules.md` |
| bounded loop、graph/DAG workflow、checkpoint、HITL を設計する時 | `.claude/loop-graph-engineering.instructions.md` |

profile によっては配布されないファイルがある。存在しないパスは無視し、不足を推測で補わない。

<!-- agentic-rules:end -->

## このプロジェクト固有のルール

このプロジェクトだけに効く絶対制約をここに書く。上の共通ルールと重複する一般論は書かない。

- 導入元 ref: `v0.6.1` (`5792d8bb3ea23d3812e10c5b7f4ced214ac73753`)
- 導入 profile: `core`（platform: `claude-code`）
- ローカル逸脱: `.claude/knowledge/agentic-rules/agentic-engineering-rules.md` §6.10 から、レビューコメント marker・レビュアー session UUID・repository variables による merge ゲート手続きの bullet 3 件を削除している（#129 で本リポジトリでは廃止済み。merge 可否は branch protection と通常の CI quality gates で判定する）。bundle 更新時は再取得後に同じ削除を再適用すること。

### PR マージは承認依頼なしで進めてよい

ユーザーのローカル動作確認は `develop` からの pull が前提のため、**CI green+全ゲート通過を確認した PR は、
都度の承認を求めずマージしてよい**(2026-08-22 ユーザー指示)。マージ後は毎回
`git push origin origin/main:refs/heads/develop` で develop を同期し、作業ブランチを origin/main から再スタートする。
リリース(バージョンを切る・ストアへ出す)は従来どおり明示指示があるまで行わない。

### prettier の対象は許可リストが正

`panel.js`・`tests/panel.test.js`・`tests/ui-contract.test.js` は**意図的に prettier 管理外**
(契約テストがソース原文のインデントごとピンするため)。`prettier --write panel.js` を直接叩くと
約 700 行が再整形されて契約ピンが大量に壊れる(2026-08-22 に実証)。整形の正は package.json の
`format` script の明示リストのみ。管理外ファイルは手整形で周囲の流儀に合わせる。

### テスト実行の絶対則

実ブラウザ回帰(status-summary-browser / mirror-browser)は `/opt/pw-browsers/chromium` を候補パスとして
**自動発見する**ため、このリモート環境では素の `npm test` でも実行される(PR #175 で恒久化。それ以前は
CHROME_BIN 必須で、無いと黙ってスキップされ「ローカル green・CI 赤」が起きた — PR #159 で実証)。
`CHROME_BIN` を明示すれば常にそれが優先。`set -o pipefail` で `Tests:` 行を読む規律は引き続き必須で、
スイート数が想定(18)から減っていたらスキップを疑うこと。

### リリースとストア再申請

手順は skill `.claude/skills/store-release/SKILL.md`(`/store-release`)に集約してある。リリース・再申請・store-submit の失敗診断はまずそれを開く。
最重要の 1 点だけここに再掲: **store-submit は release イベントでは発火しない**(release.yml が GITHUB_TOKEN でリリースを作るため)。毎回 workflow_dispatch で起動する。

### ストア申請の資格情報（`dual-subtitles` と共通）

Edge / Chrome の申請資格情報は、拡張ごとではなく**アカウント単位**で共有される。同じ値を
`himiyosh/dual-subtitles`（ローカル worktree: `~/GH_himiyosh/ghcp-worktrees/dual-subtitles`）でも使っている。
Edge 側は 2026-08-20 に、dual-subtitles の Client ID + API キーで Network+ 製品への
アップロードが成功したことで実証済み（それまでの 401 連発は保存値の貼り間違いが原因で、
資格情報の分離を意味しなかった）。値の同一性を疑うときは値を貼り直すのではなく、
`store:submit -- --diagnose` の指紋と手元の `.env.*` の指紋を突き合わせて確定させること。
そちらのリポジトリ直下の `.env.edge` / `.env.cws` が値の所在で、どちらも `.env*` で gitignore されている。
値そのものをこのリポジトリに書いてはならない。GitHub の `store-submission` environment secrets が唯一の保管先。

| このリポジトリの secret | dual-subtitles 側 | 拡張ごとに違うか |
| --- | --- | --- |
| `EDGE_CLIENT_ID` | `.env.edge` の同名 | 共通 |
| `EDGE_API_KEY` | `.env.edge` の同名 | 共通 |
| `EDGE_PRODUCT_ID` | `.env.edge` の同名 | **拡張ごと** — Network+ は `4fcf1d3e-d1fe-4d4a-a741-97d8d8fa4241` |
| `CHROME_CLIENT_ID` | `.env.cws` の `CWS_CLIENT_ID` | 共通 |
| `CHROME_CLIENT_SECRET` | `.env.cws` の `CWS_CLIENT_SECRET` | 共通 |
| `CHROME_REFRESH_TOKEN` | `.env.cws` の `CWS_REFRESH_TOKEN` | 共通（スコープはアカウント単位） |
| `CHROME_ITEM_ID` | `.env.cws` の `CWS_ITEM_ID` | **拡張ごと** — Network+ は `mhidipnhdnonbjkfklcohmnnmfggjlpo` |

この 2 つは識別子であって資格情報ではない。API キーなしでは何もできず、Chrome の方は公開 listing の
URL にそのまま現れる。ポータルを開き直さずに済むよう、ここに控えておく。取得元は Partner Center の
`.../microsoftedge/<GUID>/packages/...` の GUID 部分と、`chromewebstore.google.com/detail/<name>/<id>` の末尾。

**Edge は公開 listing の ID が `EDGE_PRODUCT_ID` と別物**である点に注意。Chrome は Items API に渡す
item ID がそのまま公開 URL に現れるが、Edge の `4fcf1d3e-…` は Partner Center の製品 GUID であって
ストアフロントの ID ではなく、URL に置くと 404 になる。公開 listing は
`https://microsoftedge.microsoft.com/addons/detail/network-for-devtools/dhmafmhaagefmichhmmkknapalhmlmal`。
README の両方がこの GUID を使っていて 2026-08-27 まで 404 を返していた。
以後は `npm run version:check` が両 README のストアリンクを検証する。

Chrome の OAuth クライアントと refresh token は共通なので、Cloud プロジェクトの作成も同意フローも
やり直さない。`scripts/chrome-refresh-token.js` は、その refresh token を失ったときだけ使う。

Edge の API キーは**作成から約 72 日で失効する**。使う前に dual-subtitles 側の
`./scripts/publish-edge.sh check` で生死を確認すること。失効していれば Partner Center の Publish API
ページで再作成し、両プロジェクトの保管先を揃えて更新する。
