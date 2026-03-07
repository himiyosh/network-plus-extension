# JPUCSupport 共通プロジェクトルール

> 本ドキュメントは JPUCSupport 組織配下の全 8 プロジェクトの README および Copilot Instructions を分析し、
> 共通するルール・規約・ベストプラクティスを統一フォーマットとしてまとめたものです。
>
> **対象プロジェクト**: DfMWatcher, TodaysOff, M365UpdateTracker, LYNXWatcher,
> Permission-Review-Kit, MSVacation-Automation-Kit, UCKBAgent-Bullpen, UCToolkit
>
> **作成日**: 2026-03-03
> **ソース**: `.project-refs/` 配下の README-*.md (7 件) + INSTRUCTIONS-*.md (9 件) + UCToolkit copilot-instructions.md

---

## 1. README テンプレート構造

全プロジェクトの README に共通する推奨セクション構造。

| 順序 | セクション | 必須 | 説明 |
|:---:|---|:---:|---|
| 1 | **概要 (Description)** | 必須 | プロジェクトの目的・機能を簡潔に記述 |
| 2 | **主な機能** | 推奨 | テーブル形式 (絵文字 + 機能名 + 説明) で機能一覧。3 件以下の場合は箇条書きも可 |
| 3 | **アーキテクチャ** | 推奨 | 処理フロー・構成図・認証方式 |
| 4 | **プロジェクト構造** | 必須 | ファイル/フォルダツリーとそれぞれの説明 |
| 5 | **セットアップ / 前提条件** | 必須 | 環境構築手順・依存関係 |
| 6 | **使い方 (Usage)** | 必須 | 実行方法・コマンド例・パラメータ一覧 |
| 7 | **エージェント・プロンプト構成** | 条件付き | Copilot Agent / プロンプトが 3 つ以上ある場合に独立セクション化 |
| 8 | **テスト方法** | 推奨 | テストモード・チェックリスト・確認方法 |
| 9 | **注意事項 / 制約** | 推奨 | 既知の制限・運用上の注意 (「**キーワード** --- 補足説明」形式) |
| 10 | **変更履歴** | 推奨 | バージョンごとの変更内容 (`<details>` アコーディオン必須) |
| 11 | **ライセンス** | 任意 | MIT 等 |

### バッジ (Shields.io) の表示

- プロジェクト名 (H1) の直後に **Shields.io バッジ** を配置し、リポジトリへのリンクや技術スタック等を視覚的に示す
- 推奨バッジ:

| バッジ | 用途 | 例 |
|---|---|---|
| **ADO リポジトリ** | 必須 | `[![Azure DevOps](https://img.shields.io/badge/ADO-JPUCSupport-0078d4?logo=azuredevops)](リポジトリURL)` |
| **技術スタック** | 推奨 | `![PowerShell](https://img.shields.io/badge/PowerShell-5.1-5391FE?logo=powershell)` |
| **ステータス** | 任意 | `![Status](https://img.shields.io/badge/Status-Active-brightgreen)` |

- **推奨個数**: **3~5 個**を目安とする。ADO バッジ (必須) + 技術スタック 1~2 個 (推奨) + プロジェクト固有メトリクス 1~2 個 (任意)
- 記載例:
  ```markdown
  # 🛡️ Permission-Review-Kit

  [![Azure DevOps](https://img.shields.io/badge/ADO-JPUCSupport-0078d4?logo=azuredevops)](https://dev.azure.com/JPUCSupport/Permission-Review-Kit)
  ![PowerShell](https://img.shields.io/badge/PowerShell-5.1-5391FE?logo=powershell)
  ![Status](https://img.shields.io/badge/Status-Active-brightgreen)
  ```

#### ADO Wiki でのバッジ横並び制約

- **ADO Wiki ではバッジ (画像リンク) を同一行に並べても縦方向にスタックされる** (各画像がブロック要素としてレンダリングされるため)
- これは **ADO Wiki の既知の制限事項** であり、書き方の問題ではない
- GitHub の README では同一行に書けば横並びになるが、ADO Wiki では異なるレンダリングエンジンが使用されている
- **対処法**: ADO Wiki では縦並び表示を許容する。GitHub README では横並びで表示される
- なお、GitHub 上の README と ADO Wiki では表示が異なるため、主要な閲覧環境 (GitHub / ADO) に応じてレイアウトを確認すること

### プロジェクト構造の表示形式

- ファイル/フォルダツリーは **Markdown コードブロック** (```` ``` ````) で表示する (`<pre>` タグは非推奨)
- 各行末にインラインコメントが必要な場合は `# 説明` を付記する
- 記載例:
  ```markdown
  ```
  ProjectRoot/
  +-- Config/           # 設定ファイル
  +-- Scripts/          # 自動化スクリプト
  +-- src/              # ソースコード
  +-- README.md
  ```
  ```

### 注意事項の記載パターン

- 注意事項は「`**キーワード**` `---` `補足説明`」の形式で箇条書きにする
- 記載例:
  ```markdown
  - **PowerShell 7 では動作しません** --- 必ず PowerShell 5.1 で実行してください
  - **管理者権限が必要です** --- DfM API へのアクセスに nekoDesktop.exe による認証が必要です
  ```

### 見出しの絵文字使用

- 見出しには Unicode 絵文字を使用して視認性を向上させる
- 絵文字ショートコード (`:rocket:` 等) は**使用禁止** (ADO Wiki 非対応)
- 推奨例: `## 📋 概要`, `## 🏗️ アーキテクチャ`, `## 📁 プロジェクト構造`, `## 🚀 セットアップ`

### アコーディオン (折りたたみセクション) の活用

- 必要性の低いセクション (変更履歴、詳細な設定一覧、内部仕様 等) は **`<details>` タグで折りたたみ** にし、重要な情報にフォーカスできるようにする
- 必須セクション (概要、セットアップ、使い方) は折りたたまない
- **変更履歴セクション**は `<details>` アコーディオンで**必ず折りたたむ**
- CLI コマンド/スクリプトが **5 つ以上** ある場合は、メインの「使い方」セクションに代表的なコマンドのみ記載し、完全な CLI リファレンスは `<details>` アコーディオン内に配置する
- 書式:
  ```html
  <details>
  <summary>セクション見出し (クリックで展開)</summary>

  本文...

  </details>
  ```
- `<summary>` 直後と `</details>` 直前に**空行を 1 行入れる** (Markdown パーサーの互換性のため)

### 「セットアップ」セクションでのリポジトリ取得手順

- セットアップ手順は**リポジトリの取得 (git clone / zip ダウンロード) から**記載を開始する
- 初めてプロジェクトを利用するメンバーが迷わないよう、以下の順序で記述する:
  1. **リポジトリの取得** — `git clone` コマンドまたは ADO からの zip ダウンロード手順
  2. **前提条件** — 必要なランタイム・ツール (PowerShell 5.1, Node.js, npm 等)
  3. **依存関係のインストール** — `npm install` 等 (該当する場合)
  4. **設定ファイルの準備** — `config_sample.json` のコピー・編集手順
  5. **動作確認** — 最小限の実行確認方法
- 記載例:
  ```markdown
  ## セットアップ

  ### 1. リポジトリの取得

  **git clone の場合:**
  ```shell
  git clone https://dev.azure.com/JPUCSupport/{ProjectName}/_git/{RepoName}
  cd {RepoName}
  ```

  > **URL 形式**: `https://dev.azure.com/JPUCSupport/{Project}/_git/{Repo}` を正規形式とする。`JPUCSupport@dev.azure.com` プレフィックス形式は非推奨 (git credential の認証方式に依存するため)。

  **zip ダウンロードの場合:**
  1. [Azure DevOps リポジトリページ](https://dev.azure.com/JPUCSupport/{ProjectName}/_git/{RepoName}) を開く
  2. 右上の「...」 > 「Download as Zip」をクリック
  3. ダウンロードした zip を展開し、フォルダに移動する

  ### 2. 前提条件
  ...
  ```

### 「使い方」セクションでのカスタムエージェント / プロンプト記載

- プロジェクトに **Copilot カスタムエージェント (`.agent.md`)** や **プロンプトファイル (`.prompt.md`)** が存在する場合、「使い方 (Usage)」セクションに以下を記載する:
  - エージェント名とその用途の簡潔な説明
  - 呼び出し方法 (例: `@workspace /agent-name`、`/prompt-name` 等)
  - 主要なパラメータや引数がある場合はその説明
- 記載例:
  ```markdown
  ### カスタムエージェント / プロンプト

  | 名前 | 種別 | 用途 |
  |---|---|---|
  | `@workspace /my-agent` | Agent | データ分析と可視化 |
  | `/generate-report` | Prompt | 月次レポート生成 |
  ```

### 「エージェント・プロンプト構成」セクションの独立化

- Copilot Agent やカスタムプロンプトの規模が大きいプロジェクト (エージェント 3 つ以上、または Instructions が複数ファイルに分かれている場合) は、「使い方」から分離して **独立セクション「エージェント・プロンプト構成」** を設ける
- セクション順序は「テスト方法」の前 (テンプレート表の 7 番目相当) に配置する
- 記載推奨内容:
  - **Copilot Instructions 一覧** — ファイルパスと概要のテーブル
  - **補助 Instructions** — 追加の `.instructions.md` がある場合
  - **カスタムプロンプト** — `.prompt.md` の名前・コマンド・説明テーブル
  - **参照ポリシー** — 社内ポリシー等の参照リンクテーブル (該当する場合)

---

## 2. Copilot Instructions テンプレート構造

`.github/copilot-instructions.md` の推奨構成。

| 順序 | セクション | 必須 | 説明 |
|:---:|---|:---:|---|
| 1 | **プロジェクト概要** | 推奨 | 技術スタック・目的の簡潔な説明 |
| 2 | **コーディング規約** | 必須 | 言語固有のルール (下記 §5 参照) |
| 3 | **セキュリティ / シークレット管理** | 必須 | 下記 §3.6 参照 |
| 4 | **社内コンプライアンスポリシー** | 必須 | 下記 §3.7 参照 |
| 5 | **テスト / 品質保証** | 必須 | 下記 §3.8 参照 |
| 6 | **Lessons Learned** | 必須 | 下記 §3.9 参照 |

---

## 3. 全プロジェクト共通ルール

### 3.1 README 同期 (必須)

> **適用**: 全プロジェクト (8/8)

- コード変更時に関連する README セクションを**必ず同一コミットで更新**する
- 対象: ファイル追加/削除、ディレクトリ構造変更、機能追加/変更、CLI オプション変更、設定ファイルの構造変更
- 「次回更新する」という先送りは禁止
- Copilot Instructions も同様 — コード変更がプロンプト/インストラクションに影響する場合は同一コミットで更新

### 3.2 コミットメッセージ規則

> **適用**: 全プロジェクト (8/8)

- **言語**: 英語
- **形式**: `<type>: <short description>`
- **type 一覧**:

| type | 用途 |
|---|---|
| `feat` | 新機能/新ページ |
| `fix` | バグ修正 |
| `docs` | ドキュメント更新 |
| `refactor` | リファクタリング/リネーム |
| `chore` | 雑務/設定変更/依存関係更新 |
| `test` | テスト追加/修正 |

- 本文が必要な場合は改行後に詳細を記述 (日本語 OK)

### 3.3 言語ポリシー

> **適用**: 全プロジェクト (8/8)

| 対象 | 使用言語 | 例 |
|---|---|---|
| **ファイル名** | 英語 (kebab-case) | `config-sample.json`, `fetch-data.ps1` |
| **コミットメッセージ** | 英語 | `feat: add retry logic` |
| **ブランチ名** | 英語 | `feature/add-retry` |
| **コードコメント** | 英語推奨 (日本語許容) | `// Retry up to 3 times` |
| **ドキュメント本文** (README, Wiki) | 日本語 | 概要、手順、注意事項 |
| **コミット本文** (2 行目以降) | 日本語 OK | 詳細な変更理由 |
| **Copilot Instructions** | 日本語 | ルール・ポリシー記述 |
| **Lessons Learned** | 日本語 | 事象・根本原因・対策・教訓 |
| **ログ出力** | 英語推奨 | `INFO: Processing complete` |
| **UI / ユーザー向けメッセージ** | 日本語 | Teams カード、アラート通知 |

### 3.4 ファイル命名規則

> **適用**: 全プロジェクト (8/8)

- **ファイル名**: 英語のケバブケース (`kebab-case`)
- **禁止**: ファイル名に日本語を使用しない (URL エンコーディング問題回避)
- **設定ファイル**: `config.json` (本番用) / `config_sample.json` (テンプレート)
- **Git 除外**: 本番設定ファイルは `.gitignore` に追加し、`*_sample` ファイルのみコミット

### 3.5 エンコーディング

> **適用**: 全プロジェクト (8/8) — PowerShell プロジェクトでは特に重要

#### 共通ルール
- ソースファイルは **UTF-8** で保存
- ファイル I/O 時は必ずエンコーディングを明示指定する
- PowerShell の `Tee-Object` / `>` リダイレクトに依存した UTF-8 出力は禁止 (cp932 で書き込まれる)

#### PowerShell 5.1 プロジェクト (DfMWatcher, TodaysOff, Permission-Review-Kit)
- `.ps1` / `.json` / `.csv` ファイルは **UTF-8 with BOM** 必須 (PS 5.1 互換性)
- ファイル書き込み: `[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)` 推奨
- `Out-File -Encoding utf8` は BOM 付きになるが PS 5.1 では許容
- JSON 出力: `ConvertTo-Json -Depth 10` の結果は必ず UTF-8 BOM で保存

#### Node.js / TypeScript プロジェクト (LYNXWatcher, MSVacation-Automation-Kit)
- `fs.readFileSync(path, "utf8")` / `fs.writeFileSync(path, data, "utf8")` でエンコーディング明示
- ログファイルは `fs.createWriteStream(path, { encoding: "utf8" })` で内部実装
- BOM (`\uFEFF`) は Excel CSV 互換が必要な場合のみ付与

#### Markdown 編集時の絵文字文字化け防止

- `replace_string_in_file` 等のツールで Markdown ファイル (`.md`) を編集した後は、**必ず U+FFFD (REPLACEMENT CHARACTER) スキャンを実行**すること
- BMP 外の絵文字 (U+1F000 以降、UTF-8 で 4 バイト: 📊🚀🤖🔔 等) は、ツールの JSON シリアライズ過程でサロゲートペア分断が発生し、U+FFFD に破壊されることがある
- **検証コマンド (PowerShell)**:
  ```powershell
  $bytes = [System.IO.File]::ReadAllBytes("<file>")
  for ($i=0; $i -lt $bytes.Length-2; $i++) {
    if ($bytes[$i] -eq 0xEF -and $bytes[$i+1] -eq 0xBF -and $bytes[$i+2] -eq 0xBD) {
      Write-Host "U+FFFD at offset $i"
    }
  }
  ```
- U+FFFD が検出された場合は、該当行を確認し正しい絵文字に修正してから完了報告する
- **禁止**: U+FFFD スキャンをせずに「修正完了」と報告すること

### 3.6 セキュリティ / シークレット管理

> **適用**: 全プロジェクト (8/8)

- **絶対禁止**: シークレット (パスワード、API キー、トークン、接続文字列) をソースコードにハードコードしてはならない
- **設定ファイル戦略**:
  - 本番設定ファイル (`config.json`, `.env` 等) は `.gitignore` に追加
  - テンプレートファイル (`config_sample.json`, `.env.example`) をコミットし、プレースホルダー値を記載
- **Key Vault**: Azure Key Vault の使用を推奨 (M365UpdateTracker で実績あり)
- **PAT (Personal Access Token)**: 有効期限管理を行い、自動ローテーションを推奨

### 3.7 社内コンプライアンスポリシー (CSS Data Policy)

> **適用**: 全プロジェクト (8/8) — 顧客データを直接扱わないプロジェクトでも、社内ツールとしてポリシー意識を統一する
>
> **参照ポリシー**:
> - REDACTED: [Guidance for Support Engineers in using Copilot Chat/Agent](https://REDACTED/en-us/topic/2551d022-d53d-4abc-c733-4aa959b7fb87)
> - REDACTED: [Handling support data (commercial customers)](https://REDACTED/en-us/topic/e7f0b758-57f8-41e9-1b42-fbea2fab36cf)

#### 絶対遵守事項
1. **PII 禁止**: お客様の PII (氏名、メールアドレス、電話番号、テナント ID 等) をプロンプトに入力してはならない
2. **パスワード禁止**: お客様のパスワードの送受信は絶対禁止
3. **MCP 制限**: 承認済みの MCP サーバーのみ使用可。オープンソース MCP サーバーでの顧客データ処理は禁止
4. **データ転送**: サポートデータの転送は **DTMv2 のみ**。メール添付、OneDrive、Teams 共有は禁止
5. **データ削除**: トラブルシューティング完了後は Copilot ログおよびサポートデータのローカルコピーを速やかに削除
6. **使用アカウント**: @microsoft.com アカウントまたは紐づいた GitHub Enterprise アカウントのみ

### 3.8 テスト / 品質保証

> **適用**: 全プロジェクト (8/8)

- コード修正後は**必ず Lint (構文チェック) と関連テストを実行**し、PASS を確認してから完了報告する
- 既存テストが失敗した場合は**実装バグを先に疑う**。テストコード修正が必要な場合はユーザーに確認する
- テスト用設定値 (`_sample` ファイル、テストモードフラグ) を本番設定に混入させない
- テスト後のクリーンアップ (一時ファイル、テストブランチの削除) を必ず実施

### 3.9 自己改善プロトコル (Lessons Learned)

> **適用**: 全プロジェクト (8/8)

#### Lessons Learned 記録フォーマット
```markdown
### LL-XXX: {タイトル}
- **事象**: {何が起きたか}
- **根本原因**: {なぜ起きたか}
- **対策**: {どう修正/予防したか}
- **教訓**: {今後の汎用的な学び}
```

#### ルール
- 障害・未検出・誤検出・ワークフロー上の問題が発生した場合、**コード修正 + プロンプト/instruction 更新 + コミットの 3 点セット**を同一セッション内で完了する
- コード変更時に関連するプロンプトの処理フロー・ステップ説明・オプション表・検証項目を**同一コミットで更新**
- 「次回修正します」と先送り / ユーザーに指摘されてから修正 / 説明だけでコード未修正 / コード修正だけでプロンプト未更新 は禁止

### 3.10 自動実行の安全制約

> **適用**: 全プロジェクト (8/8)

#### 破壊的・不可逆操作の禁止
- 以下の操作は**ユーザーの明示的な承認なしに実行してはならない**:
  - `git push --force` / `git reset --hard` / 公開済みコミットの amend
  - ファイル/ブランチの削除 (`rm -rf`, `git branch -D`)
  - データベースへの書き込み・削除操作
  - 外部サービスへの投稿 (PR コメント、Teams メッセージ送信、メール送信)
  - 本番環境への変更適用 (Logic Apps デプロイ、Azure リソース変更)

#### 安全チェック回避の禁止
- `--no-verify` / `--force` / `-f` 等の安全チェックバイパスオプションは使用禁止
- CI/CD パイプラインの手動スキップは禁止

#### 自動実行の原則
- **作業ブランチへの `git push`**: 確認不要で自動実行 OK
- **PR の作成 (`gh pr create`)**: 確認不要で自動実行 OK
- **PR のマージ (`gh pr merge`)**: ユーザー確認必須
- **本番データの変更**: ユーザー確認必須
- **ドライラン/プレビュー**: 確認不要で自動実行 OK

### 3.11 バージョン管理 (SemVer)

> **適用**: 全プロジェクト (8/8) — 推奨

- **形式**: [Semantic Versioning 2.0.0](https://semver.org/) に準拠 (`MAJOR.MINOR.PATCH`)

| バージョン | インクリメント条件 | 例 |
|---|---|---|
| **MAJOR** | 破壊的変更 (後方互換性なし) | 設定ファイルのスキーマ変更、API 変更 |
| **MINOR** | 機能追加 (後方互換性あり) | 新コマンド追加、新オプション追加 |
| **PATCH** | バグ修正・内部改善 | ドキュメント更新、リファクタリング |

- **記録場所**: README の「変更履歴」セクションにバージョン変更履歴を記載
- **タグ付け**: リリース時に `git tag v{MAJOR}.{MINOR}.{PATCH}` でタグを付与することを推奨

### 3.12 クロスリファレンス (ハイパーリンク)

> **適用**: 全プロジェクト (8/8) — 必須

- README 本文中でファイルやディレクトリに言及する場合は、**相対パスのハイパーリンク** を付与する
  - 良い例: `[.github/copilot-instructions.md](.github/copilot-instructions.md)`
  - 悪い例: `` `.github/copilot-instructions.md` `` (バッククォートのみ)
- `config_sample.json`、`layout_sample.json` 等のテンプレートファイルも同様にリンクする
- **関連ドキュメントセクション**: 変更履歴の直前に `## 関連ドキュメント` セクションを設け、関連ファイルをテーブル形式で一覧化する
- **例外**: glob パターン (`*.json`) やディレクトリの概念的な言及はリンク不要

### 3.13 手順のシンプル化 (Copilot プロンプト優先)

> **適用**: Copilot カスタムプロンプトが存在するプロジェクト

- **使い方セクション** では、Copilot カスタムプロンプトによる実行方法を**最初に記載**する（推奨マーク付き）
- CLI コマンドによる手動実行手順は `<details>` **アコーディオン内** に配置し、上級者向けとして折りたたむ
- プロンプトの説明には実行例 (`/prompt-name` + 自然言語指示) を含め、ユーザーがすぐに使えるようにする
- プロンプトファイルへのハイパーリンクも併記する

### 3.14 レポジトリ管理 (1ES ポリシー)

> **適用**: 全プロジェクト (8/8)

- **1ES Inventory-As-Code** ポリシーに準拠するため、リポジトリのルートディレクトリに必ず `es-metadata.yml` を作成すること
- **所有者 (Owners)**: `es-metadata.yml` 内の `accountableOwners.directOwners` には**必ず 2 名以上**のオーナー (有効な @microsoft.com アドレス) を指定する
- ⚠️**警告**: このファイルが存在しない、または所有者が 1 名以下の状態が続くと、コンプライアンス違反として**リポジトリが自動的に無効化 (Disabled) される**ため絶対遵守すること

---

## 4. Git 運用ルール

> **適用**: 全プロジェクト (8/8)

### ブランチ保護
- `main` / `master` / `develop` ブランチに直接コミットしない。必ず作業ブランチを作成する
- `main` / `master` への直接 push は禁止。PR を経由する
- `gh pr merge` 等のマージ操作はユーザーの明示的な承認後にのみ実行

### .gitignore 共通パターン
```
# 本番設定ファイル
config.json
.env
*.local.json

# ログ・一時ファイル
*.log
/logs/
/tmp/

# IDE / OS
.vscode/
.idea/
Thumbs.db
.DS_Store
```

---

## 5. 技術スタック別ルール

### 5.1 PowerShell 5.1 (DfMWatcher, TodaysOff, Permission-Review-Kit)

| カテゴリ | ルール |
|---|---|
| **関数命名** | `Verb-Noun` 形式 (例: `Get-QueueStatus`, `Send-TeamsCard`) |
| **JSON 構築** | `ConvertTo-Json -Depth 10` を使用。文字列連結での JSON 構築は禁止 |
| **エラーハンドリング** | 外部リソースアクセス (API, ファイル I/O) は `try/catch` で囲む |
| **ネスト制限** | 条件分岐/ループのネストは最大 3 段。超える場合は関数に分割 |
| **配列操作** | 大規模配列は `[System.Collections.Generic.List[T]]` を使用 (`+=` 禁止) |
| **文字列結合** | 多量の文字列結合は `[System.Text.StringBuilder]` を使用 |
| **エンコーディング** | UTF-8 with BOM 必須 (§3.5 参照) |
| **PS 5.1 制約** | `?.` (null 条件演算子), `??` (null 合体演算子), `foreach -Parallel` は使用不可 |

### 5.2 Node.js / TypeScript (LYNXWatcher, MSVacation-Automation-Kit)

| カテゴリ | ルール |
|---|---|
| **エンコーディング** | ファイル I/O は `"utf8"` 明示指定 (§3.5 参照) |
| **ログ** | 内部ファイルロギング実装。シェルリダイレクトに依存しない |
| **エラーハンドリング** | async/await + try/catch。未処理 Promise 拒否を避ける |
| **依存関係** | `package-lock.json` をコミットに含める |

### 5.3 Logic Apps / Azure (M365UpdateTracker, MSVacation-Automation-Kit)

| カテゴリ | ルール |
|---|---|
| **認証** | Managed Identity + Key Vault (PAT 格納) を推奨 |
| **ワークフロー改修** | `workflow-definition.json` 変更後はデプロイ手順を README に記載 |
| **Teams コネクタ制約** | Graph API の全パスが使える訳ではない。`$expand` パラメータを活用 |
| **コスト** | Logic Apps のアクション数/実行回数のコスト見積もりを記載 |

### 5.4 Copilot Agent (UCKBAgent-Bullpen)

| カテゴリ | ルール |
|---|---|
| **MCP ツールロード** | `tool_search_tool_regex` で遅延ロード。`limit` パラメータは十分な値を指定 |
| **認証エラー** | 「MCP 未接続」等の曖昧な報告は禁止。エラー内容を正確に分類して報告 |
| **出力フォーマット** | 関連度 (★5段階)、原文 + 和訳、URL リンク必須 |
| **発見事項の記録** | 技術的発見はファイルに記録 (チャットメモリでは不十分) |

---

## 6. 分析元データ一覧

| プロジェクト | README | Instructions | 主な技術スタック |
|---|:---:|:---:|---|
| DfMWatcher | [README](README-DfMWatcher.md) | [Instructions](INSTRUCTIONS-DfMWatcher.md) | PowerShell 5.1 / .NET ClickOnce |
| TodaysOff | [README](README-TodaysOff.md) | [Instructions](INSTRUCTIONS-TodaysOff.md) | PowerShell 5.1 / Excel COM |
| M365UpdateTracker | [README](README-M365UpdateTracker.md) | [Instructions](INSTRUCTIONS-M365UpdateTracker.md) | Logic Apps / PowerShell |
| LYNXWatcher | [README](README-LYNXWatcher.md) | [Instructions](INSTRUCTIONS-LYNXWatcher.md) | JavaScript (Browser Extension) |
| Permission-Review-Kit | [README](README-Permission-Review-Kit.md) | [Instructions](INSTRUCTIONS-Permission-Review-Kit.md), [CSS Policy](INSTRUCTIONS-Permission-Review-Kit-css-data-policy.md) | PowerShell / Power Automate |
| MSVacation-Automation-Kit | [README](README-MSVacation-Automation-Kit.md) | [Instructions](INSTRUCTIONS-MSVacation-Automation-Kit.md) | TypeScript / Logic Apps / Bicep |
| UCKBAgent-Bullpen | [README](README-UCKBAgent-Bullpen.md) | [Instructions](INSTRUCTIONS-UCKBAgent-Bullpen.md), [UCKB Common](INSTRUCTIONS-UCKBAgent-Bullpen-uckb-common.md) | Copilot Agent / Python / KQL |
| UCToolkit | (本リポジトリ) | [copilot-instructions.md](../.github/copilot-instructions.md) | Markdown (ADO Wiki) |
