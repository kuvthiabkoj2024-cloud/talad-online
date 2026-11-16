---
name: mcmart-test
description: Test MC Mart features (website, Seller Center, admin, mobile app) for Language, Function and UI, and record each result with a High/Medium/Low priority in the team's Google test sheet. Use when asked to test MC Mart, run the test plan, check a feature/tab/module, re-test failed rows, or update the test sheet.
---

# MC Mart test run → Google test sheet

The test plan is a Google Sheet (id in `config.json`) with one tab per platform: **Website, Seller
Center, Admin, App - Customer, App - Seller**. Each feature row has: No · Modules · Sub-Modules ·
Features · Implementation Scope (what to do, what should happen) · Test Status · Comments, and the
result columns this skill adds: **Language · Function · UI** (Pass / Fail / Partial / N/A) ·
**Priority** (High / Medium / Low) · **Tested** (date · env · device).

All commands run from the repo root with Node 24 (`export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`).
`S=.claude/skills/mcmart-test/scripts`.

## One-time setup (the person, not you)

If `node $S/sheet.mjs doctor` fails, walk the user through what it names — never create keys yourself:

1. Google Cloud Console → a project → enable **Google Sheets API** → IAM → Service accounts → create
   one (no roles needed) → Keys → Add key → JSON. Save it as
   `~/.config/mcmart/sheets-service-account.json` (or set `MCMART_SHEETS_KEY`). It's a secret: never
   commit it, paste it into chat, or print it.
2. Open the sheet → **File → Save as Google Sheets** (an uploaded .xlsx can't be edited by the API).
   This makes a new file: put its id (the part after `/d/` in the link) in `config.json` → `sheetId`.
3. Share that sheet with the service account's email (shown by `doctor`) as **Editor**.
4. `node $S/sheet.mjs setup` adds the result columns, dropdowns and colours (safe to run again).
5. Browser checks: `npm install --prefix $S` once (puppeteer-core; uses the Chrome on this Mac).

## Where to test

- **Local (default, full testing)**: website `localhost:3000`, Seller Center `:5174`, admin `:5173`,
  app preview `:8081` (Expo web), API `:4000`. Check they're up first (`curl -s -o /dev/null -w '%{http_code}' …`);
  if one is down, ask before starting it. Sign in with `node $S/session.mjs customer | shop | admin`
  (prints a token for the demo accounts in `config.json`), and always finish with
  `node $S/session.mjs cleanup`.
- **App preview**: its API address comes from `apps/mobile/.env` (`EXPO_PUBLIC_API_URL`). If that
  address doesn't answer (`curl … /categories`), the app shows empty screens — tell the user (their
  Mac's network address changed; update `.env` and restart Metro) instead of reporting app bugs.
- **Production (`--env production`)**: only checks that change nothing — open pages, browse, search,
  language, layout. Never sign in, order, pay, upload, chat or post there. Rows that need those are
  tested locally; write `prod: not tested (creates data)` in the comment if asked about production.
- **Needs a real phone** (camera, microphone, GPS, gallery, push, installing the APK): you can't test
  these. Record `Function: N/A`, status `Blocked`, comment `Needs a real phone: <what to check>` — so
  the human tester picks them up.

## The run

1. `node $S/sheet.mjs list --tab "<Tab>" [--untested | --status Failed]` → the rows to test (JSON with
   `row`, `feature`, `scope`). Test what the user asked for; for "everything", go tab by tab.
2. For each row, read **Implementation Scope** and test exactly that:
   - **Pages and UI**: `node $S/check-page.mjs --target web|shop|admin|app --path <path> [--as customer --token T]`
     → Lao + English, phone + computer: load status, rendered, console errors, failed requests,
     sideways scroll, broken images, raw text keys / `{placeholders}`, text in the wrong language,
     and screenshots. **Look at every screenshot** (Read tool) — the UI judgement is yours.
   - **Function**: do the steps — write a short puppeteer script in your scratchpad (click, type,
     submit) or call the local API with `curl` the way the app does — and check the result the scope
     describes (data saved, message shown, total right, status changed). Undo test data you created
     when you can (delete the address, cancel the test order), and say what you left.
3. Judge the three results (definitions below), then record — one call per row:
   ```bash
   node $S/sheet.mjs record --tab "Website" --row 12 --language Pass --function Fail --ui Partial \
     --priority High --env local --device "Chrome 390px + 1366px" \
     --comment "Function: wrong code accepted (step 3). UI: button text cut off on phone."
   ```
   Status is set from the results (any Fail/Partial → Failed, all Pass/N/A → Passed) unless you pass
   `--status` (use `Blocked` for can't-test). A failing row must have a priority. Never overwrite a
   human tester's comment without keeping it: read `comment` from `list` and append.
4. End with a short report: per tab passed / failed / blocked, the High items first (tab, row,
   feature, one line why), and what needs a real phone.

## Judging the three results

**Language** — Lao and English both:
- Fail: a screen in the wrong language (English UI in Lao mode or Lao in English mode), raw keys
  (`account.title`), `{n}` / `undefined` / `NaN` shown, untranslated error messages, wrong meaning.
- Partial: a few leftover words (a button, a label), awkward or inconsistent wording, wrong
  number/date/₭ format.
- Brand and product names (MC Mart, BCEL One, a shop's product name) are fine in either language.

**Function** — does what the scope says, end to end:
- Fail: doesn't work, wrong result (price, total, stock, status), data not saved or lost, error for
  valid input, wrong person can do it.
- Partial: works with a workaround, an edge case breaks (empty list, wrong input message missing),
  slow (> 5 s) or needs a reload.

**UI** — on phone (390 px) and computer (1366 px), light (and dark in the app):
- Fail: blank/broken screen, content hidden or unreachable, sideways scroll, overlapping elements
  that block taps, broken images on main content.
- Partial: text cut off, misaligned or cramped layout, poor contrast, inconsistent with the rest of
  the site, missing loading or empty state.

## Priority (only when something fails)

- **High** — blocks money or the main path: sign-in, browse → cart → checkout → pay, placing or
  handling orders, payouts/refunds, admin approvals; crashes or blank screens; wrong prices or
  totals; data loss; security or privacy (someone sees another person's data); a whole screen in the
  wrong language.
- **Medium** — a feature is broken but there's a workaround or it's not on the main path; wrong or
  missing translation on an important label or message; layout broken on phone but usable;
  confusing errors.
- **Low** — cosmetic: spacing, alignment, colours, a typo, a minor wording or translation slip.

When unsure between two levels, pick the higher and say why in the comment.

## Rules

- Never record a result you didn't check. No guessing from code: test the running app.
- Keep comments short and actionable: `<Language|Function|UI>: what happened (step, screen, size)`.
- Don't paste personal data (phone numbers, addresses of real customers) into the sheet.
- The sheet is shared with the team: only write the rows you tested.
