import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

async function inspect(browser, url, width, screenshot) {
  const page = await browser.newPage({ viewport: { width, height: 820 }, reducedMotion: 'reduce' });
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    if (!response?.ok()) throw new Error(`Page returned HTTP ${response?.status()}`);
    const issues = await page.evaluate(async () => {
      await document.fonts.ready;
      const viewport = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - viewport;
      const issues = overflow > 1 ? [{ type: 'horizontal-scroll', target: 'html', pixels: overflow }] : [];
      for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
        if (el.closest('[hidden],[inert],[aria-hidden="true"]') || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        let left = 0;
        let right = viewport;
        for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (!['hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) continue;
          const bounds = parent.getBoundingClientRect();
          left = Math.max(left, bounds.left + parent.clientLeft);
          right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
        }
        const pixels = Math.ceil(Math.min(box.width, Math.max(left - box.left, box.right - right)));
        if (pixels <= 1) continue;
        const segments = [];
        for (let node = el; node && node !== document.body; node = node.parentElement) {
          if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
            segments.unshift('#' + CSS.escape(node.id));
            break;
          }
          let index = 1;
          for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
            if (sibling.localName === node.localName) index++;
          }
          segments.unshift(node.localName + ':nth-of-type(' + index + ')');
        }
        issues.push({ type: 'clipped-control', target: segments.join(' > '), pixels });
      }
      return issues;
    });
    await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
    return issues;
  } finally {
    await page.close();
  }
}

export async function compare(baseline, candidate, directory = 'report', widths = [320, 375, 430]) {
  for (const value of [baseline, candidate]) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Use HTTP(S) URLs without embedded credentials.');
    }
  }
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch();
  try {
    const results = [];
    for (const width of widths) {
      const before = await inspect(browser, baseline, width, `${directory}/before-${width}.png`);
      const after = await inspect(browser, candidate, width, `${directory}/after-${width}.png`);
      const existing = new Set(before.map(issue => JSON.stringify([issue.type, issue.target])));
      results.push({ width, before, after, added: after.filter(issue => !existing.has(JSON.stringify([issue.type, issue.target]))) });
    }
    await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2) + '\n');
    const lines = ['# Mobile regression report'];
    for (const { width, added } of results) {
      lines.push('', `## ${width}px\n`, `[Before](before-${width}.png) · [After](after-${width}.png)\n`);
      if (!added.length) lines.push('No new issues.');
      for (const issue of added) lines.push(`- ${issue.type}: ${issue.target.replace(/[<>]/g, character => character === '<' ? '&lt;' : '&gt;')} (${issue.pixels}px)`);
    }
    await writeFile(`${directory}/report.md`, lines.join('\n') + '\n');
    return results;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: npm run check -- BASELINE_URL CANDIDATE_URL');
    const results = await compare(process.argv[2], process.argv[3]);
    const count = results.reduce((sum, result) => sum + result.added.length, 0);
    console.log(`${count} new findings across tested widths. See report/report.md.`);
    process.exitCode = count ? 1 : 0;
  } catch {
    console.error('Scan failed. Check the two HTTP(S) URLs, connectivity, and Chromium installation.');
    process.exitCode = 2;
  }
}
