import { useCallback, useEffect, useState } from 'react';
import { fetchLocations } from '../api';
import type { Location } from '../types';

const POLL_INTERVAL = 60_000; // 1 minute

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchLocations();
      setLocations(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  return { locations, loading, error, refresh: load };
}
