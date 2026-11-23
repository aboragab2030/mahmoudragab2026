import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isMissingOffersTableError, OFFERS_CHANGED_EVENT, readFallbackOffers } from '@/barada/offers';

// Public clinic content every visitor sees, signed in or not. The database is the only
// source; `null` means "still loading".
export interface PublicSiteData {
  doctors: any[] | null;
  services: any[] | null;
  offers: any[] | null;
  heroImages: any[] | null;
  partners: any[] | null;
  settings: any | null;
}

type PublicTable = 'doctors' | 'services' | 'offers' | 'heroImages' | 'partners' | 'settings';

const fetchers: Record<PublicTable, () => Promise<any>> = {
  doctors: async () => (await supabase.from('doctors').select('*').order('name', { ascending: true })).data ?? [],
  services: async () => (await supabase.from('services').select('*').order('title', { ascending: true })).data ?? [],
  offers: async () => {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingOffersTableError(error)) return readFallbackOffers();
      return [];
    }
    return data ?? [];
  },
  heroImages: async () => (await supabase.from('hero_images').select('*').order('created_at', { ascending: true })).data ?? [],
  partners: async () => (await supabase.from('partners').select('*').order('created_at', { ascending: true })).data ?? [],
  settings: async () =>
    (await supabase.from('app_settings_public').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()).data ?? {},
};

export function usePublicSiteData() {
  const [data, setData] = useState<PublicSiteData>({
    doctors: null,
    services: null,
    offers: null,
    heroImages: null,
    partners: null,
    settings: null,
  });

  const refresh = useCallback(async (table: PublicTable) => {
    try {
      const rows = await fetchers[table]();
      setData(prev => ({ ...prev, [table]: rows }));
    } catch (err) {
      console.error(`Error loading ${table}:`, err);
      setData(prev => ({ ...prev, [table]: prev[table] ?? (table === 'settings' ? {} : []) }));
    }
  }, []);

  useEffect(() => {
    (Object.keys(fetchers) as PublicTable[]).forEach(refresh);

    // Doctor, service and offer changes made in the dashboard reach open pages right away.
    const channel = supabase
      .channel('barada-public-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctors' }, () => refresh('doctors'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => refresh('services'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, () => refresh('offers'))
      .subscribe();

    const onFallbackChanged = () => {
      void refresh('offers');
    };
    window.addEventListener(OFFERS_CHANGED_EVENT, onFallbackChanged);

    return () => {
      window.removeEventListener(OFFERS_CHANGED_EVENT, onFallbackChanged);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { data, refresh };
}
