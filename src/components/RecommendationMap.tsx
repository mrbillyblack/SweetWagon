import type { ScoredHospital, Urgency, UserLocation } from "../types";
import { formatDistance, formatMinutes, googleMapsDirectionsUrl } from "../lib/geo";

type RecommendationMapProps = {
  hospitals: ScoredHospital[];
  recommendedHospital?: ScoredHospital;
  userLocation: UserLocation | null;
  urgency: Urgency;
  isLoading: boolean;
};

type PositionedHospital = ScoredHospital & {
  mapX: number;
  mapY: number;
  colorClass: "is-recommended" | "is-good" | "is-watch" | "is-slow" | "is-unknown";
  colorLabel: string;
};

export function RecommendationMap({
  hospitals,
  recommendedHospital,
  userLocation,
  urgency,
  isLoading,
}: RecommendationMapProps) {
  const mappedHospitals = projectHospitals(hospitals, userLocation, recommendedHospital, urgency);
  const recommended = mappedHospitals.find((hospital) => hospital.id === recommendedHospital?.id);
  const userPoint = projectUserLocation(mappedHospitals, hospitals, userLocation);

  return (
    <section className="map-section">
      <div className="map-section__header">
        <div>
          <span className="section-kicker">Recommendation map</span>
          <h2>All locations, scored by wait + drive time</h2>
        </div>
        <div className="map-legend" aria-label="Map color legend">
          <span className="legend-dot is-recommended">Recommended</span>
          <span className="legend-dot is-good">Fast</span>
          <span className="legend-dot is-watch">Watch</span>
          <span className="legend-dot is-slow">Slow/Far</span>
        </div>
      </div>

      <div className="map-card">
        <div className="map-summary">
          <div>
            <span>Current score mode</span>
            <strong>{urgency === "severe" ? "Nearest ER first" : "Total expected time"}</strong>
          </div>
          <div>
            <span>Green pin</span>
            <strong>{recommended?.name || "No recommendation yet"}</strong>
          </div>
          <div>
            <span>Travel adjustment</span>
            <strong>{userLocation ? "Location active" : "Add location for drive-time color"}</strong>
          </div>
        </div>

        <div className="er-map" role="img" aria-label="Map showing hospital locations and recommendation ranking">
          {isLoading ? <div className="map-loading">Loading map pins...</div> : null}

          {userPoint ? (
            <div className="user-map-marker" style={{ left: `${userPoint.x}%`, top: `${userPoint.y}%` }}>
              <span />
              <strong>You</strong>
            </div>
          ) : null}

          {mappedHospitals.map((hospital, index) => (
            <a
              key={hospital.id}
              className={`map-pin ${hospital.colorClass}`}
              href={googleMapsDirectionsUrl(hospital)}
              style={{ left: `${hospital.mapX}%`, top: `${hospital.mapY}%` }}
              target="_blank"
              rel="noreferrer"
              aria-label={`${hospital.name}: ${hospital.colorLabel}`}
            >
              <span className="map-pin__dot">{recommendedHospital?.id === hospital.id ? "★" : index + 1}</span>
              <span className="map-pin__label">
                <strong>{shortName(hospital.name)}</strong>
                <small>
                  {formatMinutes(hospital.totalEstimatedMinutes)} total
                  {hospital.distanceMiles !== null ? ` • ${formatDistance(hospital.distanceMiles)}` : ""}
                </small>
              </span>
            </a>
          ))}
        </div>

        <div className="map-details">
          {mappedHospitals.map((hospital) => (
            <div key={hospital.id} className={`map-detail ${hospital.colorClass}`}>
              <span>{recommendedHospital?.id === hospital.id ? "Recommended" : hospital.colorLabel}</span>
              <strong>{hospital.name}</strong>
              <small>
                Wait {formatMinutes(hospital.waitMinutes)} · Drive {formatMinutes(hospital.estimatedDriveMinutes)} · Total{" "}
                {formatMinutes(hospital.totalEstimatedMinutes)}
              </small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function projectHospitals(
  hospitals: ScoredHospital[],
  userLocation: UserLocation | null,
  recommendedHospital: ScoredHospital | undefined,
  urgency: Urgency,
): PositionedHospital[] {
  const locatedHospitals = hospitals.filter(hasCoordinates);
  const points = [
    ...locatedHospitals.map((hospital) => ({ lat: hospital.lat, lng: hospital.lng })),
    ...(userLocation ? [{ lat: userLocation.lat, lng: userLocation.lng }] : []),
  ];
  const bounds = getBounds(points);

  return locatedHospitals.map((hospital) => {
    const position = projectPoint(hospital.lat, hospital.lng, bounds);
    const color = colorForHospital(hospital, recommendedHospital, hospitals, urgency);

    return {
      ...hospital,
      mapX: position.x,
      mapY: position.y,
      ...color,
    };
  });
}

function projectUserLocation(
  mappedHospitals: PositionedHospital[],
  hospitals: ScoredHospital[],
  userLocation: UserLocation | null,
): { x: number; y: number } | null {
  if (!userLocation || mappedHospitals.length === 0) {
    return null;
  }

  const points = [
    ...hospitals.filter(hasCoordinates).map((hospital) => ({ lat: hospital.lat, lng: hospital.lng })),
    { lat: userLocation.lat, lng: userLocation.lng },
  ];
  const bounds = getBounds(points);
  return projectPoint(userLocation.lat, userLocation.lng, bounds);
}

function colorForHospital(
  hospital: ScoredHospital,
  recommendedHospital: ScoredHospital | undefined,
  hospitals: ScoredHospital[],
  urgency: Urgency,
): Pick<PositionedHospital, "colorClass" | "colorLabel"> {
  if (recommendedHospital?.id === hospital.id) {
    return { colorClass: "is-recommended", colorLabel: "Recommended option" };
  }

  const bestScore = recommendedHospital?.rankScore ?? minKnown(hospitals.map((item) => item.rankScore));
  const score = hospital.rankScore;

  if (!Number.isFinite(score) || !Number.isFinite(bestScore)) {
    return { colorClass: "is-unknown", colorLabel: "Score unavailable" };
  }

  if (urgency === "severe") {
    const distanceDelta = score - bestScore;
    if (distanceDelta <= 1.5) {
      return { colorClass: "is-good", colorLabel: "Nearby alternate" };
    }
    if (distanceDelta <= 5) {
      return { colorClass: "is-watch", colorLabel: "Farther alternate" };
    }
    return { colorClass: "is-slow", colorLabel: "Slow/Far option" };
  }

  const timeDelta = score - bestScore;
  if (timeDelta <= 15) {
    return { colorClass: "is-good", colorLabel: "Fast alternate" };
  }
  if (timeDelta <= 35) {
    return { colorClass: "is-watch", colorLabel: "Watch travel time" };
  }
  return { colorClass: "is-slow", colorLabel: "Slow/Far option" };
}

function getBounds(points: Array<{ lat: number; lng: number }>) {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);
  const latPadding = Math.max((latMax - latMin) * 0.14, 0.01);
  const lngPadding = Math.max((lngMax - lngMin) * 0.14, 0.01);

  return {
    latMin: latMin - latPadding,
    latMax: latMax + latPadding,
    lngMin: lngMin - lngPadding,
    lngMax: lngMax + lngPadding,
  };
}

function projectPoint(lat: number, lng: number, bounds: ReturnType<typeof getBounds>): { x: number; y: number } {
  const x = ((lng - bounds.lngMin) / (bounds.lngMax - bounds.lngMin)) * 100;
  const y = ((bounds.latMax - lat) / (bounds.latMax - bounds.latMin)) * 100;

  return {
    x: clamp(x, 8, 90),
    y: clamp(y, 12, 86),
  };
}

function hasCoordinates(hospital: ScoredHospital): hospital is ScoredHospital & { lat: number; lng: number } {
  return (
    typeof hospital.lat === "number" &&
    typeof hospital.lng === "number" &&
    Number.isFinite(hospital.lat) &&
    Number.isFinite(hospital.lng)
  );
}

function minKnown(values: number[]): number {
  const knownValues = values.filter((value) => Number.isFinite(value));
  return knownValues.length ? Math.min(...knownValues) : Number.MAX_SAFE_INTEGER;
}

function shortName(name: string): string {
  return name
    .replace("Massachusetts General Hospital", "Mass General")
    .replace("Brigham and Women's Hospital", "Brigham")
    .replace("Beth Israel Deaconess Medical Center", "Beth Israel")
    .replace("Boston Children's Hospital", "Children's")
    .replace("Ronald O. Perelman Center for Emergency Services", "Perelman ER")
    .replace("NYU Langone Hospital — ", "NYU ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
