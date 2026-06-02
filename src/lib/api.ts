import type { FetchHospitalsResult, Hospital } from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const ENDPOINTS = ["/api/locations", "/api/hospitals", "/hospitals", "/api/wait-times", "/wait-times"];

export async function fetchHospitals(): Promise<FetchHospitalsResult> {
  const attemptedEndpoints: string[] = [];

  for (const endpoint of ENDPOINTS) {
    const url = `${API_BASE_URL}${endpoint}`;
    attemptedEndpoints.push(endpoint);

    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const hospitals = extractHospitalRecords(payload)
        .map((record, index) => normalizeHospital(record, index))
        .filter((hospital): hospital is Hospital => Boolean(hospital));

      if (hospitals.length > 0) {
        return {
          hospitals,
          isDemo: false,
          attemptedEndpoints,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    hospitals: demoHospitals(),
    isDemo: true,
    warning: "Backend unavailable - showing NYC sample data.",
    attemptedEndpoints,
  };
}

export function normalizeHospital(raw: unknown, index = 0): Hospital | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = stringValue(first(raw, ["name", "hospital", "facility", "facility_name", "title"]));
  if (!name) {
    return null;
  }

  const id =
    stringValue(first(raw, ["id", "location_id", "slug", "code"])) ||
    slugify(name) ||
    `hospital-${index + 1}`;
  const waitMinutes = parseWaitMinutes(
    first(raw, [
      "display_wait_minutes",
      "waitMinutes",
      "waitTimeMinutes",
      "wait_time_minutes",
      "wait_minutes",
      "community_wait_minutes",
      "waitTime",
      "wait",
    ]),
  );
  const lat = numberValue(first(raw, ["latitude", "lat"]));
  const lng = numberValue(first(raw, ["longitude", "lng", "lon"]));
  const source = stringValue(first(raw, ["sourceUrl", "source_url", "url", "source"]));

  return {
    id,
    name,
    address: stringValue(first(raw, ["address", "streetAddress", "street_address"])),
    waitMinutes,
    lat,
    lng,
    type: normalizeFacilityType(first(raw, ["type", "category", "facilityType", "facility_type"]), name),
    lastUpdated: stringValue(first(raw, ["lastUpdated", "updated_at", "scraped_at", "last_scraped"])),
    sourceUrl: source?.startsWith("http") ? source : undefined,
  };
}

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7_000);

  return fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: "application/json",
    },
  }).finally(() => window.clearTimeout(timeout));
}

function extractHospitalRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["hospitals", "locations", "data", "waitTimes", "wait_times", "results", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (isRecord(value)) {
      const nested = extractHospitalRecords(value);
      if (nested.length) {
        return nested;
      }
    }
  }

  return payload.name || payload.facility || payload.hospital ? [payload] : [];
}

function normalizeFacilityType(value: unknown, name: string): string {
  const type = stringValue(value)?.trim();
  const readableType = type?.replace(/[_-]+/g, " ");
  const combined = `${readableType || ""} ${name}`.toLowerCase();

  if (combined.includes("pediatric") || combined.includes("children")) {
    return "Pediatric ER";
  }

  if (combined.includes("urgent")) {
    return "Urgent Care";
  }

  if (type && type.toLowerCase().includes("clinic")) {
    return "Clinic";
  }

  if (combined.includes("emergency") || /\ber\b/.test(combined)) {
    return "Emergency Room";
  }

  return readableType || "Emergency Room";
}

function parseWaitMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (!lower || lower === "unknown" || lower === "n/a" || lower === "closed") {
      return null;
    }

    const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*h/);
    const minutesMatch = lower.match(/(\d+(?:\.\d+)?)\s*m/);

    if (hoursMatch || minutesMatch) {
      const hours = hoursMatch ? Number(hoursMatch[1]) * 60 : 0;
      const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
      return Math.round(hours + minutes);
    }

    const firstNumber = lower.match(/\d+(?:\.\d+)?/);
    return firstNumber ? Math.round(Number(firstNumber[0])) : null;
  }

  return null;
}

function first(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function demoHospitals(): Hospital[] {
  const lastUpdated = new Date().toISOString();

  return [
    {
      id: "long-island",
      name: "NYU Langone Hospital — Long Island",
      address: "259 First St, Mineola, NY 11501",
      waitMinutes: 4,
      lat: 40.7484,
      lng: -73.6407,
      type: "Emergency Room",
      lastUpdated,
    },
    {
      id: "cobble-hill",
      name: "NYU Langone Hospital — Cobble Hill",
      address: "70 Atlantic Ave, Brooklyn, NY 11201",
      waitMinutes: 16,
      lat: 40.6897,
      lng: -73.9952,
      type: "Emergency Room",
      lastUpdated,
    },
    {
      id: "perelman",
      name: "Ronald O. Perelman Center for Emergency Services",
      address: "570 First Ave, New York, NY 10016",
      waitMinutes: 16,
      lat: 40.7421,
      lng: -73.9739,
      type: "Emergency Room",
      lastUpdated,
    },
    {
      id: "brooklyn",
      name: "NYU Langone Hospital — Brooklyn",
      address: "150 55th St, Brooklyn, NY 11220",
      waitMinutes: 17,
      lat: 40.6436,
      lng: -74.0051,
      type: "Emergency Room",
      lastUpdated,
    },
  ];
}
