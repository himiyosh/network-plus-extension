const {
  CHROME_MAX_SCREENSHOTS,
  CHROME_SLOTS,
  CONFIRM_DELETE,
  DELETION_DIALOG,
  EDGE_MAX_SCREENSHOTS,
  browserSessionPlan,
  buildRemovePattern,
  chromeListingSettled,
  chromeTileLanded,
  chromeTilesToPut,
  chromeUploadLanded,
  compareListing,
  describeChanges,
  edgePreflightProblems,
  edgeScreenshotFiles,
  edgeUploadLanded,
  formatChromeObservation,
  multisetDifference,
  nextChromeRemoval,
  planChromeListing,
  pollUntil,
  refuseToStart,
  resizeListingImageUrl,
  resolveAssets,
} = require('../scripts/publish-store-pages');

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

// Stand-ins for resolveAssets(): the names are the real inventory's, the digests
// are placeholders, because the decisions only ever compare digests for equality.
const screenshotFiles = [
  'screenshot-1-request-detail-1280x800.png',
  'screenshot-2-timing-guidance-1280x800.png',
  'screenshot-3-sample-guide-1280x800.png',
  'screenshot-4-sanitized-export-1280x800.png',
];
const desired = Object.freeze({
  screenshots: screenshotFiles.map((file, index) => ({ file, sha256: `new-${index + 1}` })),
  promoSmall: { file: 'chrome-small-promo-440x280.png', sha256: 'promo' },
  marquee: { file: 'chrome-marquee-1400x560.png', sha256: 'marquee' },
});
const shotLabel = (number) => `画像を削除 スクリーンショット ${number}`;
const shots = (...digests) => digests.map((sha256, index) => ({ label: shotLabel(index + 1), sha256 }));
const chromeListing = (overrides = {}) => ({
  screenshots: shots('new-1', 'new-2', 'new-3', 'new-4'),
  screenshotInput: true,
  promoSmall: { present: true, label: '画像を削除 プロモーション タイル（小）', sha256: 'promo', input: false },
  marquee: { present: true, label: '画像を削除 マーキー プロモーション タイル', sha256: 'marquee', input: false },
  saveControl: true,
  ...overrides,
});

// The plan compares digests and asks Chrome for each image at its own size, so
// every asset the run touches has to carry both.
test('resolves every listing asset with its digest and dimensions', () => {
  const assets = resolveAssets();
  expect(assets.screenshots.map((asset) => asset.file)).toEqual(screenshotFiles);
  for (const asset of [...assets.screenshots, assets.promoSmall, assets.marquee]) {
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isInteger(asset.width) && Number.isInteger(asset.height)).toBe(true);
  }
  expect(new Set(assets.screenshots.map((asset) => asset.sha256)).size).toBe(screenshotFiles.length);
});

describe('chrome listing plan', () => {
  // The v1.14.0 run: new screenshots, unchanged tiles. The old run cleared every
  // slot in turn, and the small promo tile — required, so it answers the
  // confirmation and stays — stopped it after the screenshots were already gone.
  test('replaces changed screenshots and never schedules a required tile for removal', () => {
    const plan = planChromeListing(chromeListing({ screenshots: shots('old-1', 'old-2', 'old-3', 'old-4') }), desired);
    expect(plan.problems).toEqual([]);
    expect(plan.remove).toEqual([shotLabel(1), shotLabel(2), shotLabel(3), shotLabel(4)]);
    expect(plan.upload.map((asset) => asset.file)).toEqual(screenshotFiles);
    expect(plan.tiles.map((tile) => [tile.slot, tile.action])).toEqual([
      ['promoSmall', 'keep'],
      ['marquee', 'keep'],
    ]);
    expect(chromeTilesToPut(plan)).toEqual([]);
  });

  test('replaces a changed tile through its input instead of removing it', () => {
    const plan = planChromeListing(
      chromeListing({
        promoSmall: {
          present: true,
          label: '画像を削除 プロモーション タイル（小）',
          sha256: 'old-promo',
          input: true,
        },
      }),
      desired,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(chromeTilesToPut(plan).map((tile) => [tile.slot, tile.action])).toEqual([['promoSmall', 'replace']]);
  });

  // A tile that differs and cannot be replaced has to stop the run before the
  // first removal, not after the screenshots are gone.
  test('refuses to start when a changed tile has no input, even though the screenshots could go ahead', () => {
    const plan = planChromeListing(
      chromeListing({
        screenshots: shots('old-1', 'old-2', 'old-3', 'old-4'),
        promoSmall: {
          present: true,
          label: '画像を削除 プロモーション タイル（小）',
          sha256: 'old-promo',
          input: false,
        },
      }),
      desired,
    );
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]).toMatch(/small promo tile differs from chrome-small-promo-440x280\.png/);
    expect(refuseToStart(plan.problems)).toMatch(/Nothing was removed, replaced or uploaded/);
    for (const label of plan.remove) expect(label).not.toMatch(/プロモーション|マーキー/);
  });

  test('leaves a listing that already matches alone', () => {
    const plan = planChromeListing(chromeListing(), desired);
    expect(plan).toMatchObject({ keep: 4, remove: [], upload: [], problems: [] });
    expect(chromeListingSettled(plan)).toBe(true);
  });

  // The state the v1.14.0 run left behind: a draft with no screenshots at all.
  test('refills a draft that lost its screenshots without removing anything', () => {
    const plan = planChromeListing(chromeListing({ screenshots: [] }), desired);
    expect(plan.remove).toEqual([]);
    expect(plan.upload.map((asset) => asset.file)).toEqual(screenshotFiles);
    expect(chromeListingSettled(plan)).toBe(false);
  });

  test('keeps the matching leading screenshots and replaces only what follows', () => {
    const plan = planChromeListing(chromeListing({ screenshots: shots('new-1', 'new-2', 'old-3', 'old-4') }), desired);
    expect(plan.keep).toBe(2);
    expect(plan.remove).toEqual([shotLabel(3), shotLabel(4)]);
    expect(plan.upload.map((asset) => asset.file)).toEqual(screenshotFiles.slice(2));
  });

  // A matching image further down does not survive an earlier mismatch: order
  // is part of the listing, and uploads can only append.
  test('does not keep a matching screenshot that sits behind a mismatch or an unreadable one', () => {
    expect(planChromeListing(chromeListing({ screenshots: shots('old-1', 'new-2') }), desired).keep).toBe(0);
    expect(planChromeListing(chromeListing({ screenshots: shots('new-1', null, 'new-3') }), desired).keep).toBe(1);
  });

  test('never reads an unreadable tile as matching', () => {
    const plan = planChromeListing(
      chromeListing({
        marquee: {
          present: true,
          label: '画像を削除 マーキー プロモーション タイル',
          sha256: null,
          reason: 'HTTP 403',
          input: false,
        },
      }),
      desired,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.tiles[1]).toMatchObject({ slot: 'marquee', action: 'unverified', reason: 'HTTP 403' });
    expect(chromeListingSettled(plan)).toBe(false);
  });

  test('refuses what could only fail partway', () => {
    const tooMany = {
      ...desired,
      screenshots: Array.from({ length: CHROME_MAX_SCREENSHOTS + 1 }, (_, i) => ({
        file: `s${i}.png`,
        sha256: `s${i}`,
      })),
    };
    expect(planChromeListing(chromeListing(), tooMany).problems.join('\n')).toMatch(/at most 5/);
    expect(
      planChromeListing(chromeListing({ screenshots: [], screenshotInput: false }), desired).problems.join('\n'),
    ).toMatch(/no screenshot upload input/);
    expect(planChromeListing(chromeListing({ saveControl: false }), desired).problems.join('\n')).toMatch(/Save draft/);
    expect(
      planChromeListing(
        chromeListing({ marquee: { present: false, sha256: null, input: false } }),
        desired,
      ).problems.join('\n'),
    ).toMatch(/marquee promo tile is empty/);
  });

  // A full listing shows no upload input until one image is removed, so its
  // absence there is not evidence of anything.
  test('does not demand an upload input from a listing that is full', () => {
    const full = shots('old-1', 'old-2', 'old-3', 'old-4', 'old-5');
    expect(planChromeListing(chromeListing({ screenshots: full, screenshotInput: false }), desired).problems).toEqual(
      [],
    );
  });
});

describe('chrome removal and upload signals', () => {
  // Labels do not renumber after a removal, so the next target is read off the
  // page each round and is always the last one.
  test('removes from the end and stops at the kept prefix', () => {
    const left = [shotLabel(5), shotLabel(6), shotLabel(7), shotLabel(8)];
    expect(nextChromeRemoval(left, 0)).toBe(shotLabel(8));
    expect(nextChromeRemoval(left, 3)).toBe(shotLabel(8));
    expect(nextChromeRemoval(left, 4)).toBeNull();
    expect(nextChromeRemoval([], 0)).toBeNull();
  });

  test('counts an upload only when the remove controls outnumber the ones before it', () => {
    expect(chromeUploadLanded([], [])).toBe(false);
    expect(chromeUploadLanded([shotLabel(5)], [shotLabel(5)])).toBe(false);
    expect(chromeUploadLanded([shotLabel(5)], [shotLabel(5), shotLabel(6)])).toBe(true);
  });

  test('counts a tile only when the slot shows an image it did not show before', () => {
    const tile = (src) => [{ label: '画像を削除 プロモーション タイル（小）', src }];
    expect(chromeTileLanded([], [])).toBe(false);
    expect(chromeTileLanded([], tile(null))).toBe(true);
    expect(chromeTileLanded(tile('https://a/1'), tile('https://a/1'))).toBe(false);
    expect(chromeTileLanded(tile('https://a/1'), tile(null))).toBe(false);
    expect(chromeTileLanded(tile('https://a/1'), tile('https://a/2'))).toBe(true);
  });

  test('asks for the stored original at the asset size', () => {
    expect(resizeListingImageUrl('https://lh3.googleusercontent.com/AbC-d_e=s640-w640-h400', 1280, 800)).toBe(
      'https://lh3.googleusercontent.com/AbC-d_e=w1280-h800',
    );
    expect(resizeListingImageUrl('https://lh3.googleusercontent.com/AbC-d_e', 440, 280)).toBe(
      'https://lh3.googleusercontent.com/AbC-d_e=w440-h280',
    );
    expect(resizeListingImageUrl('https://example.test/a=b/c', 1400, 560)).toBe(
      'https://example.test/a=b/c=w1400-h560',
    );
  });

  test('prints the observed listing, including what is missing from it', () => {
    const lines = formatChromeObservation(chromeListing({ screenshots: shots('new-1', 'old-2') }), desired);
    expect(lines).toEqual([
      'screenshots: 2 on the listing',
      `  1. ${shotLabel(1)} — matches ${screenshotFiles[0]}`,
      `  2. ${shotLabel(2)} — differs from ${screenshotFiles[1]}`,
      `  (missing) ${screenshotFiles[2]}`,
      `  (missing) ${screenshotFiles[3]}`,
      'small promo tile: matches chrome-small-promo-440x280.png',
      'marquee promo tile: matches chrome-marquee-1400x560.png',
    ]);
  });
});

describe('change report after a failure', () => {
  // The v1.14.0 message said "Nothing was uploaded, so the listing is unchanged"
  // over a draft whose four screenshots had just been deleted.
  test('names every removal and never calls a partly changed draft unchanged', () => {
    const report = describeChanges({
      removed: [shotLabel(1), shotLabel(2), shotLabel(3), shotLabel(4)],
      replaced: [],
      uploaded: [],
    });
    for (const number of [1, 2, 3, 4]) expect(report).toContain(shotLabel(number));
    expect(report).not.toMatch(/unchanged|as it was/i);
    expect(report).toMatch(/uploaded: none/);
  });

  test('says the draft is as it was only when nothing was done', () => {
    expect(describeChanges({ removed: [], replaced: [], uploaded: [] })).toMatch(/as it was before this run/);
    expect(describeChanges({ removed: [], replaced: [], uploaded: ['a.png'] })).not.toMatch(/as it was/);
  });
});

describe('edge listing reads', () => {
  const alt = (file) => `Screenshot ${file}`;

  test('reads the screenshot file names in order and ignores other images', () => {
    expect(
      edgeScreenshotFiles(['Network+ logo', alt(screenshotFiles[0]), 'Screenshot', null, alt(screenshotFiles[3])]),
    ).toEqual([screenshotFiles[0], screenshotFiles[3]]);
  });

  // The v1.14.0 run printed `uploaded` four times over two screenshots landing.
  // Each upload now waits for its own name to appear.
  test('counts an upload only when an image carrying its name appears', () => {
    const before = [alt(screenshotFiles[0])];
    expect(edgeUploadLanded(before, before, screenshotFiles[1])).toBe(false);
    expect(edgeUploadLanded(before, [...before, alt(screenshotFiles[3])], screenshotFiles[1])).toBe(false);
    expect(edgeUploadLanded(before, [...before, alt(screenshotFiles[1])], screenshotFiles[1])).toBe(true);
    expect(
      edgeUploadLanded([], ['Large promotional tile chrome-marquee-1400x560.png'], 'chrome-marquee-1400x560.png'),
    ).toBe(true);
  });

  test('reports the two screenshots that never landed rather than the four intended', () => {
    const observed = edgeScreenshotFiles([alt(screenshotFiles[0]), alt(screenshotFiles[3])]);
    expect(compareListing(screenshotFiles, observed)).toEqual({
      matches: false,
      missing: [screenshotFiles[1], screenshotFiles[2]],
      unexpected: [],
    });
  });

  test('treats order and duplicates as mismatches', () => {
    const [one, two, three, four] = screenshotFiles;
    expect(compareListing(screenshotFiles, [one, three, two, four])).toEqual({
      matches: false,
      missing: [],
      unexpected: [],
    });
    expect(compareListing(screenshotFiles, [one, one, two, three, four])).toMatchObject({
      matches: false,
      unexpected: [one],
    });
    expect(compareListing(screenshotFiles, screenshotFiles).matches).toBe(true);
    expect(multisetDifference([one, one, two], [one])).toEqual([one, two]);
  });

  test('refuses to clear a listing it could not then refill', () => {
    const ready = {
      observed: screenshotFiles,
      deleteControls: 4,
      screenshotInput: true,
      saveControl: true,
      desired: screenshotFiles,
    };
    expect(edgePreflightProblems(ready)).toEqual([]);
    expect(edgePreflightProblems({ ...ready, deleteControls: 0 }).join('\n')).toMatch(/no "Delete screenshot" control/);
    expect(edgePreflightProblems({ ...ready, screenshotInput: false }).join('\n')).toMatch(
      /no screenshot upload input/,
    );
    expect(edgePreflightProblems({ ...ready, saveControl: false }).join('\n')).toMatch(/Save draft/);
    expect(
      edgePreflightProblems({
        ...ready,
        desired: Array.from({ length: EDGE_MAX_SCREENSHOTS + 1 }, (_, i) => `s${i}.png`),
      }).join('\n'),
    ).toMatch(/at most 10/);
  });
});

describe('polling for a positive signal', () => {
  const fakeClock = () => {
    let time = 0;
    return { now: () => time, sleep: async (milliseconds) => void (time += milliseconds) };
  };
  const sequence = (values) => {
    let index = 0;
    return async () => values[Math.min(index++, values.length - 1)];
  };

  test('returns the last observed value on timeout, so the failure can report it', async () => {
    const clock = fakeClock();
    const result = await pollUntil(sequence([['a.png']]), (alts) => alts.length > 1, {
      timeoutMs: 2000,
      intervalMs: 500,
      ...clock,
    });
    expect(result).toEqual({ landed: false, value: ['a.png'] });
    expect(clock.now()).toBe(2000);
  });

  // A console that is re-rendering under-reports for a moment; one low read is
  // not a removal.
  test('does not accept a transient reading when two agreeing reads are required', async () => {
    const clock = fakeClock();
    const reads = sequence([4, 3, 4, 4, 3, 3]);
    const result = await pollUntil(reads, (count) => count < 4, {
      timeoutMs: 60000,
      intervalMs: 500,
      confirmations: 2,
      ...clock,
    });
    expect(result).toEqual({ landed: true, value: 3 });
    expect(clock.now()).toBe(2500);
  });

  test('lands on the first read when the signal is already there', async () => {
    const clock = fakeClock();
    expect(await pollUntil(sequence([1]), (count) => count === 1, { timeoutMs: 1000, ...clock })).toEqual({
      landed: true,
      value: 1,
    });
    expect(clock.now()).toBe(0);
  });
});

describe('browser ownership', () => {
  // `status` launched on the profile a `login` window was using and then killed
  // every process on it, taking a sign-in in progress with it.
  test('never launches over, or stops, a browser that already answers on the port', () => {
    for (const command of ['login', 'status', 'chrome', 'edge']) {
      expect(browserSessionPlan({ command, portAnswered: true })).toEqual({
        launch: false,
        headless: false,
        stopOnFinish: false,
      });
    }
  });

  test('stops only the headless browser status launched itself', () => {
    expect(browserSessionPlan({ command: 'status', portAnswered: false })).toEqual({
      launch: true,
      headless: true,
      stopOnFinish: true,
    });
    for (const command of ['login', 'chrome', 'edge']) {
      expect(browserSessionPlan({ command, portAnswered: false })).toEqual({
        launch: true,
        headless: false,
        stopOnFinish: false,
      });
    }
  });
});
