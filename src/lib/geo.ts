import type { Hospital, UserLocation } from "../types";

const EARTH_RADIUS_MILES = 3958.8;

export function getUserLocation(): Promise<UserLocation> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Browser location is not available."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Your current location",
        });
      },
      (error) => {
        reject(new Error(error.message || "Location permission was not granted."));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  });
}

export function haversineDistanceMiles(
  userLat: number,
  userLng: number,
  hospitalLat: number,
  hospitalLng: number,
): number {
  const latDelta = toRadians(hospitalLat - userLat);
  const lngDelta = toRadians(hospitalLng - userLng);
  const userLatRadians = toRadians(userLat);
  const hospitalLatRadians = toRadians(hospitalLat);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(userLatRadians) * Math.cos(hospitalLatRadians) * Math.sin(lngDelta / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateDriveMinutes(distanceMiles: number): number {
  return distanceMiles * 3.2 + 5;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
    return "Unknown";
  }

  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) {
    return `${rounded} min`;
  }

  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

export function formatDistance(distanceMiles: number | null | undefined): string {
  if (distanceMiles === null || distanceMiles === undefined || Number.isNaN(distanceMiles)) {
    return "Unknown";
  }

  return `${distanceMiles.toFixed(distanceMiles < 10 ? 1 : 0)} mi`;
}

export function googleMapsDirectionsUrl(hospital: Pick<Hospital, "name" | "address" | "lat" | "lng">): string {
  const destination =
    hospital.lat !== undefined && hospital.lng !== undefined
      ? `${hospital.lat},${hospital.lng}`
      : hospital.address || hospital.name;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
