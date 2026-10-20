/** Product options (colour, size…) and their combinations, for the product editor. */

/** One option the product comes in (e.g. Colour) and its values (Red, Blue…), in order. */
export interface OptionGroup {
  uid: string
  name: string
  values: string[]
}

/** Price/stock/SKU of one combination (e.g. Red · M). */
export interface VariantCell {
  id?: string
  sku: string
  /** SKU follows the product SKU until the seller edits it. */
  autoSku: boolean
  price: string
  stock: string
}

export const comboKey = (values: string[]) => values.join('\u0000')

/** Every combination of the options' values, in order (Red S, Red M, … Blue S…). */
export function combinations(options: OptionGroup[]): string[][] {
  const usable = options.filter((o) => o.values.length)
  if (!usable.length) return []
  return usable.reduce<string[][]>((acc, o) => acc.flatMap((c) => o.values.map((v) => [...c, v])), [[]])
}

/** "TSHIRT-RED-M" from the product SKU and the values. */
export function autoSku(base: string, values: string[]): string {
  const part = (v: string) =>
    v
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '')
      .toUpperCase()
      .slice(0, 12)
  // Lao (or other non-Latin) values get a short code made from the text, so "ແດງ" and "ດຳ" differ.
  const code = (v: string) => [...v].reduce((h, ch) => (h * 31 + ch.codePointAt(0)!) >>> 0, 7).toString(36).toUpperCase().slice(0, 5)
  const tail = values.map((v) => part(v) || code(v)).join('-')
  return `${base.trim() || 'SKU'}-${tail}`.slice(0, 64)
}

export const blankCell = (): VariantCell => ({ sku: '', autoSku: true, price: '', stock: '0' })

/** Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L), as coupon codes. */
const SKU_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A random 8-character SKU with at least one letter and one digit, e.g. "K7QM2XHP". */
export function randomSku(): string {
  for (;;) {
    const sku = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => SKU_CHARS[b % SKU_CHARS.length]).join('')
    if (/[A-Z]/.test(sku) && /\d/.test(sku)) return sku
  }
}
