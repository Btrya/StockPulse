import { useState, useEffect } from 'react';
import { fetchSectors } from '../lib/api';

export default function useSectors() {
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSectors()
      .then(res => setSectors(res.data || []))
      .catch(err => console.error('Failed to load sectors:', err))
      .finally(() => setLoading(false));
  }, []);

  return { sectors, loading };
}
