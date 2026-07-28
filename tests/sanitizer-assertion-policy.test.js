const fs = require('fs');
const path = require('path');

const panelTestPath = path.join(__dirname, 'panel.test.js');
const panelTestSource = fs.readFileSync(panelTestPath, 'utf8');
const nestedSanitizerTitle = "test('redacts nested secret and PII body fields defensively'";
const nestedSanitizerStart = panelTestSource.indexOf(nestedSanitizerTitle);
const nestedSanitizerEnd = panelTestSource.indexOf('\n  test(', nestedSanitizerStart + nestedSanitizerTitle.length);
const nestedSanitizerSource = panelTestSource.slice(nestedSanitizerStart, nestedSanitizerEnd);

const itemStructureAssertion = 'expect(sanitized.items).toHaveLength(5);';
const flowStructureAssertion =
  "expect(Object.keys(sanitized.flow).sort()).toEqual(['nonce', 'session', 'sid', 'state']);";
const itemRedactionAssertion = 'expect(sanitized.items.every(';
const flowRedactionAssertion = 'expect(Object.values(sanitized.flow).every(';

test('empty nested collections satisfy the existing redaction predicates vacuously', () => {
  const sanitized = { items: [], flow: {} };
  const redactionMarker = '[redacted]';

  expect(sanitized.items.every((item) => Object.values(item)[0] === redactionMarker)).toBe(true);
  expect(Object.values(sanitized.flow).every((value) => value === redactionMarker)).toBe(true);
});

test('nested sanitizer assertions require exact structure before checking redaction markers', () => {
  expect(nestedSanitizerStart).toBeGreaterThanOrEqual(0);
  expect(nestedSanitizerEnd).toBeGreaterThan(nestedSanitizerStart);

  const structureIndexes = {
    flow: nestedSanitizerSource.indexOf(flowStructureAssertion),
    items: nestedSanitizerSource.indexOf(itemStructureAssertion),
  };
  const redactionIndexes = {
    flow: nestedSanitizerSource.indexOf(flowRedactionAssertion),
    items: nestedSanitizerSource.indexOf(itemRedactionAssertion),
  };

  expect(redactionIndexes.flow).toBeGreaterThanOrEqual(0);
  expect(redactionIndexes.items).toBeGreaterThanOrEqual(0);
  expect({
    flow: structureIndexes.flow >= 0,
    items: structureIndexes.items >= 0,
  }).toEqual({ flow: true, items: true });
  expect(structureIndexes.flow).toBeLessThan(redactionIndexes.flow);
  expect(structureIndexes.items).toBeLessThan(redactionIndexes.items);
});
