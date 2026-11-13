# Codex 改善ハーネス

主スレッドが改善作業を統括し、必要な専門担当へ委任して、受入条件と実際の証拠から完了を判断します。対象は UI 修正に限らず、設計、実装、調査、品質、運用、文書の改善です。全観点の適用性を確認しますが、全員を毎回起動する必要はありません。

導入後は、通常どおり改善を依頼します。受入条件の登録、担当の選択、証拠の記録と完了チェックは統括が行います。

この文書は手順、委任、証拠、報告の正本です。共通の安全境界と承認は [engineering rules](../agentic-engineering-rules.md)、振る舞いは [persona rules](../agent-persona-rules.md) に従います。project 固有の要件、過去の合意、実在する検証コマンドは、対象 project の既存の正本で管理します。

## 1. 導入と有効化

導入には Git、Python 3.11 以降、認証済みの `gh`、`jq`、Bash が必要です。hook 実行には POSIX で `python3`、Windows で `py -3` を使います。Windows の installer は Git Bash 等で実行し、hook の実発火は利用する Codex client で確認してください。

Codex に対応した本 bundle の tag または full commit SHA を選び、**対象 project の root** で実行します。同じ immutable ref から installer と asset を取得します。

```bash
bundle_ref='REPLACE_WITH_CODEX_BUNDLE_TAG_OR_COMMIT_SHA'
gh api -H "Accept: application/vnd.github.raw+json" \
  "repos/himiyosh/agentic-rules/contents/scripts/install.sh?ref=$bundle_ref" > /tmp/agentic-codex-install.sh &&
bash /tmp/agentic-codex-install.sh --ref "$bundle_ref" \
  --platform codex --profile codex-improvement --target .
```

installer は checksum と参照先を確認し、`.agentic-rules.lock.json` に配布版を記録します。既存の Codex asset と内容が異なる場合は、書き込み前に停止します。既存の `AGENTS.md` や hooks がある project、または導入版を更新する場合は、別の一時 directory に同じ profile を導入し、差分を確認して統合します。元の project 指示と hook handler を保ち、新しい参照・役割・必要な handler を加えてください。既存ファイルの削除や強制上書きで衝突を消しません。統合で変えたファイルを配布版と同一と偽らず、差分と確認結果を project 側に記録します。

導入後は、次の順に確認します。

1. Codex で対象 project を開き直し、適用される `AGENTS.md` と `.codex/agents/*.toml` が発見されることを確認する。
2. CLI の `/hooks` または desktop の Review hooks / Settings > Hooks で、追加された command と通常の project / hook 信頼確認を行う。変更後は再確認が必要になる場合がある。
3. 小さな代表 task で担当が呼ばれること、hook が発火すること、未検証の完了を止めることを確認する。静的検証、hook の入力を使う模擬実行、実際の client の実行は分けて記録する。

信頼 registry の編集や hook trust を回避する option は使いません。モデル、provider、個人設定、承認 policy はこの profile から変更しません。利用 client が未対応、project が未信頼、hook が未承認の場合、配置だけで自動チェックが有効になったと報告しません。自動 hook を利用できない環境でも CLI で証拠を照合し、適用できなかった範囲を明示します。

## 2. 役割と適用性

| 役割 | 主な責任 | 呼ぶ目安 |
| --- | --- | --- |
| `improvement_orchestrator` | 受入条件、担当割当、依存関係、修正判断、最終検収 | 主スレッドがこの役割を担う |
| `requirements_reviewer` | 依頼の意図、既存要件、過去の合意、抜け漏れ | 意味や期待する結果を変える改善 |
| `design_architect` | 調査、代替案、設計、影響範囲 | 構造、契約、依存関係の判断が必要 |
| `implementation_worker` | 所有範囲を限定した実装と関連確認 | engineering §6.4 の委任・分離条件を満たす |
| `code_reviewer` | 正しさ、境界条件、既存契約、保守性 | 実行コードや設定を変更する |
| `ux_reviewer` | 実画面、導線、文言、各状態、アクセシビリティ | 利用者の画面や操作が変わる |
| `qa_reviewer` | 操作から実結果までの確認と回帰 | 振る舞いが変わる、または不具合を修正する |
| `reliability_reviewer` | 性能、並行処理、永続化、失敗時の復旧 | 処理、データ、資源、継続運用に影響する |
| `security_reviewer` | 認証、権限、秘密情報、信頼境界、データ保護 | その境界や扱うデータに影響する |
| `release_reviewer` | 導入、配布、互換性、運用手順、文書 | 配布物や利用・保守方法が変わる |

役割は `.codex/agents/<name>.toml` に定義します。主スレッドはすべての観点について必要・対象外と理由を決め、関連する担当だけを使います。例えば文書だけの小修正に UI 実機検証を要求せず、UI 操作の修正には文言レビューだけで済ませません。小さな変更の実装は主スレッドで行い、関連する観点を一つのレビュー依頼にまとめられます。この opt-in profile の run は実装者と異なる担当による確認を求め、自分の再読で代用しません。変更を伴わない回答には run を作りません。

統括を child として呼んだ場合は助言だけを返し、第二の統括や孫を作りません。実装担当の並行作業は独立 task / worktree と所有範囲を必要に応じて分離し、Git の共有操作は既存ルールに従います。reviewer の編集禁止は役割上の制約で、native agent の設定だけで tool 権限が分離されるという保証ではありません。

## 3. 改善を進める手順

1. **要求を復元する。** 現在の依頼、適用される指示、Product / Design / Knowledge の正本、`docs/agent-feedback.json` の有効な指摘を読む。以前の指摘を確認できない場合は、確認できた内容と不明点を分ける。
2. **受入条件と計画を登録する。** 観測する結果、出典、担当、確認方法を結び付け、§3.2 の計画を実装前に登録する。有効な指摘は全 ID を受入条件または理由付き対象外へ対応させる。未合意の好みや個人情報を共通ルールへ昇格しない。
3. **作業を割り当てる。** 対象版、目的、非対象、所有ファイル、適用する正本、受入条件、証拠、返却形式、終了条件を一つの依頼で渡す。依存する変更と共有ブラウザ・テスト環境の利用は直列にする。
4. **実装して検証する。** 必要な修正と関連する既存チェックを行う。不具合を再現できる場合は、原因と対応する回帰確認を追加する。将来の改善案を今回の必須条件へ無制限に追加しない。
5. **独立レビューで照合する。** 該当する担当が同じ最終差分、未 commit の変更、必要な実画面・環境を確認する。多数決や点数の平均で採否を決めず、統括が根拠と利用者への影響で判断する。
6. **修正後に必要な範囲を再確認する。** 新しい要件や指摘は正本と受入条件へ反映し、変更で古くなった証拠を更新する。該当 gate が満たされたら追加の任意レビューを止める。
7. **検収して引き継ぐ。** 必須条件、適用した観点、未解決指摘、証拠の鮮度を照合する。完了できない場合は未完了の理由と次の担当・手順を残す。完了判定が通っても、公開・merge・release の承認を新たに得たことにはならない。

過去の指摘は会話の記憶だけに依存させません。合意済みの制約を owning project の既存の正本に一度だけ残し、受入条件または回帰確認から参照します。共通化できる原則だけを本 bundle に戻し、同じ内容を全 agent 定義へ複製しません。

### 3.1 指摘を次の作業へ引き継ぐ

受け入れた訂正は `feedback-add` で project 所有の `docs/agent-feedback.json` に保存します。短い制約、安定した ID、適用範囲、出典、現行 / 置換済みの状態を保持します。既存の Product / Design 文書が詳細の正本であれば、その場所を参照し、全文を複製しません。古い指摘を消して上書きする代わりに、置換関係を残します。

```bash
python3 .codex/hooks/codex_harness.py feedback-add --repo . \
  --id concise-ui-copy --rule '通常画面の説明は短くし、詳細は必要時に開けるようにする' \
  --source '今回の利用者の訂正と、対応するDesign文書の参照' --scope 'UI copy'
```

実際に受け入れた文言・出典・範囲へ置き換えて使います。同じ ID と内容の再登録は重複を作らず、内容が異なる ID の上書きは拒否します。変更は新しい ID と `--supersedes OLD_ID` で旧項目を置換済みにします。Git に無視される保存先や危険な path は拒否し、既に追跡されたファイルの消失を「指摘なし」と扱いません。

このファイルは対象 project の変更として差分を確認し、通常の Git 手順で保存します。各 session の一時状態がある Git metadata とは役割が異なり、次の checkout や端末にも引き継ぐ対象です。installer はこの project data を配布・上書きしません。会話全体、個人情報、未確定の提案を自動蓄積する仕組みではありません。

開始 hook は有効項目を読み、短い preview と完全なファイルの場所を伝えます。表示を省略した場合は省略を明示し、全件を読んだと扱いません。計画には preview 外を含む全有効 ID の対応が必要です。欠落・適用外理由の未記載・途中で追加された指摘の見落としは、plan / evidence の検査で検出します。hook が利用できない場合も主スレッドが同じファイルを読みます。

### 3.2 実装前に計画を確定する

`init` で受入条件を登録した後、生成された report の `plan` を具体的な調査結果で記入し、`plan` コマンドで checkpoint を登録します。小さな変更なら短い記載で十分です。

| 計画の観点 | 記載すること |
| --- | --- |
| 目的・範囲 | 利用者の到達点、変更対象、今回扱わない内容 |
| 受入条件・過去の指摘 | 何を観測すれば達成か。有効な指摘 ID ごとの適用と対応条件、または対象外理由 |
| 前提・リスク | 確認できた前提、未確認事項、失敗・空・復旧など関係する経路。該当しない場合も理由 |
| 実施手順 | 各 action と、それを確認する check ID の対応 |
| レビュー・検証 | 関係する担当、対象テスト、最後の required gate、再確認が必要になる条件 |
| CI 方針 | まとまりを作る単位、push の時点、統括による確認、再実行する条件 |

初回 checkpoint は run 開始時の対象版と照合し、登録前に対象が変わった場合は拒否します。計画なしの証拠登録・完了は通しません。受入条件・有効な指摘・計画が変わったら、理由付きで計画を改訂して関連する確認を更新します。初回登録の対象版・digest と改訂理由の履歴を残し、事後に計画が先行したと装いません。

これは記録と段階順序の検査です。編集ツールの権限を制限する機構ではなく、計画内容の妥当性は統括と要件担当が判断します。要件担当は元の依頼と有効な指摘を受入条件へ照合し、受入条件の全 ID を確認します。

### 3.3 工数・トークン・CI の扱い

- **調査と委任**: 既に確認した情報は変更された箇所と依存範囲だけ読み直す。子には関連する短い資料と返却条件を渡し、全文の会話・ルール・ログを毎回複製しない。必要な観点をまとめ、一度確認した結論は入力が変わらなければ再利用する。
- **検証**: 編集中は対象を絞った check、統合した最終差分で required full gate を実行する。毎回全 suite を走らせない。再実行には source・依存・要求・環境の変更、具体的な失敗、または gate の要請という理由を持たせる。古い証拠を再登録しただけで再検証と扱わない。
- **公開と CI**: 整合した変更単位へまとめてから push する。統括だけが CI を監視し、まず結果要約と該当する失敗箇所を読む。必要なチェックは維持し、`skipped` や未実行を成功へ置き換えない。

計画や指摘の digest が変わると、証拠は保守的に失効します。これは関連性を再評価する合図で、全テストの再実行を一律に求めるものではありません。例えば CI 確認方針だけの改訂で、検証対象の source / build・command・依存・入力・環境・期待結果が変わらない場合は、該当 check の `reuse_reason` に元の証拠と同一性の根拠を残し、reviewer が確認してから既存ファイルを再登録できます。再利用を今回の再実行として報告せず、実行件数も水増ししません。同一性を説明できない項目や入力が変わった項目は、必要な確認を実行します。ハーネスがこの意味上の同一性を自動証明する機能はありません。

`agentic-rules` 自体の CI は PR 更新と `main` push が対象で、同一 PR / ref の古い実行をキャンセルします。feature branch の push と PR による二重起動は避けられています。各 project の workflow は実ファイルを確認して判断してください。この bundle のテスト workflow に LLM 呼出しはなく、ログ読込や再レビューのトークンは agent 側の運用で抑えます。実測していない削減率や token 数を報告しません。

## 4. 証拠と報告

各受入条件は、少なくとも「出典 → 期待結果 → 担当 → 実際の証拠」の対応を持ちます。証拠には対象の変更版または build、実行環境、実行した確認、観測結果を含めます。実環境、同等性を説明したテスト環境、モック、source の静的確認を区別してください。

| 観点 | 期待する確認の例 | それだけでは不足するもの |
| --- | --- | --- |
| 過去の指摘 | 合意の出典、今回の受入条件、対応する差分・回帰確認 | 「覚えています」という返答 |
| UI 文言 | 実画面で現在状態と次の操作が短く伝わる。詳細は必要時に読める | project の根拠がない一律の文字数制限 |
| セットアップ | 初回・途中再開・完了後の導線が一つの手順と状態に収束する | 同じ画面にリンクが二つあるという事実だけ |
| ボタン動作 | 操作後の永続状態、再読込後の結果、失敗時の復旧を確認する | click の成功、toast、スクリーンショットだけ |
| 回帰確認 | 対象ケースが実際に実行され、期待結果を満たす | 0 件実行、skip だけ、古い build の成功 |

判定は `pass`、`fail`、`unverified`、理由付き対象外を使います。確認できない項目を `pass` にしません。必須の指摘は修正と再確認の証拠を結び付け、任意提案と区別します。証拠ファイルが存在し hash が一致しても、記述の正しさや十分さは統括と独立担当が確認します。

**委任先の返却形式**

- 対象: task、役割、対象版 / build、確認した範囲。
- 結果: 条件ごとの判定、観測結果、証拠の場所、未検証の理由。
- 指摘: 必須 / 任意、利用者への影響、根拠、必要な修正・再確認。
- 実装担当のみ: 変更ファイル、振る舞いの変化、実行した確認と結果。
- 引き継ぎ: 残る blocker、次の担当、具体的な次手順。

利用者への完了報告は、成果、確認したこと、残る制約、次の action を短く示します。詳細な logs と指摘一覧は参照先に置き、すべてを画面や会話へ展開しません。

## 5. 実行と完了チェック

project root で `python3 .codex/hooks/codex_harness.py --help` を実行すると、現在の CLI 契約を確認できます。run は session と task に結び付けます。native hook を利用するときの session ID は hook が伝える実際の値を使い、任意の別 ID で代用しません。CLI だけで検証する場合は、その実行を識別する ID を付け、自動 hook の動作実績と区別します。

まず依頼の出典と観測できる受入条件を登録します。以下は UI 修正の例です。出典、条件、担当 ID は実際の task に合わせます。

```bash
session_id='SESSION_ID_REPORTED_BY_HOOK'
python3 .codex/hooks/codex_harness.py init --repo . \
  --session-id "$session_id" --run-id settings-save \
  --kind ui --implementer main \
  --source '今回の依頼: 設定の保存' \
  --acceptance '保存後に画面を再読込しても設定値が保持される'
```

`init` は未検証の report の絶対 path を JSON で返します。state は Git の `codex-harness` path 以下に置き、追跡対象や配布物へ混ぜません。`--acceptance` は複数指定できます。kind と最低限必要な観点は次のとおりです。

| kind | 必須の観点 | 追加で確認すること |
| --- | --- | --- |
| `code` | requirements、qa、implementation、code | 設定、基盤、処理の変更もここから関連観点を追加する |
| `ui` | requirements、qa、design、implementation、code、ux | 実画面と操作結果の両方 |
| `docs` | requirements、qa、release | 文書の正確さ、参照、利用手順 |
| `research` | requirements、qa、design | 出典、比較の妥当性、提案の根拠 |

全9観点の entry を残し、該当するものを `pass` / `fail` / `unverified`、その他を理由付きの `na` にします。最低限の観点を対象外へ変更して gate を回避しません。種類だけで全リスクが決まるわけではなく、例えば認証処理を変える場合は security も確認対象です。

初期 report の `plan` に §3.2 の内容を記入します。`steps` は action と check ID、`feedback_decisions` は全有効 ID に対する `apply` と `requirement_ids`、または `not_applicable` と理由を持ちます。次の登録が通ってから実装します。

```bash
report='ABSOLUTE_REPORT_PATH_RETURNED_BY_INIT'
python3 .codex/hooks/codex_harness.py plan --repo . --report "$report"
```

途中で要件・指摘・計画を変更するときは report の対応を更新し、`plan --repo . --report "$report" --revision-reason '変更の出典と理由'` で改訂します。元の `planning_receipt` と `planning_history` を保持し、変更後の計画と指摘に対応した証拠を登録します。計画を持たない旧 report を事後に合格へ移行せず、未完了を保全して新しい run の開始点を明確にします。

実装と確認を行った後、report に実測値と担当からの報告を記録します。

| report の項目 | 記録する内容 |
| --- | --- |
| `plan` / `planning_receipt` / `planning_history` | 実装前の計画、登録した対象版・要件・指摘の digest、理由付き改訂 |
| `requirements` | ID、出典、受入条件、`static` / `runtime` の区別、対応する check ID |
| `checks` | ID、判定、`real` / `equivalent` / `mock` / `static`、実行したケース数 `executed`、確認した条件数 `assertions`、期待結果、実結果、evidence ID。`equivalent` には同等性の説明 `equivalence` |
| `viewpoints` | 各観点の判定、実際の reviewer ID、理由、受入条件 ID、evidence ID |
| `evidence` | `record` が登録する実ファイル、SHA-256、対象版、受入条件・指摘集合の digest |
| `findings` | 必須 / 任意、未解決 / 解決、内容。必須指摘の解決には対応する check ID |
| `publication` | 完了確認を公開の承認へ読み替えないための別項目 |

report に書いた command を checker が代わりに実行することはありません。実際に取得した log、観測記録、スクリーンショット等を `record` で結び付けてから、完了判定を実行します。

```bash
report='ABSOLUTE_REPORT_PATH_RETURNED_BY_INIT'
python3 .codex/hooks/codex_harness.py record --repo . \
  --report "$report" --id save-result \
  --file /absolute/path/to/actual-verification.log
python3 .codex/hooks/codex_harness.py check --repo . \
  --report "$report" --session-id "$session_id"
```

`check` は読み取り専用です。統括が証拠の内容を確認して run を閉じるときは `finish` を使います。再度 check が通った場合だけ完了し、run と証拠を保存して次の task へ進めます。native Stop hook も有効な run の完了を確認します。

```bash
python3 .codex/hooks/codex_harness.py finish --repo . --report "$report"
```

必要な実環境や権限がなく続けられない場合は、原因と次の担当・手順を報告して `pause` します。未完了の記録を保持したまま active run を閉じ、別 run ID で次の task を開始できます。中断を成功へ変換しません。

```bash
python3 .codex/hooks/codex_harness.py pause --repo . --report "$report" \
  --reason '未確認の項目、必要な環境、次の担当と確認手順をここに記録する'
```

先に受入条件・対応する check・指摘集合を更新し、その内容に対する証拠を採取します。`record` は対象版を現在の fingerprint に更新し、指定した証拠だけに現在の版と digest を記録します。ほかの古い証拠を自動的に有効にしません。後から code、受入条件、指摘が変わった場合、影響する確認をやり直して証拠を再登録します。既存の古い log を再登録するだけでは再検証になりません。

`fingerprint --repo .` は現在の対象版を表示します。HEAD と、Git 追跡対象・ignore 対象外の未追跡ファイルの内容、実行 bit、symlink の参照先、削除を含みます。Git metadata と ignore 対象は含まず、submodule working tree は別 run が必要なため明示的に失敗します。検証した build、実環境の設定、外部サービスの状態も観測記録に残し、source の fingerprint だけで同じ実行環境だったと判断しません。check の成功は記録の整合確認です。主スレッドは証拠の内容、実際の担当、十分な検証であることを判断してから報告します。

## 6. hook の動作と限界

SessionStart / UserPromptSubmit で対象 session の開始状態を記録し、session ID と手順の短い参照を統括へ渡します。Stop でその session の変更と run を確認し、run の作成を忘れた変更も検出対象にします。未解決の失敗は次の prompt でも保持します。無関係な session の report を自分の完了根拠にせず、変更のない会話に改善レビューを強制しません。

必須確認の欠落、失敗、未検証、古い対象版・証拠、未解決の必須指摘があれば完了を認めません。自動継続は制限し、解消できない場合は未完了として引き継ぎます。hook が停止を許したことと、品質 gate が通ったことは別です。

このハーネスは、要件と証拠の整合性を確認する補助です。意味の正しさ、すべての不具合の発見、セキュリティの保証、既存 CI の代替、証拠の改ざん防止を提供しません。常駐 Bot、定期実行、Copilot HOME session の lifecycle API も新設しません。利用環境で提供される機能を確認してから使ってください。

## 7. 保守と検証

この bundle の変更では `bash scripts/validate.sh` を実行します。native 定義、配布 pin、profile の依存関係、既存ファイルの保護、正常系と否定系を確認します。client 更新時は、構文が通るだけでなく、担当の発見・呼出しと hook の実発火も再確認します。委任先で発火する event と session ID も確認し、子の作業と統括の検収を混同していないことを確かめます。

公式仕様を確認した日: 2026-11-06。対応の可否は実際に利用する client と版で判断してください。

- [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents?surface=app)
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex hooks と信頼確認](https://learn.chatgpt.com/docs/hooks)
