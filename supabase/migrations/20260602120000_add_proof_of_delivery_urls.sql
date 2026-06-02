-- Demo DB: multi-proof URLs for Review Orders extension and legacy readers
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS proof_of_delivery_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE orders o
SET proof_of_delivery_urls = x.arr
FROM (
  SELECT
    id,
    CASE
      WHEN proof_of_delivery_url IS NOT NULL AND btrim(proof_of_delivery_url::text) <> ''
        THEN jsonb_build_array(btrim(proof_of_delivery_url::text))
      ELSE '[]'::jsonb
    END AS arr
  FROM orders
) x
WHERE o.id = x.id
  AND (o.proof_of_delivery_urls IS NULL OR o.proof_of_delivery_urls = '[]'::jsonb);

CREATE INDEX IF NOT EXISTS idx_orders_proof_of_delivery_urls_gin
  ON orders USING GIN (proof_of_delivery_urls);

COMMENT ON COLUMN orders.proof_of_delivery_urls IS 'Ordered list of delivery proof image URLs (JSON array of strings).';
