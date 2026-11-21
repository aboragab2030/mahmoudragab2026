-- The home page's top photos and partner cards now come from the database; start with the
-- same items the site showed before so visitors see no change. Skipped if items already exist.
INSERT INTO public.hero_images (url, created_at)
SELECT v.url, now() + (v.ord * interval '1 millisecond')
FROM (VALUES
  (1, 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=1920'),
  (2, 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=1920'),
  (3, 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&q=80&w=1920')
) AS v(ord, url)
WHERE NOT EXISTS (SELECT 1 FROM public.hero_images);

INSERT INTO public.partners (name, logo, description, created_at)
SELECT v.name, v.logo, v.description, now() + (v.ord * interval '1 millisecond')
FROM (VALUES
  (1, 'شركة مصر للتأمين', 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&q=80&w=300&h=300', 'تغطية شاملة للكشف والعمليات الجراحية'),
  (2, 'نقابة المهندسين', 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=300&h=300', 'خصم خاص 25% للأعضاء وأسرهم'),
  (3, 'ميدنت (MedNet)', 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=300&h=300', 'الشبكة الطبية المعتمدة (Class A & B)')
) AS v(ord, name, logo, description)
WHERE NOT EXISTS (SELECT 1 FROM public.partners);