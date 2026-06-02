import { useState } from 'react';

export type GeolocationState =
  | { status: 'idle' }
  | { status: 'granted'; lat: number; lng: number; label: string }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: 'idle' });

  function request() {
    if (!navigator.geolocation) {
      setState({ status: 'error', message: 'Geolocation not supported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ status: 'granted', lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: 'denied' });
        } else {
          setState({ status: 'error', message: err.message });
        }
      },
      { timeout: 10_000 }
    );
  }

  function setManual(lat: number, lng: number, label: string) {
    setState({ status: 'granted', lat, lng, label });
  }

  function dismiss() {
    setState({ status: 'denied' });
  }

  return { state, request, setManual, dismiss };
}
