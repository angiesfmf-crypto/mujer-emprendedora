CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  business VARCHAR(160) NOT NULL, phone VARCHAR(40) NOT NULL DEFAULT '',
  location VARCHAR(160) NOT NULL DEFAULT '', activity VARCHAR(100) NOT NULL DEFAULT '',
  digital_level VARCHAR(60) NOT NULL DEFAULT 'Inicial', role VARCHAR(20) NOT NULL DEFAULT 'entrepreneur' CHECK (role IN ('entrepreneur','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL, category VARCHAR(100) NOT NULL DEFAULT 'General',
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_user_idx ON products(user_id);
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0), total NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  client_mutation_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, client_mutation_id)
);
CREATE INDEX IF NOT EXISTS sales_user_created_idx ON sales(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS course_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id VARCHAR(80) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,course_id)
);
CREATE TABLE IF NOT EXISTS sync_mutations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, mutation_id UUID NOT NULL,
  mutation_type VARCHAR(50) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,mutation_id)
);
