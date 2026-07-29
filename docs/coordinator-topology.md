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
- repository Actions variables は PR 外の非 secret attribution を使う近接防御であり、PR-editable checker code の trust boundary を解決したと表現してはならない。外部所有の trusted required check への移行は issue #95 の対象として維持する。
- ゲート自体の導入 PR では、通常の全品質ゲートを先に実行し、marker 未投稿による失敗を final marker step だけに限定する。global owner がその PR の exact head を独立レビューして marker を投稿後、同じ required workflow を rerun する。既にマージ済みの PR 履歴には遡及適用しない。

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
