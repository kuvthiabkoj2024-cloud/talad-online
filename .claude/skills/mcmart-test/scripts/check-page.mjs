#!/usr/bin/env node
// Opens one MC Mart page (or app screen) in Lao and English, on a phone and a computer, and reports
// what a tester would look for. Screenshots go to --out for the UI review.
//
//   node check-page.mjs --target web --path /track [--as customer --token T] [--env local|production]
//                       [--lang lo,en] [--sizes phone,desktop] [--out /tmp/mcmart-test] [--wait 2500]
//
//   --target  web (storefront) | shop (Seller Center) | admin | app (the mobile app's web preview, local only)
//   --path    the page path without the language: /track, /p/talad-demo/bolaven-arabica-500g, /orders …
//   --as      guest (default) | customer | shop | admin — with --token from `node session.mjs <who>` (local)
//
// Prints JSON per language × size: load status, console errors, failed requests, sideways scroll,
// broken images, raw text keys / {placeholders}, text in the wrong language, and the screenshot path.
// Uses the Chrome installed on this Mac (puppeteer-core). Install once:
//   npm install --prefix .claude/skills/mcmart-test/scripts
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const HERE = new URL('.', import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(HERE, '..', 'config.json'), 'utf8'));

const a = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) a[process.argv[i].slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
}
const target = a.target ?? 'web';
const env = a.env ?? 'local';
const base = config[env]?.[target];
if (!base) {
  console.error(`✖ No ${env} address for "${target}" (the app's web preview is local only).`);
  process.exit(1);
}
const path = a.path ?? '/';
const langs = (a.lang ?? 'lo,en').split(',');
const sizes = (a.sizes ?? 'phone,desktop').split(',');
const out = a.out ?? '/tmp/mcmart-test';
const wait = Number(a.wait ?? 2500);
const who = a.as ?? 'guest';
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1366, height: 900, deviceScaleFactor: 1 },
};
/** Words that are fine in Lao mode: brand and tech names. Product and shop names are judged by the reviewer. */
const LATIN_OK = /^(MC|Mart|MC Mart|OTP|QR|COD|SMS|PDF|CSV|AI|Google|Apple|Facebook|WhatsApp|TikTok|BCEL|One|LDB|JDB|APB|Unitel|LTC|ETL|TPlus|Lao|Laos|Wi-Fi|ID|OK|km|kg|g|ml|cm|mm|pcs|PM|AM|EN|TL[\d•]+|https?:\/\/\S+|\S+@\S+|\d[\d,.\s]*)$/i;

/** Before the page loads: language and sign-in, the way each app stores them. */
async function prepare(page, lang) {
  const origin = new URL(base).origin;
  if (target === 'web') {
    const cookies = [{ name: 'NEXT_LOCALE', value: lang, url: origin }];
    if (who !== 'guest') cookies.push({ name: 'talad_session', value: a.token, url: origin, httpOnly: true });
    await page.setCookie(...cookies);
    return;
  }
  // Set before any page script runs: if set after a load, the app may write its default language
  // back over it while it starts up.
  await page.evaluateOnNewDocument(
    (t, lang, who, token) => {
      const keys = {
        shop: ['talad_seller_locale', 'talad_seller_token'],
        admin: ['talad_admin_locale', 'talad_admin_token'],
        app: ['mcmart.locale', 'mcmart.session'],
      }[t];
      try {
        localStorage.setItem(keys[0], lang);
        if (who !== 'guest' && token) localStorage.setItem(keys[1], token);
        else localStorage.removeItem(keys[1]);
      } catch {
        // about:blank and other frames without storage.
      }
    },
    target,
    lang,
    who,
    a.token ?? '',
  );
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
const results = [];
try {
  // The app's dev preview builds a screen the first time a browser opens it (minutes, not seconds):
  // open it once untimed, so the measured runs see the real screen.
  if (target === 'app') {
    const warm = await browser.newPage();
    await warm.setViewport(VIEWPORTS.phone);
    await prepare(warm, langs[0]);
    await warm.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await warm.waitForFunction(() => { const t = (document.body?.innerText ?? '').trim(); return t.length > 0 && !/Bundling\.\.\./.test(t); }, { timeout: 300_000 }).catch(() => {});
    await warm.close();
  }
  for (const lang of langs) {
    for (const size of sizes) {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS[size]);
      const consoleErrors = [];
      const failed = [];
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
      page.on('pageerror', (e) => consoleErrors.push(`crash: ${String(e.message).slice(0, 200)}`));
      page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`));

      await prepare(page, lang);
      const url = target === 'web' ? `${base}/${lang}${path === '/' ? '' : path}` : `${base}${path}`;
      const started = Date.now();
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => ({ error: e.message }));
      // Some pages keep a connection open (live updates), so "network idle" may never come: wait a
      // little for it, then for real content. The app's dev preview builds each screen on first open
      // ("Bundling…"), which can take a minute.
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => {});
      const ready = await page
        .waitForFunction(() => {
          const text = (document.body?.innerText ?? '').trim();
          return text.length > 0 && !/Bundling\.\.\./.test(text);
        }, { timeout: 120_000 })
        .then(() => true)
        .catch(() => false);
      await new Promise((r) => setTimeout(r, wait));
      const loadMs = Date.now() - started;

      const findings = await page.evaluate(
        (lang, latinOk) => {
          const ok = new RegExp(latinOk, 'i');
          const text = document.body?.innerText ?? '';
          const lines = [...new Set(text.split('\n').map((l) => l.trim()).filter(Boolean))];
          const lao = /[຀-໿]/;
          // Text in the other language: English UI words in Lao mode, Lao in English mode.
          const wrongLanguage =
            lang === 'lo'
              ? lines.filter((l) => !lao.test(l) && /[A-Za-z]{3,}/.test(l) && !ok.test(l) && l.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w) && !ok.test(w)).length >= 1)
              : // Language names stay in their own language (the switcher shows ລາວ).
                lines.filter((l) => lao.test(l) && !/^(ລາວ|ພາສາລາວ)$/.test(l));
          const rawKeys = lines.filter((l) => /(^|\s)[a-z]+(\.[a-z][A-Za-z]+){1,}(\s|$)/.test(l) && !/\.(app|com|la|net|org|png|jpg|webp)\b/.test(l));
          const placeholders = lines.filter((l) => /\{[a-zA-Z]+\}|\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/.test(l));
          const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map((i) => i.src.slice(0, 120));
          const overflowX = document.documentElement.scrollWidth - window.innerWidth;
          return { title: document.title, lines: lines.length, wrongLanguage: wrongLanguage.slice(0, 25), rawKeys, placeholders, brokenImages, overflowX };
        },
        lang,
        LATIN_OK.source,
      );

      // React Native Web scrolls inside views: let them grow so the screenshot shows the whole screen.
      if (target === 'app') {
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('div')) {
            const s = getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) Object.assign(el.style, { overflowY: 'visible', maxHeight: 'none', height: 'auto', flex: 'none' });
          }
        });
      }
      const shot = join(out, `${target}${path.replace(/[^\w]+/g, '-')}-${lang}-${size}.png`.replace(/-+/g, '-'));
      await page.screenshot({ path: shot, fullPage: true });
      results.push({
        url,
        lang,
        size,
        as: who,
        status: res?.status?.() ?? res?.error ?? null,
        // False: nothing showed within 2 minutes (blank screen, endless loading) — a finding in itself.
        rendered: ready,
        loadMs,
        ...findings,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 10),
        failedRequests: [...new Set(failed)].slice(0, 10),
        sidewaysScroll: findings.overflowX > 1,
        screenshot: shot,
      });
      await page.close();
    }
  }
} finally {
  // Closing can hang if Chrome already went away: don't let it block the run.
  await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
}
console.log(JSON.stringify(results, null, 2));
process.exit(0);
