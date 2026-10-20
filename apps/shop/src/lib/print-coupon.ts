import type { Locale } from '@talad/shared'
import type { Dict } from '@/i18n/en'
import { fill, formatDate, formatMoney } from './format'
import { esc, FONT } from './print-order'
import type { ShopCoupon } from './types'

/** The shop details printed on coupons. */
export interface CouponShop {
  name: string
  logoUrl: string | null
  /** Where to shop, e.g. taladonline.la/lo/s/my-shop. */
  url: string
}

export const COUPONS_PER_SHEET = 10

/** The big number on the stub: "15%" or "₭20,000". */
function stubValue(c: ShopCoupon, locale: Locale) {
  return c.type === 'PERCENTAGE' ? `${c.value}<small>%</small>` : esc(formatMoney(c.value, locale))
}

function ticket(c: ShopCoupon, shop: CouponShop, t: Dict, locale: Locale): string {
  const tt = t.coupons.ticket
  const rules = [
    c.minOrderAmount ? fill(tt.min, { amount: formatMoney(c.minOrderAmount, locale) }) : tt.noMin,
    c.type === 'PERCENTAGE' && c.maxDiscount ? fill(tt.upTo, { amount: formatMoney(c.maxDiscount, locale) }) : null,
    c.perCustomer ? fill(tt.perCustomer, { n: c.perCustomer }) : null,
  ].filter(Boolean) as string[]
  const fixed = c.type === 'FIXED_AMOUNT'

  return `<article class="ticket">
  <div class="stub">
    <span class="kicker">${esc(tt.discount)}</span>
    <span class="value${fixed ? ' fixed' : ''}">${stubValue(c, locale)}</span>
    <span class="off">${esc(tt.off)}</span>
  </div>
  <div class="main">
    <header>
      ${shop.logoUrl ? `<img class="logo" src="${esc(shop.logoUrl)}" alt="">` : `<span class="logo ph">${esc(shop.name.trim().charAt(0).toUpperCase())}</span>`}
      <span class="who"><b>${esc(shop.name)}</b><em>${esc(tt.title)}</em></span>
    </header>
    <ul class="rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <div class="code"><span>${esc(tt.code)}</span><b>${esc(c.code)}</b></div>
    <footer>
      <span>${esc(fill(tt.valid, { from: formatDate(c.startsAt, locale), to: formatDate(c.endsAt, locale) }))}</span>
      <span>${esc(tt.howTo)}</span>
      <b>${esc(shop.url)}</b>
    </footer>
  </div>
</article>`
}

/** A4 sheets of cut-out coupons, {@link COUPONS_PER_SHEET} per page. */
export function couponsHtml(coupons: ShopCoupon[], shop: CouponShop, t: Dict, locale: Locale): string {
  const sheets: ShopCoupon[][] = []
  for (let i = 0; i < coupons.length; i += COUPONS_PER_SHEET) sheets.push(coupons.slice(i, i + COUPONS_PER_SHEET))

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(t.coupons.printTitle)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${FONT}; color: #17251a; font-size: 9pt; }
  .sheet { display: grid; grid-template-columns: repeat(2, 93mm); grid-auto-rows: 52mm; gap: 3mm 4mm; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .ticket { position: relative; display: flex; overflow: hidden; border: 0.3mm solid #c9d8cb; border-radius: 3mm; background: #fff; break-inside: avoid; }
  .stub { position: relative; flex: none; width: 29mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5mm;
    color: #fff; text-align: center; background: linear-gradient(160deg, #3d9a4b 0%, #2a7a37 55%, #1f5f2b 100%); }
  /* Perforation: a dotted edge with a half-circle notch at the top and bottom. */
  .stub::after { content: ''; position: absolute; top: 2.5mm; bottom: 2.5mm; right: 0; border-right: 0.6mm dotted rgba(255, 255, 255, 0.9); }
  .ticket::before, .ticket::after { content: ''; position: absolute; left: calc(29mm - 2.2mm); width: 4.4mm; height: 4.4mm; border-radius: 50%;
    background: #fff; border: 0.3mm solid #c9d8cb; z-index: 1; }
  .ticket::before { top: -2.5mm; }
  .ticket::after { bottom: -2.5mm; }
  .kicker { font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3mm; text-transform: uppercase; opacity: 0.85; }
  .value { font-size: 25pt; font-weight: 800; line-height: 1; letter-spacing: -0.3mm; }
  .value small { font-size: 14pt; font-weight: 700; }
  .value.fixed { font-size: 12.5pt; letter-spacing: 0; padding: 0 1.5mm; word-break: break-all; }
  .off { margin-top: 0.8mm; padding: 0.4mm 2.2mm; border-radius: 9mm; background: #fff; color: #23703a; font-size: 7pt; font-weight: 800; letter-spacing: 0.3mm; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1.6mm; padding: 3mm 3.5mm 2.6mm 4.5mm;
    background: radial-gradient(circle at 100% 0%, #eaf5ea 0, #eaf5ea 9mm, transparent 9.2mm); }
  header { display: flex; align-items: center; gap: 2mm; }
  .logo { width: 7.5mm; height: 7.5mm; border-radius: 1.6mm; object-fit: cover; flex: none; }
  .logo.ph { display: flex; align-items: center; justify-content: center; background: #2a7a37; color: #fff; font-weight: 800; font-size: 11pt; }
  .who { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .who b { font-size: 9.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who em { font-style: normal; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.25mm; text-transform: uppercase; color: #2a7a37; }
  .rules { list-style: none; display: flex; flex-wrap: wrap; gap: 0.8mm 1.2mm; }
  .rules li { padding: 0.3mm 1.6mm; border-radius: 9mm; background: #f1f5f1; color: #3b4a3e; font-size: 6.8pt; }
  .code { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 2mm; padding: 1.4mm 2.4mm;
    border: 0.45mm dashed #2a7a37; border-radius: 1.8mm; background: #f3faf3; }
  .code span { font-size: 6.5pt; font-weight: 600; color: #4b5b4e; text-transform: uppercase; letter-spacing: 0.2mm; }
  .code b { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13.5pt; letter-spacing: 0.6mm; color: #17251a; }
  footer { display: flex; flex-direction: column; gap: 0.2mm; font-size: 6.3pt; color: #5d6b60; line-height: 1.3; }
  footer b { color: #23703a; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>
${sheets.map((s) => `<section class="sheet">${s.map((c) => ticket(c, shop, t, locale)).join('')}</section>`).join('\n')}
</body></html>`
}
