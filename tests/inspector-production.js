#!/usr/bin/env node
'use strict';

// Real Edge DevTools extension verification. No mock chrome API, remote
// traffic, added extension permissions, or files inside the unpacked build.
// EDGE_BIN=/path/to/edge node tests/inspector-production.js --output-dir /tmp/inspector
const fs = require('fs');
const path = require('path');
const { delay, evaluate, findBrowserExecutable } = require('./helpers/browser-harness');
const {
  activateSample,
  auditVisiblePanel,
  capture,
  inPanel,
  openExtension,
  setViewport,
} = require('./design-directions');

const root = path.resolve(__dirname, '..');
const sizes = [
  { name: 'wide', width: 1440, height: 800 },
  { name: 'narrow', width: 420, height: 800 },
];
const themes = ['light', 'dark', 'system'];

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function outsideRoot(directory) {
  const relative = path.relative(root, directory);
  return relative === '..' || relative.startsWith('..' + path.sep);
}

async function waitFor(session, expression, description) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await evaluate(session.panel, expression)) return;
    await delay(80);
  }
  throw new Error(`The real extension did not ${description}.`);
}

async function settleTheme(session) {
  await waitFor(session, `(() => {
    const root = getComputedStyle(document.documentElement);
    const control = getComputedStyle(document.getElementById('searchToggleBtn'));
    return matchMedia('(prefers-reduced-motion: reduce)').matches &&
      control.color === root.color &&
      control.backgroundColor === getComputedStyle(document.body).backgroundColor;
  })()`, 'finish repainting the chosen theme');
  await delay(300);
}

async function settleMotion(session) {
  await waitFor(session,
    "matchMedia('(prefers-reduced-motion: reduce)').matches && document.getAnimations().every((animation) => animation.playState !== 'running')",
    'settle the reduced-motion panel');
}

function setTheme(theme) {
  const select = document.getElementById('themeSelect');
  const lang = document.getElementById('langSelect');
  select.value = theme;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  lang.value = 'en';
  lang.dispatchEvent(new Event('change', { bubbles: true }));
  return {
    preference: select.value,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    language: lang.value,
    canvas: globalThis.getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  };
}

function showEvidence(tab, narrow) {
  const toggle = document.getElementById('inspector-request-toggle');
  if (toggle.getAttribute('aria-expanded') === String(narrow)) toggle.click();
  document.getElementById('res-tab-' + tab).click();
  document.querySelector('.topbar').scrollLeft = 0;
  return {
    tab: document.querySelector('#res-tab-bar .tab-btn.active')?.dataset.tab,
    requestExpanded: toggle.getAttribute('aria-expanded') === 'true',
    selected: document.querySelector('#tbody tr.selected .status-cell')?.textContent,
    overview: !document.querySelector('#detailsTimingOverview').hidden,
    bodyHeading: document.querySelector('#res-body .response-preview-heading')?.textContent || '',
    bodyJson: !!document.querySelector('#res-body .json-tree'),
  };
}

function stageVariedHar() {
  const entries = Array.from({ length: 80 }, (_, index) => {
    const status = [200, 304, 404, 503, 0][index % 5];
    const binary = index % 10 === 0 && status === 200;
    const large = index % 11 === 0 && !binary && status !== 304;
    const mime = binary ? 'application/octet-stream' : status === 404 ? 'text/plain' : 'application/json';
    const body = status === 304 || status === 0
      ? ''
      : binary
        ? 'AAECAwQFBgcICQ=='
        : status === 404
          ? 'Synthetic missing record ' + index + (large ? 'x'.repeat(4200) : '')
          : JSON.stringify({
            source: 'local-fixture',
            number: index,
            status,
            ...(large ? { payload: 'x'.repeat(4200) } : {}),
          });
    const time = status === 304 ? 0 : status === 0 ? -1 : status === 503 ? 300 : 25;
    const timings = status === 304
      ? {}
      : status === 0
        ? { blocked: -1, wait: 15 }
        : status === 503
          ? { blocked: 5, wait: 200, receive: 20 }
          : status === 404
            ? { wait: -1, receive: 0 }
            : { wait: 20, receive: 5 };
    return {
      startedDateTime: new Date(1704067200000 + index * 1000).toISOString(),
      time,
      request: {
        method: status === 503 ? 'POST' : 'GET',
        url: 'https://synthetic.example.test/fixture-' + index,
        httpVersion: 'HTTP/2',
        headers: [{ name: 'Accept', value: mime }],
      },
      response: {
        status,
        statusText: String(status),
        httpVersion: 'HTTP/2',
        headers: [{ name: 'Content-Type', value: mime }],
        bodySize: status === 304 ? 0 : body.length,
        content: { size: binary ? 10 : body.length, mimeType: mime, text: body, ...(binary ? { encoding: 'base64' } : {}) },
      },
      timings,
    };
  });
  const har = { log: { version: '1.2', creator: { name: 'Network+ local test fixture', version: '1' }, entries } };
  const file = new File([JSON.stringify(har)], 'local-inspector-fixture.har', { type: 'application/json' });
  const transfer = new globalThis.DataTransfer();
  transfer.items.add(file);
  const picker = document.getElementById('importFile');
  picker.files = transfer.files;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  return { entries: entries.length, bytes: file.size };
}

function inspectVaried() {
  const rows = [...document.querySelectorAll('#tbody tr[data-row-id]')];
  const statuses = Object.fromEntries(['200', '304', '404', '503', '0'].map((code) => [
    code, rows.filter((row) => row.querySelector('.status-cell')?.textContent === code).length,
  ]));
  const choose = (index) => {
    const row = rows.find((candidate) =>
      candidate.querySelector('[data-col-id="path"]')?.textContent.trim().endsWith('/fixture-' + index));
    if (!row) throw new Error('The imported local fixture ' + index + ' is not in the grid.');
    row.click();
    return row;
  };
  choose(3);
  document.getElementById('res-tab-timing').click();
  return {
    rows: rows.length,
    statuses,
    failedOverview: document.querySelector('#detailsTimingOverview .details-timing-value')?.textContent,
    timingRows: document.querySelectorAll('#res-timing .timing-name').length,
    selected: document.querySelector('#tbody tr.selected .status-cell')?.textContent,
  };
}

function selectVariedCase(index) {
  const row = [...document.querySelectorAll('#tbody tr[data-row-id]')].find(
    (candidate) => candidate.querySelector('[data-col-id="path"]')?.textContent.trim().endsWith('/fixture-' + index),
  );
  if (!row) throw new Error(`The varied fixture ${index} was not found in the grid.`);
  row.click();
  return document.querySelector('#tbody tr.selected .status-cell')?.textContent || '';
}

function checkStatusCells() {
  const rootStyle = globalThis.getComputedStyle(document.documentElement);
  const expected = Object.fromEntries(['2xx', '3xx', '4xx', '5xx'].map((kind) => {
    const hex = rootStyle.getPropertyValue(`--status-${kind}-text`).trim();
    const channels = [1, 3, 5].map((position) => parseInt(hex.slice(position, position + 2), 16));
    return [kind, `rgb(${channels.join(', ')})`];
  }));
  const observed = {};
  for (const kind of Object.keys(expected)) {
    const cell = document.querySelector(`#tbody tr.status-${kind} .status-cell`);
    if (!cell) continue;
    const style = globalThis.getComputedStyle(cell);
    observed[kind] = {
      color: style.color,
      fontWeight: style.fontWeight,
      outline: style.outlineStyle,
      left: style.borderLeftWidth,
      right: style.borderRightWidth,
    };
    if (style.color !== expected[kind] ||
      style.fontWeight !== (kind === '2xx' ? '400' : '700') ||
      style.outlineStyle !== 'none' || style.borderLeftWidth !== '0px' ||
      style.borderRightWidth !== '0px') {
      throw new Error(`The main-style ${kind} status cell changed: ${JSON.stringify(observed[kind])}`);
    }
  }
  return observed;
}

function openFilter() {
  const filter = document.getElementById('filterBtn');
  filter.click();
  return filter.getAttribute('aria-expanded') === 'true' &&
    document.querySelector('#columnFilterPopup').classList.contains('show');
}

function clearAfterFilter() {
  const filter = document.getElementById('filterBtn');
  filter.click();
  document.getElementById('clearBtn').click();
  return {
    filterClosed: filter.getAttribute('aria-expanded') === 'false',
    cleared: document.querySelectorAll('#tbody tr[data-row-id]').length === 0,
    empty: !document.getElementById('inspectorEmptyState').hidden,
    timingHidden: document.getElementById('detailsTimingOverview').hidden,
  };
}

function assertAudit(report, label) {
  const problems = [];
  if (report.text.failures.length) problems.push(`text ${JSON.stringify(report.text.failures)}`);
  if (report.borders.failures.length) problems.push(`UI boundaries ${JSON.stringify(report.borders.failures)}`);
  if (report.focus.some((entry) => !entry.visible || entry.ratio < 3 || entry.width < 2)) {
    problems.push(`focus ${JSON.stringify(report.focus)}`);
  }
  if (report.rootOverflow) problems.push(`root overflow ${report.rootOverflow}px`);
  if (report.rowHeights.some((height) => height < 24 || height > 27)) problems.push(`row density ${report.rowHeights}`);
  if (report.runningAnimations || !report.reducedMotion) {
    problems.push(`reduced motion=${report.reducedMotion}, running animations=${report.runningAnimations}`);
  }
  if (report.consoleErrors.length) problems.push(`console errors ${report.consoleErrors.join(' | ')}`);
  if (report.unsupportedBackgrounds.length) problems.push(`unmeasured backgrounds ${report.unsupportedBackgrounds}`);
  if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
}

async function main() {
  const output = path.resolve(argumentValue('--output-dir', '') || '');
  if (!process.argv.includes('--output-dir') || !outsideRoot(output)) {
    throw new Error('Pass --output-dir pointing outside this repository.');
  }
  const extensionDirectory = path.resolve(argumentValue('--extension-path', root));
  if (!fs.existsSync(path.join(extensionDirectory, 'manifest.json'))) throw new Error('Unpacked extension manifest is missing.');
  const executable = process.env.EDGE_BIN || process.env.CHROME_BIN || findBrowserExecutable();
  if (!executable || !fs.existsSync(executable)) throw new Error('An executable Edge or Chromium is required.');
  fs.mkdirSync(output, { recursive: true });
  const session = await openExtension(executable, extensionDirectory);
  const results = [];
  try {
    await waitFor(
      session,
      "Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === 'Explore sample capture')",
      'show the DevTools-only local sample control',
    );
    const sample = await inPanel(session.panel, activateSample);
    if (sample.signatures.join(',') !== 'GET 200,POST 503,GET 304' || !sample.selected || !sample.sampleActive) {
      throw new Error('The real local sample does not match the three expected synthetic requests.');
    }
    for (const theme of themes) {
      await session.panel.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-reduced-motion', value: 'reduce' },
          { name: 'prefers-color-scheme', value: theme === 'system' ? 'dark' : 'light' },
        ],
      });
      const themeState = await inPanel(session.panel, setTheme, theme);
      if (themeState.preference !== theme || themeState.language !== 'en' ||
        themeState.dataTheme !== (theme === 'system' ? null : theme)) {
        throw new Error(`Requested theme was not applied: ${JSON.stringify(themeState)}`);
      }
      await settleTheme(session);
      for (const size of sizes) {
        const frame = await setViewport(session, size);
        const statusStyles = await inPanel(session.panel, checkStatusCells);
        if (Object.keys(statusStyles).length !== 3) throw new Error('The three sample status styles were not measurable.');
        for (const tab of ['headers', 'body', 'timing']) {
          const active = await inPanel(session.panel, showEvidence, tab, size.width <= 800);
          if (!active.overview || active.selected !== '503' || active.tab !== 'res-' + tab ||
            active.requestExpanded === (size.width <= 800) || active.bodyHeading !== 'Response preview' ||
            !active.bodyJson) {
            throw new Error(`The selected request did not keep its real evidence: ${JSON.stringify(active)}`);
          }
          await delay(300);
          await settleMotion(session);
          const label = `inspector-${theme}-${size.name}-${tab}`;
          const report = await inPanel(session.panel, auditVisiblePanel);
          report.name = label;
          report.requestedTheme = theme;
          report.statusStyles = statusStyles;
          report.consoleErrors = session.errors.slice();
          assertAudit(report, label);
          if (tab === 'body' && !report.previewVisible) throw new Error(`${label}: JSON preview is not in the viewport.`);
          if (tab === 'timing' && !report.timingVisible) throw new Error(`${label}: real timing waterfall is not in the viewport.`);
          report.pngSha256 = await capture(session, frame, output, label);
          results.push(report);
          console.log(`${label}: ${report.text.minimum}:1 text, ${report.borders.minimum}:1 UI, root ${report.rootOverflow}px`);
        }
      }
    }

    const generated = await inPanel(session.panel, stageVariedHar);
    await waitFor(
      session,
      "document.querySelectorAll('#tbody tr[data-row-id]').length === 80 && document.querySelector('#statusText').textContent.includes('Imported 80')",
      'import eighty local HAR entries',
    );
    const varied = await inPanel(session.panel, inspectVaried);
    if (varied.rows !== 80 || varied.selected !== '503' || varied.timingRows < 8 ||
      Object.values(varied.statuses).some((count) => count !== 16)) {
      throw new Error(`The imported larger synthetic capture is incomplete: ${JSON.stringify(varied)}`);
    }
    const bodyCases = [
      { index: 0, status: '200', selector: '#res-body .hex-dump' },
      { index: 22, status: '404', selector: '#res-body button.link-btn' },
      { index: 55, status: '200', selector: '#res-body .json-tree-str-toggle' },
      { index: 2, status: '404', selector: '#res-body .code-block' },
      { index: 1, status: '304', selector: '#res-body .pane-empty' },
      { index: 4, status: '0', selector: '#res-body .pane-empty' },
      { index: 3, status: '503', selector: '#res-body .json-tree' },
    ];
    const bodyEvidence = [];
    for (const scenario of bodyCases) {
      const status = await inPanel(session.panel, selectVariedCase, scenario.index);
      if (status !== scenario.status) throw new Error(`Varied row ${scenario.index} has unexpected status ${status}.`);
      try {
        await waitFor(session, `!!document.querySelector(${JSON.stringify(scenario.selector)})`,
          `show the real response renderer for varied row ${scenario.index}`);
      } catch (error) {
        const diagnostic = await evaluate(session.panel, `({
          path: document.querySelector('#tbody tr.selected [data-col-id="path"]')?.textContent,
          body: document.querySelector('#res-body')?.textContent.slice(0, 180),
          controls: [...document.querySelectorAll('#res-body button')].map((button) => button.className),
          status: document.querySelector('#statusText')?.textContent
        })`);
        throw new Error(`${error.message} ${JSON.stringify(diagnostic)}`, { cause: error });
      }
      const evidence = await evaluate(session.panel, `({
        heading: document.querySelector('#res-body .response-preview-heading')?.textContent,
        timing: document.querySelector('#detailsTimingOverview .details-timing-heading span')?.textContent || '',
        selected: document.querySelector('#tbody tr.selected .status-cell')?.textContent
      })`);
      if (evidence.heading !== 'Response preview' || evidence.selected !== scenario.status) {
        throw new Error(`Varied response preview did not follow row ${scenario.index}: ${JSON.stringify(evidence)}`);
      }
      bodyEvidence.push({ index: scenario.index, ...evidence });
    }
    if (bodyEvidence.find((entry) => entry.index === 4)?.timing !== 'Reported phases') {
      throw new Error('The canceled row mistook its timing phase sum for a reported duration.');
    }
    await session.panel.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }],
    });
    await inPanel(session.panel, setTheme, 'light');
    await settleTheme(session);
    const variedFrame = await setViewport(session, sizes[0]);
    const variedStatusStyles = await inPanel(session.panel, checkStatusCells);
    if (Object.keys(variedStatusStyles).length !== 4) {
      throw new Error('The imported 200/304/404/503 status cells were not all measured.');
    }
    await inPanel(session.panel, showEvidence, 'timing', false);
    await delay(300);
    await settleMotion(session);
    const variedReport = await inPanel(session.panel, auditVisiblePanel);
    variedReport.consoleErrors = session.errors.slice();
    assertAudit(variedReport, 'varied-light-wide');
    variedReport.pngSha256 = await capture(session, variedFrame, output, 'inspector-varied-light-wide');
    results.push(variedReport);

    const filterOpened = await inPanel(session.panel, openFilter);
    if (!filterOpened) throw new Error('The real column filter popup did not open.');
    await delay(300);
    await settleMotion(session);
    const filterReport = await inPanel(session.panel, auditVisiblePanel);
    filterReport.consoleErrors = session.errors.slice();
    assertAudit(filterReport, 'inspector-varied-light-wide-filters');
    filterReport.pngSha256 = await capture(session, variedFrame, output, 'inspector-varied-light-wide-filters');
    results.push(filterReport);
    const finalState = await inPanel(session.panel, clearAfterFilter);
    if (!finalState.filterClosed || !finalState.cleared || !finalState.empty || !finalState.timingHidden) {
      throw new Error(`The filter/clear/empty state is not functional: ${JSON.stringify(finalState)}`);
    }
    const emptyFrame = await setViewport(session, sizes[1]);
    await delay(300);
    await settleMotion(session);
    const emptyReport = await inPanel(session.panel, auditVisiblePanel);
    emptyReport.consoleErrors = session.errors.slice();
    assertAudit(emptyReport, 'inspector-empty-light-narrow');
    emptyReport.pngSha256 = await capture(session, emptyFrame, output, 'inspector-empty-light-narrow');
    results.push(emptyReport);
    if (session.errors.length) throw new Error(`The real panel emitted console errors: ${session.errors.join(' | ')}`);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({
      extension: session.identity,
      extensionDirectory,
      executable,
      sample,
      generated,
      varied,
      bodyEvidence,
      variedStatusStyles,
      finalState,
      results,
    }, null, 2) + '\n');
    console.log(`PASS: ${results.length} actual-extension captures; imported ${varied.rows} synthetic HAR entries; filter and Clear/empty states work.`);
  } finally {
    await session.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
