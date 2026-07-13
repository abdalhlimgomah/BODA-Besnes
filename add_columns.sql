-- إضافة أعمدة الصور (1-8) والفيديو لكل جداول المنتجات
-- شغّل هذا الملف في Supabase SQL Editor
DO $$
DECLARE
  tables text[] := ARRAY['products', 'my_products', 'partner_products', 'seller_products', 'product'];
  t text;
  i int;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = t) THEN
      BEGIN
        -- img1-8
        FOR i IN 1..8 LOOP
          EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS img%d TEXT DEFAULT ''''', t, i);
        END LOOP;
        -- image1-8
        FOR i IN 1..8 LOOP
          EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS image%d TEXT DEFAULT ''''', t, i);
        END LOOP;
        -- image_link1-8
        FOR i IN 1..8 LOOP
          EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS image_link%d TEXT DEFAULT ''''', t, i);
        END LOOP;
        -- video fields
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT ''''', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS video TEXT DEFAULT ''''', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS product_video TEXT DEFAULT ''''', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS video_link TEXT DEFAULT ''''', t);
        RAISE NOTICE 'تم تحديث الجدول: %', t;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'خطأ في الجدول %: %', t, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
