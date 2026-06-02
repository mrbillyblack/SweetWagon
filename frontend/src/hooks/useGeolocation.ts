import { useState } from 'react';

export type GeolocationState =
  | { status: 'idle' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ status: 'idle' });

  function request() {
    if (!navigator.geolocation) {
      setState({ status: 'error', message: 'Geolocation not supported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ status: 'granted', lat: pos.coords.latitude, lng: pos.coords.longitude }),
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

  function dismiss() {
    setState({ status: 'denied' });
  }

  return { state, request, dismiss };
}
