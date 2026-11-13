'use strict';

const np = require('../panel.js');

afterEach(() => np.applyLanguage('en'));

test.each([
  ['Only HAR and SAZ files are supported.', 'HAR ファイルと SAZ ファイルのみ対応しています。'],
  ['Import file size is unavailable.', 'インポートするファイルのサイズを取得できません。'],
  ['SAZ file exceeds the 32 MiB source limit.', 'SAZ ファイルが 32 MiB のサイズ上限を超えています。'],
  ['HAR must contain a log.entries array.', 'HAR には log.entries 配列が必要です。'],
  ['HAR entries must contain request and response objects.', 'HAR の各エントリーには request オブジェクトと response オブジェクトが必要です。'],
  ['HAR is not valid JSON.', 'HAR の JSON 形式が正しくありません。'],
  ['A HAR entry is too large to parse.', 'HAR のエントリーが大きすぎるため解析できません。'],
  ['HAR contains duplicate log properties.', 'HAR に重複した log プロパティがあります。'],
  ['HAR contains duplicate log.entries properties.', 'HAR に重複した log.entries プロパティがあります。'],
  ['Another import is already in progress.', '別のインポートが進行中です。'],
  ['The selected file could not be imported.', '選択したファイルをインポートできませんでした。'],
  ['SAZ archive exceeds the 20,000-entry limit.', 'SAZ アーカイブがエントリー数の上限 20,000 件を超えています。'],
  ['SAZ entry size metadata is invalid.', 'SAZ エントリーのサイズ情報が正しくありません。'],
  ['SAZ entry exceeds the 4 MiB uncompressed limit.', 'SAZ エントリーが展開後のサイズ上限 4 MiB を超えています。'],
  ['SAZ archive exceeds the 64 MiB total uncompressed limit.', 'SAZ アーカイブが展開後の合計サイズ上限 64 MiB を超えています。'],
  ['SAZ decompression support is unavailable.', 'SAZ の展開機能を利用できません。'],
  ['SAZ source data is invalid.', 'SAZ の元データが正しくありません。'],
  ['SAZ extraction failed.', 'SAZ の展開に失敗しました。'],
  ['SAZ archive is malformed.', 'SAZ アーカイブの形式が正しくありません。'],
  ['SAZ payload uses an unsupported compression method.', 'SAZ のデータに未対応の圧縮方式が使われています。'],
  ['SAZ HTTP payload is invalid.', 'SAZ の HTTP データが正しくありません。'],
  ['SAZ HTTP start line is missing.', 'SAZ の HTTP 開始行がありません。'],
  ['SAZ request start line is invalid.', 'SAZ のリクエスト開始行が正しくありません。'],
  ['SAZ response start line is invalid.', 'SAZ のレスポンス開始行が正しくありません。'],
  ['SAZ contains no complete HTTP sessions.', 'SAZ に完全な HTTP セッションがありません。'],
  ['The import transfer was superseded by a newer one.', '新しいインポート転送が始まったため、前の転送を終了しました。'],
  ['Reload both Network+ views to stream this HAR.', 'この HAR をストリーム転送するには、両方の Network+ 画面を再読み込みしてください。'],
  ['The import transfer was cancelled.', 'インポート転送をキャンセルしました。'],
  ['The import transfer sent a chunk out of order.', 'インポート転送のデータが順序どおりに届きませんでした。'],
  ['The transferred file could not be decoded.', '転送されたファイルをデコードできませんでした。'],
  ['The transfer exceeded its declared size and was refused.', '転送量が申告されたサイズを超えたため、転送を拒否しました。'],
  ['The import transfer was interrupted.', 'インポート転送が中断されました。'],
  ['The transfer ended before its declared size was received.', '申告されたサイズのデータを受信する前に転送が終了しました。'],
  ['The import transfer ended out of order.', 'インポート転送が正しい順序で終了しませんでした。'],
  ['The transferred file could not be imported.', '転送されたファイルをインポートできませんでした。'],
  ['This DevTools session does not accept mirror imports.', 'この DevTools セッションはミラー画面からのインポートを受け付けていません。'],
  ['Import is not available in this DevTools session.', 'この DevTools セッションではインポートを利用できません。'],
  ['The DevTools session rejected the command.', 'DevTools セッションが操作を拒否しました。'],
  ['The DevTools session did not answer in time; the command may still have applied.', 'DevTools セッションからの応答が時間内に届きませんでした。操作は適用済みの可能性があります。'],
  ['The DevTools session disconnected before the response content arrived.', 'レスポンス内容が届く前に DevTools セッションの接続が切れました。'],
  ['The DevTools session is disconnected, so response content cannot be retrieved.', 'DevTools セッションの接続が切れているため、レスポンス内容を取得できません。'],
])('translates the displayed import reason only: %s', (canonical, japanese) => {
  const error = new Error(canonical);
  np.applyLanguage('en');
  expect(np.formatImportFailure(error.message)).toBe('Import failed: ' + canonical);
  np.applyLanguage('ja');
  expect(np.formatImportFailure(error.message)).toBe('インポートに失敗しました：' + japanese);
  expect(error.message).toBe(canonical);
});

test('unknown reasons and literal replacement characters pass through without guessing', () => {
  np.applyLanguage('ja');
  const reason = 'custom $& $` $\' $$ $<name> HAR is not valid JSON. captured data';
  expect(np.localizeImportReason(reason)).toBe(reason);
  expect(np.formatImportFailure(reason)).toBe('インポートに失敗しました：' + reason);
});

test('source validators and failed mirror transfers retain canonical English errors in Japanese', () => {
  np.applyLanguage('ja');
  const error = 'Only HAR and SAZ files are supported.';
  expect(np.validateImportSource('capture.txt', 10).error).toBe(error);
  const messages = [];
  const host = np.createMirrorHostSession({
    postMessage: (message) => messages.push(message),
    getRows: () => [],
    isPaused: () => false,
    receiveImportFile: jest.fn(),
  });
  host.handleMessage({ type: 'import-begin', commandId: 1, fileName: 'capture.txt', size: 10 });
  expect(messages).toContainEqual(expect.objectContaining({ type: 'command-result', commandId: 1, error }));
  expect(np.formatImportFailure(error)).toBe('インポートに失敗しました：HAR ファイルと SAZ ファイルのみ対応しています。');
});

test.each([
  ['Response body omitted by the 1 MiB retention limit', '1 MiB の保持上限によりレスポンスボディを省略しました'],
  ['2 cached response bodies evicted by the 32 MiB cache limit', '32 MiB のキャッシュ上限によりレスポンスボディを 2 件削除しました'],
  ['3 imported requests skipped by the retention limit', '保持上限によりインポートしたリクエストを 3 件スキップしました'],
  ['4 response bodies omitted, 2 evicted during import', 'インポート中にレスポンスボディを 4 件省略し、2 件をキャッシュから削除しました'],
])('localizes import retention action and totals without changing counters: %s', (action, japanese) => {
  const retention = Object.freeze({ evictedRequests: 3, omittedBodies: 4, evictedBodies: 2, truncatedBodies: 1 });
  const english = action + '. Totals: 3 requests evicted, 4 bodies omitted, 2 cached bodies evicted, and 1 previews truncated.';
  np.applyLanguage('en');
  expect(np.formatRetentionSummary(action, retention, 'import')).toBe(english);
  np.applyLanguage('ja');
  expect(np.formatRetentionSummary(action, retention, 'import')).toBe(
    japanese + '。合計: リクエスト削除 3 件、ボディ省略 4 件、キャッシュ済みボディ削除 2 件、プレビュー省略 1 件。',
  );
  // Shared admission helpers can also serve live/sample rows; this unit does
  // not expand localization to those caller paths or settings notices.
  for (const source of ['live', 'sample', undefined]) {
    expect(np.formatRetentionSummary(action, retention, source)).toBe(english);
  }
  expect(retention).toEqual({ evictedRequests: 3, omittedBodies: 4, evictedBodies: 2, truncatedBodies: 1 });
});

test('retention action matching leaves unknown and captured text unchanged', () => {
  np.applyLanguage('ja');
  const unknown = 'prefix 2 cached response bodies evicted by the 32 MiB cache limit';
  expect(np.localizeImportRetentionAction(unknown)).toBe(unknown);
});
