-- TRASTAR prototype schema. Development only; never apply to an unidentified database.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  brand TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  export_allowed BOOLEAN NOT NULL DEFAULT false,
  weight_grams INTEGER NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
  length_cm NUMERIC(8,2), width_cm NUMERIC(8,2), height_cm NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL UNIQUE,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  unit_price_idr BIGINT NOT NULL CHECK (unit_price_idr >= 0),
  stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK(stock_on_hand >= 0),
  stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK(stock_reserved >= 0 AND stock_reserved <= stock_on_hand),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE TABLE IF NOT EXISTS product_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  min_qty INTEGER NOT NULL CHECK(min_qty >= 2),
  unit_price_idr BIGINT NOT NULL CHECK(unit_price_idr >= 0),
  UNIQUE(variant_id,min_qty)
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  shipping_address JSONB NOT NULL,
  shipping_country CHAR(2) NOT NULL,
  shipping_provider TEXT NOT NULL,
  shipping_service TEXT NOT NULL,
  shipping_cost_idr BIGINT NOT NULL CHECK(shipping_cost_idr >= 0),
  subtotal_idr BIGINT NOT NULL CHECK(subtotal_idr >= 0),
  total_idr BIGINT NOT NULL CHECK(total_idr >= 0),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(payment_status IN ('PENDING','PAID','FAILED','EXPIRED','REFUNDED')),
  fulfillment_status TEXT NOT NULL DEFAULT 'UNFULFILLED' CHECK(fulfillment_status IN ('UNFULFILLED','PROCESSING','SHIPPED','DELIVERED','CANCELLED')),
  is_simulation BOOLEAN NOT NULL DEFAULT true,
  access_token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  sku_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_idr BIGINT NOT NULL CHECK(unit_price_idr >= 0),
  line_total_idr BIGINT NOT NULL CHECK(line_total_idr >= 0)
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT,
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','PAID','FAILED','REFUNDED')),
  amount_idr BIGINT NOT NULL CHECK(amount_idr >= 0),
  raw_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_transaction_id)
);
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_id UUID REFERENCES orders(id),
  UNIQUE(provider,event_id)
);
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  tracking_no TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  tracking_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_scrypt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK(role IN ('OWNER','ADMIN','STAFF')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES variants(id),
  order_id UUID REFERENCES orders(id),
  delta_reserved INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
