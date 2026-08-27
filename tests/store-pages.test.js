const { CHROME_SLOTS, CONFIRM_DELETE, DELETION_DIALOG, buildRemovePattern } = require('../scripts/publish-store-pages');

// The exact aria-labels the Chrome Web Store console rendered on 2026-08-27,
// read off the Network+ listing. Testing against the real label set is what
// makes these guards worth anything: the defect they cover shipped because the
// patterns were only ever eyeballed.
const OBSERVED_CHROME_REMOVE_LABELS = Object.freeze([
  '画像を削除 ショップ アイコン',
  '画像を削除 スクリーンショット 1',
  '画像を削除 スクリーンショット 2',
  '画像を削除 スクリーンショット 3',
  '画像を削除 スクリーンショット 4',
  '画像を削除 プロモーション タイル（小）',
  '画像を削除 マーキー プロモーション タイル',
]);

const matcher = (label) => new RegExp(buildRemovePattern(label), 'i');
const matched = (label, candidates) => candidates.filter((text) => matcher(label).test(text));

describe('chrome slot remove patterns', () => {
  // The defect: `画像を削除.*${label}` spliced an un-parenthesized alternation, so the
  // top-level `|` split the whole pattern and the bare word `Screenshot` became
  // an alternative of its own. Every control mentioning a screenshot matched,
  // including the one that adds one, and nothing was ever removed.
  test('does not degrade to a bare label when the slot name is an alternation', () => {
    const pattern = matcher(CHROME_SLOTS.screenshot);
    expect(pattern.test('Screenshot 1 of 4')).toBe(false);
    expect(pattern.test('Add screenshot')).toBe(false);
    expect(pattern.test('スクリーンショットを追加')).toBe(false);
  });

  test('matches the remove control for its own slot in either console language', () => {
    expect(matcher(CHROME_SLOTS.screenshot).test('画像を削除 スクリーンショット 1')).toBe(true);
    expect(matcher(CHROME_SLOTS.screenshot).test('Remove image Screenshot 1')).toBe(true);
    expect(matcher(CHROME_SLOTS.promoSmall).test('画像を削除 プロモーション タイル（小）')).toBe(true);
    expect(matcher(CHROME_SLOTS.marquee).test('画像を削除 マーキー プロモーション タイル')).toBe(true);
  });

  // The store icon is the product's mark, not part of a listing refresh, and the
  // script must never be able to reach it.
  test('never matches the store icon', () => {
    for (const label of Object.values(CHROME_SLOTS)) {
      expect(matched(label, ['画像を削除 ショップ アイコン'])).toEqual([]);
    }
  });

  test('each slot claims only its own controls out of the observed label set', () => {
    expect(matched(CHROME_SLOTS.screenshot, OBSERVED_CHROME_REMOVE_LABELS)).toEqual([
      '画像を削除 スクリーンショット 1',
      '画像を削除 スクリーンショット 2',
      '画像を削除 スクリーンショット 3',
      '画像を削除 スクリーンショット 4',
    ]);
    expect(matched(CHROME_SLOTS.promoSmall, OBSERVED_CHROME_REMOVE_LABELS)).toEqual([
      '画像を削除 プロモーション タイル（小）',
    ]);
    expect(matched(CHROME_SLOTS.marquee, OBSERVED_CHROME_REMOVE_LABELS)).toEqual([
      '画像を削除 マーキー プロモーション タイル',
    ]);
  });
});

describe('deletion confirmation patterns', () => {
  // Removing an image raises "この操作は元に戻せません" with a キャンセル/削除 pair. The
  // console keeps the image until 削除 is pressed, so a run that never answers
  // deletes nothing while reporting that it cleared every slot.
  test('recognizes the confirmation the console actually raises', () => {
    const observed = '画像を削除 この画像を削除してもよろしいですか？この操作は元に戻せません。 キャンセル 削除';
    expect(DELETION_DIALOG.test(observed)).toBe(true);
    expect(DELETION_DIALOG.test('This action cannot be undone.')).toBe(true);
  });

  test('does not mistake an ordinary listing pane for the confirmation', () => {
    expect(DELETION_DIALOG.test('スクリーンショット 画像を削除 プロモーション タイル')).toBe(false);
  });

  // The confirm button is the one labelled exactly 削除. Matching loosely would
  // find the remove control that opened the dialog in the first place.
  test('accepts only an exact confirm label', () => {
    expect(CONFIRM_DELETE.test('削除')).toBe(true);
    expect(CONFIRM_DELETE.test('Delete')).toBe(true);
    expect(CONFIRM_DELETE.test('キャンセル')).toBe(false);
    expect(CONFIRM_DELETE.test('画像を削除 スクリーンショット 1')).toBe(false);
    expect(CONFIRM_DELETE.test('Delete screenshot')).toBe(false);
  });
});
