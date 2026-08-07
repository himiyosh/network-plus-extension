# コーディネーターセッション トポロジー

長期プロジェクト作業のためのコーディネーター＋タスクスコープ型チャイルドセッション構成に関するリポジトリ全体のルール。本プロジェクトで作業する全エージェントに適用される。

---

## コーディネーターセッション

- **プロジェクトごとに 1 つの日付入りコーディネーター**のみ持つ。セッション名の形式は `🌐 YYYY-MM-DD Network+ 統括`（絵文字を先頭に置くこと）。
- コーディネーターはアクティブブランチ一覧・完了タスク記録・ロールオーバー状態を保持する標準的な情報源となる。
- チャイルドの PR のマージ承認とチャイルドセッションのアーカイブはコーディネーターのみが行う。
- ロールオーバー条件に達した場合は新しいコーディネーターを作成し、旧コーディネーターをアーカイブする。
- **プライマリエージェントの `tools:` フィールド禁止**: フロントマターに `tools:` を宣言しない。[公式仕様](https://docs.github.com/en/copilot/reference/custom-agents-configuration#tools)により、`tools:` を省略するとホストが利用可能なすべてのツールを供給する。明示的なリストは未知のツールを無用に排除する。

## チャイルドセッション

- **タスク 1 件につきチャイルドセッション 1 つ**。コーディネーターのハンドオフのみを起点として作成し、他セッションのトランスクリプトや横断的な状態は引き継がない（非フォーク）。
- **チャイルド 1 つにつきブランチ 1 本・PR 1 件**。ブランチ名はホスト/プロジェクトの命名規則（例: `copilot/<slug>` や `<type>/<slug>`）に従い、強制的な形式は指定しない。PR **本文**に `Fixes #<issue-id>` を含める（タイトルではない）。
- **同時にアクティブなチャイルドは最大 3 つ**。4 件目のタスクは既存スロットが空くまでコーディネーターがブロックする。
- チャイルド同士は直接通信しない。すべての調整はコーディネーターセッションを経由する。

## セッションサイズ制限

| フェーズ | 上限 |
|---|---|
| キックオフ（新チャイルドへの初期コンテキスト） | 32 KiB |
| 完了報告（チャイルドからコーディネーターへ） | 8 KiB |
| ハンドオフ（ロールオーバー時のセッション間受け渡し） | 64 KiB |

ハンドオフには PII・顧客データ・認証情報・サポートケース内容・診断ペイロードを含めない。参照するのは公開済みの Issue 番号と SHA ハッシュのみとする。

## ロールオーバー条件

以下のいずれかの条件に達した時点で新しいコーディネーターを作成する（旧コーディネーターはアーカイブ）:

- コーディネーターのコンテキスト使用率が既知の API 上限の約 70% に達した。
- 出力が著しく長大または断片化し、後続ターンで確実に参照できなくなる恐れがある。
- ターン数が約 100 を超えた。

ロールオーバー時の状態記録はセッション artifact または簡潔な durable issue/git リファレンスに保存する。リポジトリへの追跡ファイルのコミットは行わない。

## クリーンアップゲート

セッションをアーカイブまたはクローズできるのは、以下のゲートがすべて通過した場合のみ:

| ゲート | チャイルド | コーディネーター |
|---|---|---|
| ワークツリーがクリーン（未コミット変更なし） | ✅ 必須 | ✅ 必須 |
| 実行中のプロセスや未回収の artifact がない | ✅ 必須 | ✅ 必須 |
| 成果が durable な形（マージ済み PR / クローズ済み Issue）で確定している | ✅ 必須 | — |
| 全ユニークコミットが保持/統合済みブランチの祖先であり孤立していない | ✅ 必須 | — |
| オープン PR が残っていない | ✅ 必須 | — |
| ブランチがカレント / デフォルト / 保護対象ブランチでない | ✅ 必須 | — |
| 全クオリティゲートが通過している | ✅ 必須 | ✅ 必須 |
| アクティブなチャイルドセッションが残っていない | — | ✅ 必須 |

**アーカイブ操作はホストツール経由でのみ実行する。**

## 独立レビューゲート

- 実装チャイルドと、そのチャイルドを所有または adopt したコーディネーターは、その PR の `independent-review` clearance marker を投稿してはならない。
- コーディネーターは `continuous-improvement-watchdog.md` から現在の global owner を解決し、実装セッションから独立した reviewer に exact-head review を委譲する。repository Actions variables `INDEPENDENT_REVIEW_REVIEWER_SESSION_ID` と `INDEPENDENT_REVIEW_MERGER_SESSION_ID` は full UUID (full lowercase UUID) で相互に異なる必要があり、required CI は marker の `by=` と設定済み reviewer UUID の一致を必須化する。
- required CI は PR コミットにあるいずれかの `Copilot-Session` trailer と reviewer UUID が一致する実装セッション自己レビュー、implementation-session attribution が空の PR、`OWNER` 以外の drive-by comment を拒否する。同じ GitHub account を共有するセッション間では `author_association` は reviewer session identity を証明しないため、実際にレビューした設定済み reviewer session 自身だけが marker を投稿する。
- GitHub REST の PR commit list は最大 250 件のため、required CI は収集前後に pull request metadata の総コミット数を取得し、総数の安定性と収集件数の一致を marker 評価前に確認する。総数が 250 件を超える、metadata が欠落または不正、収集中に総数が変わる、あるいは件数が一致しない場合は fail closed とする。250 件を超える PR は 250 件以下の複数 PR に分割し、各 PR で review gate を再実行する。
- repository Actions variables は PR 外の非 secret attribution を使う近接防御であり、それ単体では PR-editable checker code の trust boundary を解決したと表現してはならない。issue #95 の code-trust boundary は `.github/workflows/trusted-independent-review.yml` が担う（次節）。
- ゲート自体の導入 PR では、通常の全品質ゲートを先に実行し、marker 未投稿による失敗を final marker step だけに限定する。global owner がその PR の exact head を独立レビューして marker を投稿後、同じ required workflow を rerun する。既にマージ済みの PR 履歴には遡及適用しない。

### Trusted code boundary (issue #95)

`.github/workflows/trusted-independent-review.yml` が marker 検証の code-trust boundary である。GitHub は `pull_request_target` と `issue_comment` の workflow 定義を **base repository の default branch から解決し、PR ブランチからは解決しない**。この workflow はどの step でも PR 由来のコードを checkout も実行もしないため、checker・そのテスト・workflow 自体を書き換える PR でも、**その run が何を検証するかを変えられない**。

**この境界が守らないもの（PR #120 で実測）**: commit status の名前空間はこの workflow の所有物ではない。repository の default workflow permission が `read` でも、PR 内の workflow が `permissions: statuses: write` を宣言すれば任意の context を投稿でき、投稿者は required checks と同じ GitHub Actions app (app id 15368) になるため branch protection では区別できない。

```
PR #120 実測: context=elevation-probe state=success creator=github-actions[bot]
head=ec00798555403b3eb9a427375c08b8cb8553b53b run=31219149471 → ELEVATION_ALLOWED
```

したがってこの gate が拘束するのは**検証ロジックであって結果の名前空間ではない**。意味するところは:

- checker / テスト / workflow の書き換えによる**無自覚な弱体化は機械的に不可能**になった（従来はこれが最も現実的な失敗様式だった）。
- 一方、`independent-review` context を投稿する workflow を PR に**意図的に追加**すれば偽の success は作れる。これは「無害なリファクタ」を装えない、diff 上で明白に故意の行為である。
- race も塞げない。攻撃側の run が後に投稿すれば最後の書き込みが残る。GITHUB_TOKEN ベースの signal は、PR が workflow を追加できる repository では原理的に偽装可能である。
- 恒久的な解は、独立所有の GitHub App が発行し branch protection で `app_id` 固定した check run であり、これは issue #95 に残課題として残す（App の作成と private key の保管は利用者操作を要する）。

| 性質 | 実装 |
| --- | --- |
| 信頼されたコードだけを実行 | checkout は `ref: ${{ github.event.repository.default_branch }}` に固定。PR head / merge ref は参照しない |
| 依存インストールなし | checker は依存ゼロ。write 可能な token scope 内で package lifecycle script を実行しない |
| 最小権限 | workflow 既定は `permissions: {}`、job は `contents: read` / `issues: read` / `pull-requests: read` / `statuses: write` のみ |
| fail closed | 検証前に `state=failure` を seed する。run が中断・失敗しても required check が pending のまま残らず、blocking status が残る |
| exact head | status は `pull_request_target` payload の full 40-hex head SHA に対して発行する（`issue_comment` のときだけ API へ fallback）。新しい commit を push すると seed が再び failure に戻る |
| 事後の marker にも追従 | `issue_comment` の created / edited / deleted で再検証するため、marker 投稿後は rerun 不要で status が更新される |

status context は `independent-review` で固定する。`tests/trusted-review-boundary.test.js` がこれらの性質を変異テストで固定する。固定は 3 層で、**ファイル全体を覆う**:

1. **列挙**: top-level key、job id、job key、step の名前・順序・action pin を allowlist で固定する。
2. **意味的検査**: `run:` 本文の禁止構文（fetch/checkout、ダウンロード、間接シェル、依存インストール、式の直接展開）、`continue-on-error` の不在、`outcome` 参照、status 投稿の規律。名前付き診断が出るのはこの層である。
3. **digest catch-all**: job header と各 step 本文の SHA-256、最後に **workflow ファイル全体の SHA-256**。列挙も意味的検査も通り抜けた改ざんはここで必ず落ちる。

3 層必要な理由も、最終層をファイル全体にした理由も実測にある。step だけを digest していた版に赤チームを当てると、**step 本文を 1 バイトも変えずに** gate を無力化できた: job 級 `container:`（全 run step を攻撃者イメージで実行し、そのイメージの `gh` が本物の token で success を投稿する）、`defaults.run.shell` によるインタプリタ差し替え、job 級 `env:` による `TRUSTED_REVIEW_STATUS_CONTEXT` の shadowing、2 つ目の job、`on:` への `paths-ignore` 追加、top-level `env:` への `GH_HOST` / `NODE_OPTIONS` 注入。

さらに列挙と領域 digest を足した版にも穴が残った。当時の digest は `on:` から始まっており **`on:` より上（`name:` とコメント群）はどの digest にも入らず**、top-level 鍵の列挙は行 regex だったため、**Prettier の正準形である単一引用符**を使った `'defaults':` を `on:` の上に挿入すると全ゲート緑のまま `run.shell` を差し替えられた。攻撃者のインタプリタなら token を持つ step が偽の success を投稿し、無害な no-op なら status が一切出ず required check が永久に pending になる。regex で領域を切る限りこの種の穴は残るため、最終層はファイル全体の digest とした。上記の経路はすべて変異テストとして固定してある。

digest の更新は「trusted run の実行内容を変える」という明示的でレビュー可能な行為になる。

**このテストは enforcement ではなく review aid である。** テストは PR 側で編集可能な tree にあり、PR 側で編集可能な `quality-gates.yml` の Jest 実行に依存する。したがって PR は、workflow を弱めると同時にテストを消す・jest の discovery から外す・`tests/setup.js` で `fs.readFileSync` を差し替えて健全な内容を読ませる、といった手段でこの tripwire を黙らせられる。**強制力は base-resolved な workflow 側にあり**（PR はその実行内容を変えられない）、テストの役割は「gate を弱める変更が merge レビューの diff で必ず目に見える」ようにすることである。gate 関連ファイル（この workflow、このテスト、`tests/setup.js`、`quality-gates.yml`、`package.json` の jest 設定）に触れる PR は、その一点だけで精査対象になる。

**運用上の注意**

- `pull_request_target` / `issue_comment` の workflow は default branch 版が動くため、**この workflow を変更する PR 自身では新しい定義は動かない**。変更は merge 後の PR から有効になる。
- Actions 自体が停止している場合（課金停止など）は status が発行されず、required 化していれば merge は pending で止まる。これは安全側の停止であり、checker や workflow を PR 内で編集して迂回してはならない。
- reviewer UUID の rotation 手順は下記 runbook のまま。trusted workflow は同じ Actions variables を読む。

**移行手順**

1. 本 workflow を main に merge する（この時点では in-PR gate と並走し、status は informational）。
2. 実 PR で `independent-review` status が success / failure を正しく発行することを確認する。
3. `gh api -X PATCH repos/himiyosh/network-plus-extension/branches/main/protection/required_status_checks -f 'contexts[]=Node 22.x' -f 'contexts[]=Node 24.x' -f 'contexts[]=independent-review'` で required に加える（リポジトリ管理者の判断）。
4. required 化を確認した後で、`quality-gates.yml` の in-PR marker step と `tests/trusted-review-boundary.test.js` の移行 pin を同じ PR で外す。順序を逆にすると gate のない期間が生じる。

### Repository-specific marker

コピー用の唯一の Network+ marker は `independent-review head=<40hex> verdict=pass by=<full lowercase UUID>`。`author_association: OWNER` の issue comment の first non-empty unfenced line に置き、説明は次の行以降に記載する。HTML comment wrapper、末尾の `at=`、fenced example、他リポジトリの incompatible marker format、別セッション ID の proxy posting、merger self-review は clearance として扱わない。

### Actions variable rotation runbook

1. ホストの session metadata と `continuous-improvement-watchdog.md` から、次に実レビューを行う reviewer UUID と merge を所有する coordinator UUID を取得する。両方が full lowercase UUID で相互に異なることをローカルで検証し、token、credential、comment body、commit message は出力しない。
2. repository root で `gh variable set INDEPENDENT_REVIEW_REVIEWER_SESSION_ID --body "$reviewer_id"` と `gh variable set INDEPENDENT_REVIEW_MERGER_SESSION_ID --body "$merger_id"` を順に実行する。これらは非 secret UUID であり、secret や credential を変数へ格納しない。
3. `gh variable get INDEPENDENT_REVIEW_REVIEWER_SESSION_ID` と `gh variable get INDEPENDENT_REVIEW_MERGER_SESSION_ID` の取得値を、意図した UUID とローカルで exact compare する。両方の一致と相互不一致を確認するまでレビューを委譲せず、marker を投稿しない。
4. PR の full 40-character head SHA を再取得し、その exact head を設定済み reviewer session がレビューする。reviewer 本人が marker を投稿した後だけ同じ required workflow を rerun し、merger または coordinator は reviewer UUID を proxy posting しない。
5. missing、malformed、equal、stale、mismatched configuration で失敗した場合は marker 投稿と merge を停止する。意図した最後の reviewer/merger pair を手順 2 で再設定し、手順 3 の read-back、head 再取得、exact-head review、workflow rerun を順番どおりにやり直す。PR 内の allowlist、workflow、checker を編集して recovery を迂回しない。

## Host-Tool Fallback

セッション管理ツール（セッション名変更・タスクセッション作成・メッセージング・アーカイブ）がハーネスで利用できない場合:

1. **安全な in-session 作業のみ継続する**: ファイル編集・テスト実行・ファイル読み取り・git 操作に限定する。
2. **偽アーカイブを絶対に行わない**: 以下の操作をアーカイブの代替として実行しない。
   - アプリケーション DB の編集
   - 生の OS プロセスの強制終了 (`kill` / `pkill` / タスクマネージャー等)
   - マネージドワークツリーの手動削除
   - 破壊的 git 操作（`--force` push、ブランチの直接削除）
3. **セッション/ブランチ名変更禁止**: ツールがエラーを返した場合は元の名前のまま継続し、次の進捗報告でブロッカーを報告する。
4. **フォールバック状態をリポジトリにコミットしない**: 状態はセッション artifact または簡潔な durable issue/git リファレンスに記録する。
5. **ブロッカーを報告する**: 次の進捗報告の `BLOCKERS:` 行に利用できないツール名（具体的な識別子）と影響を記載する。

## データ安全性

- ハンドオフ・セッション artifact・コーディネーター状態にはユーザーデータ・顧客データを埋め込まない。
- パスワード・トークン・API キー・生の診断ペイロードはセッションで参照できるファイルに一切含めない。
- これらのルールは `.github/copilot-instructions.md`（セクション 3）のセキュリティ制約を補完するものであり、代替するものではない。
