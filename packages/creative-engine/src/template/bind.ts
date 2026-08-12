import type { BindablePath, TemplateDocument } from './schema.js'

/**
 * Resolving template bindings against real campaign data.
 *
 * The data a template may read is a flat, explicitly-constructed object — not
 * the Prisma rows themselves. Handing a template the live records would mean any
 * future column becomes bindable by accident, and "print this on a public
 * poster" is the wrong default for a database row.
 */

export interface CreativeData {
  product?: {
    name?: string | null
    brand?: string | null
    description?: string | null
    sku?: string | null
    /** Minor units — paise, cents. Formatted at render time, never before. */
    mrpMinor?: number | null
    salePriceMinor?: number | null
    currency?: string | null
    imageUrl?: string | null
  }
  campaign?: {
    name?: string | null
    theme?: string | null
    primaryOffer?: string | null
    secondaryOffer?: string | null
    couponCode?: string | null
    cta?: string | null
  }
  brand?: {
    displayName?: string | null
    logoUrl?: string | null
    disclaimer?: string | null
  }
  visual?: {
    url?: string | null
  }
}

/**
 * Format minor units as currency.
 *
 * Money is carried in minor units end to end and formatted only here. A price
 * that has been through a float is a price that can print as ₹1,869.99 on an
 * advertisement, and there is no recovering from that after it publishes.
 */
export function formatMoney(minor: number, currency: string): string {
  const major = minor / 100
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }
  const symbol = symbols[currency] ?? `${currency} `
  // Whole amounts print without decimals — "₹1,870", not "₹1,870.00", which is
  // how prices are actually written on retail creative.
  const body = Number.isInteger(major)
    ? major.toLocaleString('en-IN')
    : major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${symbol}${body}`
}

/**
 * Discount is derived here and never stored.
 *
 * A persisted discount can disagree with the two prices beside it, and the
 * result is a false claim printed on advertising. Deriving it makes that
 * impossible by construction.
 */
export function discountPercent(
  mrpMinor?: number | null,
  saleMinor?: number | null,
): number | null {
  if (!mrpMinor || !saleMinor) return null
  if (mrpMinor <= 0 || saleMinor >= mrpMinor) return null
  return Math.round(((mrpMinor - saleMinor) / mrpMinor) * 100)
}

/** Resolve one whitelisted path. Returns null for anything absent or blank. */
export function resolvePath(path: BindablePath, data: CreativeData): string | null {
  const currency = data.product?.currency ?? 'INR'
  const trim = (v: string | null | undefined): string | null => {
    const s = v?.trim()
    return s && s.length > 0 ? s : null
  }

  switch (path) {
    case 'product.name':
      return trim(data.product?.name)
    case 'product.brand':
      return trim(data.product?.brand)
    case 'product.description':
      return trim(data.product?.description)
    case 'product.sku':
      return trim(data.product?.sku)
    case 'product.currency':
      return currency
    case 'product.imageUrl':
      return trim(data.product?.imageUrl)
    case 'product.mrp':
      return data.product?.mrpMinor != null ? formatMoney(data.product.mrpMinor, currency) : null
    case 'product.salePrice':
      return data.product?.salePriceMinor != null
        ? formatMoney(data.product.salePriceMinor, currency)
        : null
    case 'product.discountPercent': {
      const pct = discountPercent(data.product?.mrpMinor, data.product?.salePriceMinor)
      return pct === null ? null : `${String(pct)}%`
    }
    case 'campaign.name':
      return trim(data.campaign?.name)
    case 'campaign.theme':
      return trim(data.campaign?.theme)
    case 'campaign.primaryOffer':
      return trim(data.campaign?.primaryOffer)
    case 'campaign.secondaryOffer':
      return trim(data.campaign?.secondaryOffer)
    case 'campaign.couponCode':
      return trim(data.campaign?.couponCode)
    case 'campaign.cta':
      return trim(data.campaign?.cta)
    case 'brand.displayName':
      return trim(data.brand?.displayName)
    case 'brand.logoUrl':
      return trim(data.brand?.logoUrl)
    case 'brand.disclaimer':
      return trim(data.brand?.disclaimer)
    case 'visual.url':
      return trim(data.visual?.url)
  }
}

/**
 * Slot ids hidden by the template's rules for this data.
 *
 * Evaluated once before rendering rather than per slot, so a rule referring to a
 * slot that no longer exists is simply inert instead of throwing mid-render.
 */
export function hiddenSlots(template: TemplateDocument, data: CreativeData): Set<string> {
  const hidden = new Set<string>()
  for (const rule of template.rules) {
    const value = resolvePath(rule.when.path, data)
    const matches = rule.when.is === 'empty' ? value === null : value !== null
    if (matches) for (const id of rule.hide) hidden.add(id)
  }
  return hidden
}
