export type Role = 'owner' | 'manager' | 'staff' | 'read_only';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  default_language: string;
  allow_negative_stock: boolean;
  default_location_id: string | null;
  status: string;
  gstin: string | null;
  state_code: string | null;
  upi_id: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  tax_rate: number;
  enable_tax: boolean;
  invoice_prefix: string;
  created_at: string;
}

export interface MemberRow {
  tenant_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email?: string;
  display_name?: string;
}

export interface ProfileRow {
  user_id: string;
  email: string;
  display_name: string | null;
  language: 'en' | 'hi';
  is_platform_admin: boolean;
}

export interface CategoryRow {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
}

export interface ProductRow {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  active: boolean;
  category_name?: string;
  variants?: VariantRow[];
}

export interface VariantRow {
  id: string;
  tenant_id: string;
  product_id: string;
  sku: string;
  name: string | null;
  barcode: string | null;
  price: number;
  cost: number | null;
  attributes: Record<string, string | number | boolean | null>;
  active: boolean;
}

export interface LocationRow {
  id: string;
  tenant_id: string;
  name: string;
  location_type: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
}

export interface StockLevelRow {
  id: string;
  tenant_id: string;
  variant_id: string;
  location_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  low_stock_threshold: number;
  updated_at: string;
  sku?: string;
  name?: string;
  location_name?: string;
}

export interface StockTransactionRow {
  id: string;
  variant_id: string;
  location_id: string;
  change_qty: number;
  qty_after: number;
  transaction_type: string;
  reference_type: string | null;
  reference_id: string | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
  sku?: string;
  variant_name?: string;
  location_name?: string;
}

export interface OrderRow {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_gstin: string | null;
  status: string;
  currency: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  tax_rate: number;
  billing_meta: BillingMeta;
  source: string;
  created_at: string;
  items?: OrderItemRow[];
}

export interface BillingMeta {
  shop_name?: string;
  gstin?: string | null;
  upi_id?: string | null;
  phone?: string | null;
  address?: string | null;
  invoice_prefix?: string;
  tax_rate?: number;
  state_code?: string | null;
}

export interface OrderItemRow {
  id: string;
  variant_id: string;
  location_id: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  sku?: string;
  variant_name?: string;
}

export interface AlertRow {
  id: string;
  variant_id: string;
  location_id: string;
  threshold: number;
  quantity: number;
  status: string;
  created_at: string;
  sku?: string;
  variant_name?: string;
  location_name?: string;
}

export interface AuditRow {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WidgetConfigRow {
  id: string;
  tenant_id: string;
  widget_key: string;
  title: string;
  show_price: boolean;
  in_stock_label: string;
  low_stock_label: string;
  out_of_stock_label: string;
  accent_color: string;
}

export interface InvitationRow {
  id: string;
  tenant_id: string;
  email: string;
  role: Role;
  token: string;
  status: string;
  created_at: string;
}

export interface OutboxRow {
  id: string;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  next_retry_at: string;
  last_error: string | null;
  created_at: string;
}