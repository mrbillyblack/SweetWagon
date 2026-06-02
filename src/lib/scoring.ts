import type { Hospital, ScoredHospital, Urgency, UserLocation } from "../types";
import { estimateDriveMinutes, haversineDistanceMiles } from "./geo";

export function scoreHospitals(
  hospitals: Hospital[],
  userLocation: UserLocation | null,
  urgency: Urgency,
): ScoredHospital[] {
  const scored = hospitals.map((hospital) => scoreHospital(hospital, userLocation));
  const closestDistance = minKnown(scored.map((hospital) => hospital.distanceMiles));
  const shortestWait = minKnown(scored.map((hospital) => hospital.waitMinutes));
  const bestTotal = minKnown(scored.map((hospital) => hospital.totalEstimatedMinutes));

  return scored
    .map((hospital) => ({
      ...hospital,
      rankScore: rankScore(hospital, urgency, userLocation),
      recommendationReason: recommendationReason(hospital, {
        urgency,
        hasLocation: Boolean(userLocation),
        closestDistance,
        shortestWait,
        bestTotal,
      }),
    }))
    .sort((a, b) => {
      if (a.rankScore !== b.rankScore) {
        return a.rankScore - b.rankScore;
      }

      const waitA = a.waitMinutes ?? Number.MAX_SAFE_INTEGER;
      const waitB = b.waitMinutes ?? Number.MAX_SAFE_INTEGER;
      if (waitA !== waitB) {
        return waitA - waitB;
      }

      const distanceA = a.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const distanceB = b.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }

      return a.name.localeCompare(b.name);
    });
}

function scoreHospital(hospital: Hospital, userLocation: UserLocation | null): ScoredHospital {
  const lat = hospital.lat;
  const lng = hospital.lng;
  const hasCoordinates =
    userLocation !== null &&
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const distanceMiles = hasCoordinates
    ? haversineDistanceMiles(userLocation.lat, userLocation.lng, lat, lng)
    : null;
  const estimatedDriveMinutes = distanceMiles === null ? null : estimateDriveMinutes(distanceMiles);
  const totalEstimatedMinutes =
    hospital.waitMinutes === null || estimatedDriveMinutes === null
      ? null
      : hospital.waitMinutes + estimatedDriveMinutes;

  return {
    ...hospital,
    distanceMiles,
    estimatedDriveMinutes,
    totalEstimatedMinutes,
    recommendationReason: "",
    rankScore: Number.MAX_SAFE_INTEGER,
  };
}

function rankScore(hospital: ScoredHospital, urgency: Urgency, userLocation: UserLocation | null): number {
  if (urgency === "severe") {
    return hospital.distanceMiles ?? Number.MAX_SAFE_INTEGER;
  }

  if (userLocation && hospital.totalEstimatedMinutes !== null) {
    return hospital.totalEstimatedMinutes;
  }

  if (hospital.waitMinutes !== null) {
    return hospital.waitMinutes;
  }

  return hospital.distanceMiles ?? Number.MAX_SAFE_INTEGER;
}

function recommendationReason(
  hospital: ScoredHospital,
  context: {
    urgency: Urgency;
    hasLocation: boolean;
    closestDistance: number | null;
    shortestWait: number | null;
    bestTotal: number | null;
  },
): string {
  if (context.urgency === "severe") {
    return context.hasLocation
      ? "Closest option for severe symptoms. Call 911 if symptoms are life-threatening."
      : "Severe symptoms selected. Call 911 or go to the nearest ER immediately.";
  }

  if (!context.hasLocation) {
    return hospital.waitMinutes === context.shortestWait
      ? "Shortest known wait. Add your location for travel-adjusted ranking."
      : "Add your location to compare travel time with wait time.";
  }

  if (hospital.totalEstimatedMinutes === context.bestTotal) {
    return "Best balance of short wait and close distance";
  }

  if (hospital.distanceMiles === context.closestDistance) {
    return "Closest option";
  }

  if (hospital.waitMinutes === context.shortestWait) {
    return "Shortest wait, but farther away";
  }

  if (hospital.waitMinutes === null) {
    return "Travel estimate available; wait time is not currently reported";
  }

  return "Good alternate based on estimated total time";
}

function minKnown(values: Array<number | null>): number | null {
  const knownValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return knownValues.length ? Math.min(...knownValues) : null;
}
