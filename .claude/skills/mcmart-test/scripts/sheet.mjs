#!/usr/bin/env node
// MC Mart test sheet (Google Sheets) — list features and record test results.
//
//   node sheet.mjs doctor                        # checks the key, the sheet, and the result columns
//   node sheet.mjs setup                         # adds Language / Function / UI / Priority / Tested columns (once)
//   node sheet.mjs list [--tab Website] [--status "To test"] [--untested]
//   node sheet.mjs record --tab Website --row 5 --language Pass --function Fail --ui Pass \
//        --priority High --comment "Step 3: …" [--status Failed] [--env local] [--device "Chrome 390px"]
//
// Auth: a Google service account key (JSON) at $MCMART_SHEETS_KEY or ~/.config/mcmart/sheets-service-account.json.
// The sheet must be shared with the service account's email as Editor, and be a native Google Sheet
// (File → Save as Google Sheets), not an uploaded .xlsx. The sheet id is in ../config.json.
// No dependencies: Node 20+ (fetch, crypto).
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(HERE, '..', 'config.json'), 'utf8'));
const SHEET_ID = process.env.MCMART_SHEET_ID || config.sheetId;
const KEY_PATH = process.env.MCMART_SHEETS_KEY || join(homedir(), '.config', 'mcmart', 'sheets-service-account.json');
const TABS = config.tabs;

/** The original columns (A–G) and the result columns this skill adds (H–L). */
const COL = { no: 0, module: 1, sub: 2, feature: 3, scope: 4, status: 5, comment: 6, language: 7, function: 8, ui: 9, priority: 10, tested: 11 };
const RESULT_HEADERS = ['Language', 'Function', 'UI', 'Priority', 'Tested'];
export const RESULTS = ['Pass', 'Fail', 'Partial', 'N/A'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const STATUSES = ['To test', 'Testing', 'Passed', 'Failed', 'Blocked'];
const FIRST_ROW = 3;
const LAST_ROW = 600;

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

// ── Google auth (service account → access token) ─────────────────────────

let tokenCache = null;
async function token() {
  if (tokenCache) return tokenCache;
  let key;
  try {
    key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  } catch {
    fail(`No Google service account key at ${KEY_PATH}. See SKILL.md → "One-time setup".`);
  }
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const body = await res.json();
  if (!res.ok) fail(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  tokenCache = { access: body.access_token, email: key.client_email };
  return tokenCache;
}

async function sheets(path, init = {}) {
  const { access, email } = await token();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message ?? String(res.status);
    if (/not supported for this document/i.test(msg)) fail('The sheet is an uploaded Excel file. Open it in Google Sheets → File → Save as Google Sheets, then put the NEW link in config.json (sheetId).');
    if (res.status === 403 || res.status === 404) fail(`No access to the sheet. Share it with ${email} as Editor (and check sheetId in config.json). Google said: ${msg}`);
    fail(`Google Sheets: ${msg}`);
  }
  return body;
}

const range = (tab, a1) => encodeURIComponent(`'${tab}'!${a1}`);

// ── Reading ──────────────────────────────────────────────────────────────

/** Every feature row of a tab, with its module and sub-module carried down from the merged cells. */
async function readTab(tab) {
  const { values = [] } = await sheets(`/values/${range(tab, `A${FIRST_ROW}:L${LAST_ROW}`)}`);
  const rows = [];
  let module = '';
  let sub = '';
  values.forEach((v, i) => {
    if (v[COL.module]) module = v[COL.module];
    if (v[COL.sub]) sub = v[COL.sub];
    if (!v[COL.feature]) return; // spacer row
    rows.push({
      tab,
      row: FIRST_ROW + i,
      module,
      sub,
      feature: v[COL.feature],
      scope: v[COL.scope] ?? '',
      status: v[COL.status] ?? '',
      comment: v[COL.comment] ?? '',
      language: v[COL.language] ?? '',
      function: v[COL.function] ?? '',
      ui: v[COL.ui] ?? '',
      priority: v[COL.priority] ?? '',
      tested: v[COL.tested] ?? '',
    });
  });
  return rows;
}

// ── Commands ─────────────────────────────────────────────────────────────

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[k] = v;
  }
  return out;
}

async function doctor() {
  const { email } = await token();
  console.log(`✔ Service account: ${email}`);
  const meta = await sheets('?fields=properties.title,sheets.properties.title');
  console.log(`✔ Sheet: "${meta.properties.title}"`);
  const names = meta.sheets.map((s) => s.properties.title);
  for (const tab of TABS) {
    if (!names.includes(tab)) fail(`Tab "${tab}" is missing (tabs: ${names.join(', ')})`);
    const { values = [[]] } = await sheets(`/values/${range(tab, 'A2:L2')}`);
    const headers = values[0] ?? [];
    const ready = RESULT_HEADERS.every((h, i) => headers[COL.language + i] === h);
    console.log(`${ready ? '✔' : '•'} ${tab}: ${(await readTab(tab)).length} features${ready ? '' : ' — result columns missing: run `node sheet.mjs setup`'}`);
  }
}

/** Adds the result columns (H–L) to every tab: headers, dropdowns, colours. Safe to run again. */
async function setup() {
  // Only tabs without the headers yet: running setup twice would stack the colour rules.
  const fresh = [];
  for (const tab of TABS) {
    const { values = [[]] } = await sheets(`/values/${range(tab, 'H2:L2')}`);
    if ((values[0] ?? [])[0] !== 'Language') fresh.push(tab);
  }
  if (!fresh.length) return console.log('✔ Result columns already set up on every tab.');
  const meta = await sheets('?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
  const requests = [];
  for (const s of meta.sheets) {
    const { sheetId, title, gridProperties } = s.properties;
    if (!fresh.includes(title)) continue;
    if (gridProperties.columnCount < 12) requests.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: 12 - gridProperties.columnCount } });
    const col = (c) => ({ sheetId, startRowIndex: FIRST_ROW - 1, endRowIndex: LAST_ROW, startColumnIndex: c, endColumnIndex: c + 1 });
    const list = (values) => ({ condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false });
    // Headers like the existing ones (row 2), and the title band over the new columns.
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: COL.language, endColumnIndex: COL.tested + 1 },
        rows: [{ values: RESULT_HEADERS.map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true, fontSize: 12 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', backgroundColor: { red: 0.953, green: 0.953, blue: 0.953 } } })) }],
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });
    for (const c of [COL.language, COL.function, COL.ui]) requests.push({ setDataValidation: { range: col(c), rule: list(RESULTS) } });
    requests.push({ setDataValidation: { range: col(COL.priority), rule: list(PRIORITIES) } });
    const widths = { [COL.language]: 100, [COL.function]: 100, [COL.ui]: 100, [COL.priority]: 95, [COL.tested]: 210 };
    for (const [c, px] of Object.entries(widths)) requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: +c, endIndex: +c + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });
    const body = { sheetId, startRowIndex: FIRST_ROW - 1, endRowIndex: LAST_ROW };
    const colour = (hex) => ({ red: parseInt(hex.slice(0, 2), 16) / 255, green: parseInt(hex.slice(2, 4), 16) / 255, blue: parseInt(hex.slice(4, 6), 16) / 255 });
    const rule = (c, value, hex) => ({
      addConditionalFormatRule: {
        index: 0,
        rule: { ranges: [{ ...body, startColumnIndex: c, endColumnIndex: c + 1 }], booleanRule: { condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] }, format: { backgroundColor: colour(hex) } } },
      },
    });
    for (const c of [COL.language, COL.function, COL.ui]) {
      requests.push(rule(c, 'Pass', 'D9EAD3'), rule(c, 'Fail', 'F4CCCC'), rule(c, 'Partial', 'FFF2CC'), rule(c, 'N/A', 'EFEFEF'));
    }
    requests.push(rule(COL.priority, 'High', 'E06666'), rule(COL.priority, 'Medium', 'F6B26B'), rule(COL.priority, 'Low', 'FFE599'));
    // Each row's result cells: wrapped, centred, bordered like the rest.
    requests.push({
      repeatCell: {
        range: { ...body, startColumnIndex: COL.language, endColumnIndex: COL.tested + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    });
  }
  await sheets(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  console.log(`✔ Added Language / Function / UI / Priority / Tested columns to: ${fresh.join(', ')}`);
}

async function list(a) {
  const tabs = a.tab ? [a.tab] : TABS;
  const out = [];
  for (const tab of tabs) {
    for (const r of await readTab(tab)) {
      if (a.status && r.status !== a.status) continue;
      if (a.untested && (r.language || r.function || r.ui)) continue;
      out.push(r);
    }
  }
  console.log(JSON.stringify(out, null, 2));
}

async function record(a) {
  if (!a.tab || !a.row) fail('record needs --tab and --row');
  if (!TABS.includes(a.tab)) fail(`Unknown tab "${a.tab}" (${TABS.join(', ')})`);
  const row = Number(a.row);
  const rows = await readTab(a.tab);
  const target = rows.find((r) => r.row === row);
  if (!target) fail(`Row ${row} of "${a.tab}" isn't a feature row.`);
  for (const [k, allowed] of [['language', RESULTS], ['function', RESULTS], ['ui', RESULTS], ['priority', PRIORITIES], ['status', STATUSES]]) {
    if (a[k] && !allowed.includes(a[k])) fail(`--${k} must be one of: ${allowed.join(', ')}`);
  }
  const results = [a.language ?? target.language, a.function ?? target.function, a.ui ?? target.ui];
  const failed = results.some((x) => x === 'Fail' || x === 'Partial');
  // Overall status follows the results unless given: any Fail/Partial → Failed; all Pass/N/A → Passed.
  const status = a.status ?? (results.every((x) => x) ? (failed ? 'Failed' : 'Passed') : 'Testing');
  if (failed && !a.priority && !target.priority) fail('A failing feature needs --priority High | Medium | Low (see SKILL.md).');
  const stamp = `${new Date().toISOString().slice(0, 10)} · ${a.env ?? 'local'}${a.device ? ` · ${a.device}` : ''}`;
  const data = [
    { range: `'${a.tab}'!F${row}:G${row}`, values: [[status, a.comment ?? target.comment]] },
    { range: `'${a.tab}'!H${row}:L${row}`, values: [[...results, failed ? (a.priority ?? target.priority) : (a.priority ?? ''), stamp]] },
  ];
  await sheets('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  console.log(`✔ ${a.tab} row ${row} "${target.feature}": ${status} — Language ${results[0] || '-'}, Function ${results[1] || '-'}, UI ${results[2] || '-'}${failed ? `, ${a.priority ?? target.priority}` : ''}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const a = args(rest);
const commands = { doctor, setup, list: () => list(a), record: () => record(a) };
if (!commands[cmd]) fail(`Usage: node sheet.mjs doctor | setup | list [--tab T] [--status S] [--untested] | record --tab T --row N …`);
await commands[cmd]();
