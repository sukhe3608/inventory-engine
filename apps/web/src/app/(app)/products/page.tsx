'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app/provider';
import { Card, CardHeader, Button, Badge, Field, inputClass, Modal, Empty } from '@/components/ui';
import { getWord, type WordKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/format';
import type { CategoryRow, ProductRow, VariantRow } from '@/lib/types';

export default function ProductsPage() {
  const app = useApp();
  const w = (k: WordKey) => getWord(app.language, k);
  const canWrite = ['owner', 'manager'].includes(app.role);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<(ProductRow & { category_name?: string })[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [productModal, setProductModal] = useState(false);
  const [variantModal, setVariantModal] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ name: '', category_id: '', description: '' });
  const [variantForm, setVariantForm] = useState({ sku: '', name: '', price: '', cost: '', attributes: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = app.supabase;
    const tenantId = app.tenantId;
    const [catRes, prodRes, varRes] = await Promise.all([
      sb.from('categories').select('*').eq('tenant_id', tenantId).order('name'),
      sb.from('products').select('*, categories(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }) as any,
      sb.from('variants').select('*').eq('tenant_id', tenantId).order('sku'),
    ]);
    setCategories((catRes.data ?? []) as CategoryRow[]);
    setProducts((prodRes.data ?? []) as (ProductRow & { category_name?: string })[]);
    setVariants((varRes.data ?? []) as VariantRow[]);
    setLoading(false);
  }, [app.supabase, app.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addCategory() {
    if (!newCategory.trim()) return;
    const { error } = await app.supabase.from('categories').insert({ tenant_id: app.tenantId, name: newCategory.trim() });
    if (error) return setError(error.message);
    setNewCategory('');
    setError(null);
    load();
  }

  async function addProduct() {
    if (!productForm.name.trim()) return;
    const { data, error } = await app.supabase
      .from('products')
      .insert({ tenant_id: app.tenantId, name: productForm.name.trim(), category_id: productForm.category_id || null, description: productForm.description || null })
      .select('id')
      .single();
    if (error) return setError(error.message);
    setProductModal(false);
    setProductForm({ name: '', category_id: '', description: '' });
    setError(null);
    load();
  }

  async function addVariant(productId: string) {
    if (!variantForm.sku.trim() || !variantForm.price) return;
    let attributes: Record<string, unknown> = {};
    if (variantForm.attributes.trim()) {
      try {
        attributes = JSON.parse(variantForm.attributes);
      } catch {
        return setError('Attributes must be valid JSON');
      }
    }
    const { error } = await app.supabase.from('variants').insert({
      tenant_id: app.tenantId,
      product_id: productId,
      sku: variantForm.sku.trim(),
      name: variantForm.name.trim() || null,
      price: Number(variantForm.price),
      cost: variantForm.cost ? Number(variantForm.cost) : null,
      attributes,
    });
    if (error) return setError(error.message);
    setVariantModal(null);
    setVariantForm({ sku: '', name: '', price: '', cost: '', attributes: '' });
    setError(null);
    load();
  }

  async function saveVariantPrice(v: VariantRow, price: string) {
    const { error } = await app.supabase.from('variants').update({ price: Number(price), updated_at: new Date().toISOString() }).eq('id', v.id);
    if (error) return setError(error.message);
    setError(null);
    load();
  }

  if (loading) return <p className="text-sm text-slate-400">{w('loading')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{w('products')}</h1>
        {canWrite && (
          <Button onClick={() => setProductModal(true)}>{w('addProduct')}</Button>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {canWrite && (
        <Card className="p-5">
          <CardHeader title={w('category')} />
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Field label="New category">
                <input className={inputClass} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </Field>
            </div>
            <Button onClick={addCategory}>{w('create')}</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id}>{c.name}</Badge>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={w('products')} subtitle={`${products.length} products · ${variants.length} variants`} />
        {products.length === 0 ? (
          <Empty message="No products yet" />
        ) : (
          <div className="divide-y divide-slate-100">
            {products.map((p) => {
              const pv = variants.filter((v) => v.product_id === p.id);
              return (
                <div key={p.id} className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{p.name}</span>
                        {p.category_name && <Badge>{p.category_name}</Badge>}
                      </div>
                      <p className="text-sm text-slate-400">{p.description || '—'}</p>
                    </div>
                    {canWrite && (
                      <Button variant="ghost" onClick={() => setVariantModal(p.id)}>+ {w('variants')}</Button>
                    )}
                  </div>
                  {pv.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <table className="w-full text-sm">
                        <tbody>
                          {pv.map((v) => (
                            <tr key={v.id} className="table-row">
                              <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">{v.sku}</td>
                              <td className="py-1.5 pr-3 text-slate-800">{v.name || '—'}</td>
                              <td className="py-1.5 pr-3 text-slate-500">{Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(', ')}</td>
                              <td className="py-1.5 text-right">
                                {canWrite ? (
                                  <input
                                    key={v.price}
                                    type="number"
                                    step="0.01"
                                    defaultValue={v.price}
                                    onBlur={(e) => saveVariantPrice(v, e.target.value)}
                                    className="w-28 ml-auto rounded-md border border-transparent px-2 py-0.5 text-right hover:border-slate-300 tabular-nums"
                                  />
                                ) : (
                                  <span className="tabular-nums">{formatMoney(Number(v.price), app.currency, app.language)}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={productModal} onClose={() => setProductModal(false)} title={w('addProduct')}>
        <div className="space-y-4">
          <Field label={w('name')}>
            <input className={inputClass} value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
          </Field>
          <Field label={w('category')}>
            <select className={inputClass} value={productForm.category_id} onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <textarea className={inputClass} rows={2} value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setProductModal(false)}>{w('cancel')}</Button>
            <Button onClick={addProduct}>{w('create')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!variantModal} onClose={() => setVariantModal(null)} title="Add variant">
        <div className="space-y-4">
          <Field label="SKU">
            <input className={inputClass} value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })} />
          </Field>
          <Field label={w('name')}>
            <input className={inputClass} value={variantForm.name} onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={w('price')}>
              <input type="number" step="0.01" className={inputClass} value={variantForm.price} onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })} />
            </Field>
            <Field label="Cost">
              <input type="number" step="0.01" className={inputClass} value={variantForm.cost} onChange={(e) => setVariantForm({ ...variantForm, cost: e.target.value })} />
            </Field>
          </div>
          <Field label="Attributes (JSON)">
            <input className={inputClass} placeholder="{&quot;color&quot;:&quot;red&quot;}" value={variantForm.attributes} onChange={(e) => setVariantForm({ ...variantForm, attributes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVariantModal(null)}>{w('cancel')}</Button>
            <Button onClick={() => variantModal && addVariant(variantModal)}>{w('create')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}