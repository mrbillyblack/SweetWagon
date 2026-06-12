import type { CheckInPayload, CheckInRecord, Location } from './types';

const BASE = '/api';

export async function fetchLocations(): Promise<Location[]> {
  const res = await fetch(`${BASE}/locations`);
  if (!res.ok) throw new Error(`Failed to fetch locations: ${res.status}`);
  return res.json();
}

export async function fetchCheckins(locationId: string): Promise<CheckInRecord[]> {
  const res = await fetch(`${BASE}/checkins/${locationId}?limit=100`);
  if (!res.ok) throw new Error(`Failed to fetch check-ins: ${res.status}`);
  return res.json();
}

export async function submitCheckin(payload: CheckInPayload): Promise<void> {
  const res = await fetch(`${BASE}/checkins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `Submit failed: ${res.status}`);
  }
}
