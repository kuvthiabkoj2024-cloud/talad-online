import { formatPhone, provinceName, type Locale } from '@talad/shared'
import type { Dict } from '@/i18n/en'
import { code128Svg } from './barcode'
import { fill, formatDate, formatMoney } from './format'
import type { ShopOrderDetail } from './types'

/** The shop details printed on bills and stickers. */
export interface PrintShop {
  name: string
  logoUrl: string | null
  phone: string
  email: string
  address: string | null
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** A barcode, or nothing if the text can't be encoded (e.g. non-Latin tracking numbers). */
function barcode(text: string, opts: { height: number; module?: number }) {
  try {
    return code128Svg(text, opts)
  } catch {
    return ''
  }
}

export const FONT = `system-ui, -apple-system, 'Noto Sans Lao', 'Phetsarath OT', 'Lao Sangam MN', 'Segoe UI', sans-serif`

function addressLines(o: ShopOrderDetail, locale: Locale) {
  const a = o.shippingAddress
  return {
    name: a?.recipientName ?? o.customer.name,
    phone: formatPhone(a?.phone ?? o.customer.phone ?? ''),
    street: a ? [a.line, a.village].filter(Boolean).join(', ') : '',
    area: a ? [a.district, provinceName(a.province, locale)].filter(Boolean).join(', ') : '',
    province: a ? provinceName(a.province, locale) : '',
  }
}

/** Is cash still to be collected at the door, and how much? */
function cod(o: ShopOrderDetail) {
  const due = o.payment?.method === 'COD' && o.payment.status !== 'PAID'
  return { due, amount: o.total }
}

/** A4 bill (invoice) with the shop, customer, delivery, payment, every item and the totals. */
export function billHtml(o: ShopOrderDetail, shop: PrintShop, t: Dict, locale: Locale): string {
  const p = t.print
  const to = addressLines(o, locale)
  const pay = cod(o)
  const paid = o.payment?.status === 'PAID'
  const units = o.items.reduce((n, i) => n + i.quantity, 0)
  const rows = o.items
    .map(
      (i, n) => `<tr>
  <td class="num">${n + 1}</td>
  <td><div class="prod">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="">` : '<span class="ph"></span>'}<div><b>${esc(i.name)}</b>${i.variant ? `<span class="var">${esc(i.variant)}</span>` : ''}<span class="sku">SKU ${esc(i.sku)}</span></div></div></td>
  <td class="r">${esc(formatMoney(i.unitPrice, locale))}</td>
  <td class="c">${i.quantity}</td>
  <td class="r b">${esc(formatMoney(i.lineTotal, locale))}</td>
</tr>`,
    )
    .join('')
  const statusLabel = t.orders.status[o.status]
  const payMethod = o.payment ? t.orders.methods[o.payment.method] : '—'
  const payStatus = o.payment ? t.orders.paymentStatus[o.payment.status] : ''
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(p.bill)} ${esc(o.number)}</title>
<style>
@page { size: A4; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${FONT}; color: #1a1d1a; font-size: 10.5pt; line-height: 1.45; }
.brand { color: #2e7d32; }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 14px; border-bottom: 3px solid #2e7d32; }
.shop { display: flex; gap: 12px; align-items: center; }
.logo { width: 58px; height: 58px; border-radius: 14px; object-fit: cover; border: 1px solid #e3e8e3; }
.logo.ph { background: #2e7d32; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 22pt; }
.shop h1 { margin: 0 0 2px; font-size: 17pt; line-height: 1.2; }
.muted { color: #687068; }
.small { font-size: 9pt; }
.doc { text-align: right; }
.doc .title { font-size: 22pt; font-weight: 800; letter-spacing: .04em; color: #2e7d32; line-height: 1; }
.doc .no { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12pt; font-weight: 700; margin-top: 6px; }
.doc svg { height: 34px; width: 210px; margin-top: 6px; }
.chip { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 8.5pt; font-weight: 700; background: #e8f5e9; color: #2e7d32; }
.chip.warn { background: #fff4e5; color: #b45309; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
.card { border: 1px solid #e3e8e3; border-radius: 10px; padding: 10px 12px; background: #fbfdfb; }
.card h3 { margin: 0 0 6px; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #2e7d32; }
.card .big { font-size: 11.5pt; font-weight: 700; }
.kv { display: flex; justify-content: space-between; gap: 8px; }
table { width: 100%; border-collapse: collapse; }
thead th { background: #2e7d32; color: #fff; font-size: 8.5pt; font-weight: 600; text-align: left; padding: 7px 8px; }
thead th:first-child { border-radius: 8px 0 0 8px; } thead th:last-child { border-radius: 0 8px 8px 0; }
tbody td { padding: 8px; border-bottom: 1px solid #eef1ee; vertical-align: middle; }
tbody tr:nth-child(even) td { background: #f8faf8; }
.prod { display: flex; gap: 10px; align-items: center; }
.prod img, .prod .ph { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; border: 1px solid #e3e8e3; flex: none; background: #f0f3f0; }
.prod b { display: block; }
.var { display: inline-block; margin-top: 2px; padding: 0 7px; border-radius: 99px; background: #eef1ee; font-size: 8.5pt; }
.sku { display: block; color: #687068; font-size: 8pt; font-family: ui-monospace, Menlo, monospace; }
.num { width: 26px; color: #687068; } .c { text-align: center; width: 54px; } .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; }
.bottom { display: grid; grid-template-columns: 1fr 260px; gap: 16px; margin-top: 14px; align-items: start; }
.note { border: 1px dashed #c9d2c9; border-radius: 10px; padding: 10px 12px; }
.totals { border: 1px solid #e3e8e3; border-radius: 10px; padding: 10px 12px; }
.totals .kv { padding: 3px 0; }
.grand { border-top: 2px solid #1a1d1a; margin-top: 6px; padding-top: 8px; font-size: 14pt; font-weight: 800; }
.grand span:last-child { color: #2e7d32; }
.stamp { margin-top: 10px; text-align: center; border-radius: 10px; padding: 8px; font-weight: 800; letter-spacing: .03em; }
.stamp.cod { background: #1a1d1a; color: #fff; font-size: 12pt; }
.stamp.cod small { display: block; font-weight: 500; font-size: 8.5pt; opacity: .85; }
.stamp.paid { border: 2.5px solid #2e7d32; color: #2e7d32; font-size: 15pt; transform: rotate(-2deg); }
.stamp.due { border: 2px dashed #b45309; color: #b45309; font-size: 12pt; }
footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e3e8e3; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.thanks { font-size: 12pt; font-weight: 700; color: #2e7d32; }
</style></head><body>
<header>
  <div class="shop">
    ${shop.logoUrl ? `<img class="logo" src="${esc(shop.logoUrl)}" alt="">` : `<div class="logo ph">${esc(shop.name.trim().charAt(0).toUpperCase())}</div>`}
    <div>
      <h1>${esc(shop.name)}</h1>
      ${shop.address ? `<div class="small muted">${esc(shop.address)}</div>` : ''}
      <div class="small muted">${esc(formatPhone(shop.phone))} · ${esc(shop.email)}</div>
    </div>
  </div>
  <div class="doc">
    <div class="title">${esc(p.billTitle)}</div>
    <div class="no">${esc(o.number)}</div>
    ${barcode(o.number, { height: 34, module: 1 })}
    <div class="small muted">${esc(p.orderDate)}: ${esc(formatDate(o.createdAt, locale, true))}</div>
    <div style="margin-top:4px"><span class="chip">${esc(statusLabel)}</span></div>
  </div>
</header>

<div class="cards">
  <div class="card">
    <h3>${esc(p.customer)}</h3>
    <div class="big">${esc(o.customer.name)}</div>
    ${o.customer.phone ? `<div>${esc(formatPhone(o.customer.phone))}</div>` : ''}
  </div>
  <div class="card">
    <h3>${esc(p.shipTo)}</h3>
    <div class="big">${esc(to.name)}</div>
    <div>${esc(to.phone)}</div>
    ${to.street ? `<div class="small">${esc(to.street)}</div>` : ''}
    ${to.area ? `<div class="small"><b>${esc(to.area)}</b></div>` : ''}
  </div>
  <div class="card">
    <h3>${esc(p.payment)} · ${esc(p.delivery)}</h3>
    <div class="kv"><span>${esc(payMethod)}</span><span class="chip ${paid ? '' : 'warn'}">${esc(payStatus)}</span></div>
    <div class="kv small" style="margin-top:6px"><span class="muted">${esc(t.orders.courier)}</span><span>${esc(o.deliveryProvider?.name ?? p.noCourier)}</span></div>
    ${o.trackingNumber ? `<div class="kv small"><span class="muted">${esc(p.tracking)}</span><span style="font-family:ui-monospace,Menlo,monospace">${esc(o.trackingNumber)}</span></div>` : ''}
  </div>
</div>

<table>
  <thead><tr><th>#</th><th>${esc(p.product)}</th><th class="r">${esc(p.unitPrice)}</th><th class="c">${esc(p.qty)}</th><th class="r">${esc(p.amount)}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="bottom">
  <div>
    ${o.note ? `<div class="note"><div class="small muted">${esc(p.note)}</div><div>${esc(o.note)}</div></div>` : ''}
    <p class="small muted" style="margin:10px 0 0">${esc(units === 1 ? p.item : fill(p.items, { n: units }))} · ${esc(p.shippingNote)}</p>
  </div>
  <div class="totals">
    <div class="kv"><span class="muted">${esc(p.subtotal)}</span><span>${esc(formatMoney(o.subtotal, locale))}</span></div>
    ${o.discountTotal > 0 ? `<div class="kv"><span class="muted">${esc(p.discount)}</span><span>−${esc(formatMoney(o.discountTotal, locale))}</span></div>` : ''}
    ${o.shippingFee > 0 ? `<div class="kv"><span class="muted">${esc(p.shipping)}</span><span>${esc(formatMoney(o.shippingFee, locale))}</span></div>` : ''}
    <div class="kv grand"><span>${esc(p.total)}</span><span>${esc(formatMoney(o.total, locale))}</span></div>
    ${
      pay.due
        ? `<div class="stamp cod">${esc(formatMoney(pay.amount, locale))}<small>${esc(p.toCollect)}</small></div>`
        : paid
          ? `<div class="stamp paid">✓ ${esc(p.paid)}</div>`
          : o.payment
            ? `<div class="stamp due">${esc(p.awaitingPayment)}</div>`
            : ''
    }
  </div>
</div>

<footer>
  <div class="thanks">${esc(p.thanks)}</div>
  <div class="small muted" style="text-align:right">${esc(p.footer)}<br>${esc(p.printed)}: ${esc(formatDate(new Date().toISOString(), locale, true))}</div>
</footer>
</body></html>`
}

/**
 * 100 × 150 mm shipping sticker (the common thermal label size; also prints on A6), in
 * black only so thermal printers render it sharply: courier + tracking barcode, a big
 * recipient block, the sender, the cash to collect, and what's inside.
 */
export function stickerHtml(o: ShopOrderDetail, shop: PrintShop, t: Dict, locale: Locale): string {
  const p = t.print
  const to = addressLines(o, locale)
  const pay = cod(o)
  const paid = o.payment?.status === 'PAID'
  const units = o.items.reduce((n, i) => n + i.quantity, 0)
  const shown = o.items.slice(0, 4)
  const itemText = (i: ShopOrderDetail['items'][number]) => `${esc(i.name)}${i.variant ? ` · ${esc(i.variant)}` : ''}`
  const code = o.trackingNumber || o.number
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(p.sticker)} ${esc(o.number)}</title>
<style>
@page { size: 100mm 150mm; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; }
body { font-family: ${FONT}; color: #000; font-size: 9pt; line-height: 1.3; }
.label { width: 100mm; height: 150mm; padding: 4mm; display: flex; flex-direction: column; gap: 2mm; overflow: hidden; }
.box { border: 0.5mm solid #000; border-radius: 2mm; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 2mm; }
.courier { font-size: 15pt; font-weight: 800; line-height: 1.1; }
.date { font-size: 8pt; text-align: right; }
.code { text-align: center; padding: 1.5mm 2mm 1mm; }
.code svg { width: 100%; height: 12mm; display: block; }
.code .txt { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11pt; font-weight: 700; letter-spacing: .08em; margin-top: 1mm; }
.code .lbl { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; }
.to { padding: 2mm 3mm; border-width: 0.8mm; }
.tag { display: inline-block; background: #000; color: #fff; font-weight: 800; font-size: 8pt; padding: 0.4mm 2mm; border-radius: 1mm; letter-spacing: .06em; }
.name { font-size: 15pt; font-weight: 800; margin-top: 1.5mm; line-height: 1.15; }
.phone { font-size: 14pt; font-weight: 800; font-family: ui-monospace, Menlo, monospace; margin-top: 0.5mm; }
.addr { font-size: 10pt; margin-top: 1mm; }
.prov { font-size: 13pt; font-weight: 800; margin-top: 0.5mm; }
.from { padding: 2mm 3mm; font-size: 8.5pt; }
.from b { font-size: 9.5pt; }
.row { display: flex; gap: 2.5mm; }
.cod { flex: 1; background: #000; color: #fff; border-radius: 2mm; padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: center; }
.cod .amt { font-size: 17pt; font-weight: 900; line-height: 1.1; }
.cod .lbl { font-size: 8pt; font-weight: 700; letter-spacing: .04em; }
.paid { flex: 1; border: 0.8mm solid #000; border-radius: 2mm; padding: 2mm 3mm; display: flex; align-items: center; justify-content: center; font-size: 15pt; font-weight: 900; }
.order { width: 38mm; padding: 1.5mm 2mm; display: flex; flex-direction: column; justify-content: center; }
.order .lbl { font-size: 7.5pt; font-weight: 700; }
/* The big barcode above already encodes this number when there's no tracking number. */
.order .no { font-family: ui-monospace, Menlo, monospace; font-size: 10pt; font-weight: 800; letter-spacing: .02em; word-break: break-all; line-height: 1.15; }
.items { padding: 2mm 3mm; flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.items .tag { align-self: flex-start; }
.summary { flex: none; margin-top: 1mm; font-size: 8pt; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.summary b { white-space: nowrap; }
.items ul { flex: none; margin: 1mm 0 0; padding: 0; list-style: none; }
.items li { display: flex; justify-content: space-between; gap: 2mm; padding: 0.4mm 0; border-bottom: 0.2mm dotted #000; }
.items li span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.items li span:last-child { font-weight: 800; white-space: nowrap; }
.note { border: 0.4mm dashed #000; border-radius: 1.5mm; padding: 1.2mm 2mm; font-size: 8pt; flex: none; margin: 1mm 0 0.5mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { display: flex; justify-content: space-between; font-size: 7pt; flex: none; }
</style></head><body>
<div class="label">
  <div class="top">
    <div class="courier">${esc(o.deliveryProvider?.name ?? p.noCourier)}</div>
    <div class="date">${esc(formatDate(o.createdAt, locale))}<br><b>${esc(units === 1 ? p.item : fill(p.items, { n: units }))}</b></div>
  </div>

  <div class="box code">
    ${barcode(code, { height: 60, module: 2 })}
    <div class="txt">${esc(code)}</div>
    <div class="lbl">${esc(o.trackingNumber ? p.tracking : p.order)}</div>
  </div>

  <div class="box to">
    <span class="tag">${esc(p.to)}</span>
    <div class="name">${esc(to.name)}</div>
    <div class="phone">${esc(to.phone)}</div>
    ${to.street ? `<div class="addr">${esc(to.street)}</div>` : ''}
    ${to.area ? `<div class="prov">${esc(to.area)}</div>` : ''}
  </div>

  <div class="box from">
    <span class="tag">${esc(p.from)}</span>
    <b> ${esc(shop.name)}</b> · ${esc(formatPhone(shop.phone))}
    ${shop.address ? `<div>${esc(shop.address)}</div>` : ''}
  </div>

  <div class="row">
    ${pay.due ? `<div class="cod"><span class="lbl">${esc(p.cod)}</span><span class="amt">${esc(formatMoney(pay.amount, locale))}</span></div>` : `<div class="paid">${paid ? `✓ ${esc(p.paid)}` : esc(p.awaitingPayment)}</div>`}
    <div class="box order"><div class="lbl">${esc(p.order)}</div><div class="no">${esc(o.number)}</div></div>
  </div>

  <div class="box items">
    <span class="tag">${esc(p.product)}</span>
    ${
      o.note
        ? // The courier's instructions come first; the items shrink to a two-line summary.
          `<div class="note"><b>${esc(p.note)}:</b> ${esc(o.note)}</div>
    <div class="summary">${o.items.map((i) => `${itemText(i)} <b>× ${i.quantity}</b>`).join(', ')}</div>`
        : `<ul>${shown.map((i) => `<li><span>${itemText(i)}</span><span>× ${i.quantity}</span></li>`).join('')}</ul>
    ${o.items.length > shown.length ? `<div style="margin-top:0.5mm;font-weight:700">${esc(fill(p.more, { n: o.items.length - shown.length }))}</div>` : ''}`
    }
  </div>

  <div class="foot"><span>${esc(p.footer)}</span><span>${esc(formatDate(new Date().toISOString(), locale, true))}</span></div>
</div>
</body></html>`
}

/**
 * Prints `html` from a hidden frame (no pop-up to block), once its images have loaded.
 * Works with any printer, a thermal label printer, or "Save as PDF".
 */
/** Longer than the menus' and dialogs' close animations (~200 ms). */
const UI_SETTLE_MS = 350

export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' })
  document.body.append(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  const images = [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => ((img.onload = () => r()), (img.onerror = () => r())))))
  // Don't wait forever on a slow image. Also let the menu or dialog that started this finish
  // closing first: print() blocks the page, and a dialog frozen mid-close stays on screen with
  // the page unclickable.
  const settled = new Promise((r) => setTimeout(r, UI_SETTLE_MS))
  void Promise.all([settled, Promise.race([Promise.all(images), new Promise((r) => setTimeout(r, 4000))])]).then(() => {
    const win = frame.contentWindow!
    win.focus()
    win.print()
    // Belt and braces: a modal that was still closing leaves the page locked; free it.
    if (!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) document.body.style.pointerEvents = ''
    // Removed once printing is done (some browsers return from print() before that).
    win.addEventListener('afterprint', () => frame.remove())
    setTimeout(() => frame.remove(), 60_000)
  })
}
