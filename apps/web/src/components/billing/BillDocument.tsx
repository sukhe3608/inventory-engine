'use client';

import { formatMoney, formatDate, amountInWords } from '@/lib/format';
import { round2 } from '@/lib/billing';
import type { BillingMeta } from '@/lib/types';
import type { Language } from '@/lib/i18n';
import { UpiQr } from './UpiQr';
import { upiPaymentUrl } from '@/lib/billing';

export interface BillItem {
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface BillData {
  order_number: string;
  created_at: string;
  currency: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_gstin?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  billing_meta: BillingMeta;
  items: BillItem[];
}

export function BillDocument({ bill, language }: { bill: BillData; language: Language }) {
  const { billing_meta: meta } = bill;
  const cgst = round2(bill.tax_amount / 2);
  const sgst = round2(bill.tax_amount - cgst);
  const halfRate = round2(bill.tax_rate / 2);
  const qrValue =
    meta.upi_id && bill.total > 0
      ? upiPaymentUrl(meta, bill.total, bill.currency, `Bill ${bill.order_number}`)
      : '';

  return (
    <div className="bill-sheet">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{meta.shop_name}</h2>
          {meta.address && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{meta.address}</p>}
          <p className="text-sm text-slate-600">
            {[meta.phone, meta.gstin ? `GSTIN: ${meta.gstin}` : null, meta.state_code ? `State: ${meta.state_code}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">Bill</p>
          <p className="text-sm text-slate-600">{bill.order_number}</p>
          <p className="text-sm text-slate-600">{formatDate(bill.created_at, language)}</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
        <p className="font-semibold text-slate-900">Billed to</p>
        <p className="text-slate-700 mt-1">{bill.customer_name || '—'}</p>
        {bill.customer_email && <p className="text-slate-600">{bill.customer_email}</p>}
        {bill.customer_gstin && <p className="text-slate-600">GSTIN: {bill.customer_gstin}</p>}
      </div>

      <table className="w-full mt-5 text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 font-medium text-right">Qty</th>
            <th className="py-2 font-medium text-right">Rate</th>
            <th className="py-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 text-slate-900">
                {it.name}
                {it.sku && <span className="text-xs text-slate-400 ml-1">({it.sku})</span>}
              </td>
              <td className="py-2 text-right tabular-nums text-slate-700">{it.quantity}</td>
              <td className="py-2 text-right tabular-nums text-slate-700">{formatMoney(it.unit_price, bill.currency, language)}</td>
              <td className="py-2 text-right tabular-nums text-slate-900 font-medium">{formatMoney(it.subtotal, bill.currency, language)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-700">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(bill.subtotal, bill.currency, language)}</span>
          </div>
          {bill.discount_amount > 0 && (
            <div className="flex justify-between text-slate-700">
              <span>Discount</span>
              <span className="tabular-nums">− {formatMoney(bill.discount_amount, bill.currency, language)}</span>
            </div>
          )}
          {bill.tax_amount > 0 && (
            <>
              <div className="flex justify-between text-slate-700">
                <span>
                  {bill.tax_rate > 0 ? `CGST @ ${halfRate}%` : 'CGST'}
                </span>
                <span className="tabular-nums">{formatMoney(cgst, bill.currency, language)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>{bill.tax_rate > 0 ? `SGST @ ${halfRate}%` : 'SGST'}</span>
                <span className="tabular-nums">{formatMoney(sgst, bill.currency, language)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-slate-900">
            <span>Grand total</span>
            <span className="tabular-nums">{formatMoney(bill.total, bill.currency, language)}</span>
          </div>
          <p className="text-xs text-slate-500 pt-1">{amountInWords(bill.total)}</p>
        </div>
      </div>

      {qrValue && (
        <div className="mt-6 flex items-center gap-4 rounded-lg border border-slate-200 p-3">
          <UpiQr value={qrValue} />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">Pay with UPI</p>
            <p className="text-slate-600">Scan this QR with any UPI app to pay {formatMoney(bill.total, bill.currency, language)}.</p>
            <p className="text-slate-500 text-xs mt-1 break-all">UPI: {meta.upi_id}</p>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400 text-center">Powered by Inventory Engine · Thank you for your business.</p>
    </div>
  );
}