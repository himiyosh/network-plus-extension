# Hallmark upstream

このディレクトリは Hallmark の固定版を vendoring しています。

| 項目 | 値 |
|---|---|
| Upstream | `https://github.com/nutlope/hallmark` |
| Version | `1.1.0` |
| Commit | `aeb42fb354ff4efa36ab475773a082315a3af2ce` |
| Canonical source | `skills/hallmark/SKILL.md` + `skills/hallmark/references/**` |
| Canonical parity | 105 files byte-for-byte + 1 file EOF-normalized |
| Invocation identifier | `/hallmark` |
| License | MIT, Copyright (c) 2026 Hallmark contributors |

`SKILL.md` と `references/**` は本文を変更せず配置し、`references/component-cookbook.md` の末尾空行のみ正規化しています。`LICENSE` は upstream ルートの同名ファイルと byte-for-byte で一致させます。Network+ 固有の統合ルールは canonical ファイルを変更せず、`.github/agents/NetworkPlusAgent.agent.md` と `.github/agents/ui-review.agent.md` に記述します。

canonical には upstream の `site/**` と `docs/**` を指す 6 個の相対参照があります。この統合では demo site と unrelated docs を意図的に vendoring しないため、それらはローカルでは解決しません。`references/**` 内を指す参照はすべて解決されます。

更新時は固定 commit を明示して upstream を取得し、canonical 106 ファイルと `LICENSE` を置換した後、ファイル数、相対パス、105 ファイルの byte parity、`component-cookbook.md` の EOF 正規化後 parity、参照リンク、frontmatter、ライセンス本文を検証してください。
