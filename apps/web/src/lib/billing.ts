import type { BillingMeta, TenantRow, VariantRow } from '@/lib/types';

export interface CartLine {
  variant: VariantRow;
  qty: number;
  price: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxable: number;
  taxRate: number;
  tax: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface BillOptions {
  discount: number;
  discountIsPercent?: boolean;
  taxRate: number | null;
}

/** Round to 2 decimals, safe for display/calculation. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeTotals(lines: CartLine[], { discount, discountIsPercent, taxRate }: BillOptions): Totals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.qty, 0));
  const disc = discountIsPercent ? round2((subtotal * discount) / 100) : discount;
  const clampedDisc = Math.min(Math.max(disc, 0), subtotal);
  const taxable = round2(subtotal - clampedDisc);
  const rate = Math.max(0, taxRate ?? 0);
  const tax = round2((taxable * rate) / 100);
  const split = round2(tax / 2);
  return {
    subtotal,
    discount: clampedDisc,
    taxable,
    taxRate: rate,
    tax,
    cgst: split,
    sgst: round2(tax - split),
    total: round2(taxable + tax),
  };
}

export function buildBillingMeta(tenant: TenantRow): BillingMeta {
  const address = [tenant.address_line1, tenant.address_line2, tenant.city, tenant.postal_code]
    .filter(Boolean)
    .join(', ');
  return {
    shop_name: tenant.name,
    gstin: tenant.gstin,
    upi_id: tenant.upi_id,
    phone: tenant.phone,
    address: address || null,
    invoice_prefix: tenant.invoice_prefix,
    tax_rate: tenant.tax_rate,
    state_code: tenant.state_code,
  };
}

export function upiPaymentUrl(meta: BillingMeta, amount: number, currency: string, note: string): string {
  const vpa = (meta.upi_id ?? '').trim();
  const base = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(meta.shop_name ?? 'Shop')}`;
  return amount > 0 && vpa
    ? `${base}&am=${amount.toFixed(2)}&cu=${currency}&tn=${encodeURIComponent(note)}`
    : base;
}