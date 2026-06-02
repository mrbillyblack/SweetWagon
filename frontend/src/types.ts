export interface Location {
  id: string;
  name: string;
  address: string;
  borough: string;
  lat: number;
  lng: number;
  wait_minutes: number;
  scraped_at: string;
  source: string;
  community_wait_minutes: number | null;
  community_report_count: number;
  display_wait_minutes: number;
  busyness_index: number | null;
}

export interface CheckInRecord {
  checkin_id: string;
  location_id: string;
  arrived_at: string;
  busyness: number | null;
  wait_minutes: number | null;
  been_seen: boolean;
  submitted_at: string;
  comment: string | null;
}

export interface CheckInPayload {
  location_id: string;
  arrived_minutes_ago: number;
  busyness?: number;
  comment?: string;
}

export type PinColor = 'green' | 'yellow' | 'red';

export function pinColor(waitMinutes: number): PinColor {
  if (waitMinutes < 7) return 'green';
  if (waitMinutes < 15) return 'yellow';
  return 'red';
}

export function pinSpeed(waitMinutes: number): 'slow' | 'medium' | 'fast' {
  if (waitMinutes < 7) return 'slow';
  if (waitMinutes < 25) return 'medium';
  return 'fast';
}

export const BUSYNESS_LABELS = ['Lightly populated', 'Moderately populated', 'Severely populated'] as const;
