export type Hospital = {
  id: string;
  name: string;
  address?: string;
  waitMinutes: number | null;
  lat?: number;
  lng?: number;
  type?: string;
  lastUpdated?: string;
  sourceUrl?: string;
};

export type UserLocation = {
  lat: number;
  lng: number;
  label?: string;
};

export type Urgency = "minor" | "moderate" | "severe";

export type FacilityFilter = "All" | "Emergency Room" | "Pediatric ER" | "Urgent Care";

export type ScoredHospital = Hospital & {
  distanceMiles: number | null;
  estimatedDriveMinutes: number | null;
  totalEstimatedMinutes: number | null;
  recommendationReason: string;
  rankScore: number;
};

export type FetchHospitalsResult = {
  hospitals: Hospital[];
  isDemo: boolean;
  warning?: string;
  attemptedEndpoints: string[];
};
