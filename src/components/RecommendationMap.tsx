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
  mapRank: number;
  colorClass: "is-recommended" | "is-good" | "is-watch" | "is-slow" | "is-unknown";
  colorLabel: string;
};

type MapTile = {
  key: string;
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type MapView = {
  tiles: MapTile[];
  viewportLeft: number;
  viewportTop: number;
  zoom: number;
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 540;
const MAP_PADDING = 90;
const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 15;
const OPEN_STREET_MAP_TILE_URL = "https://tile.openstreetmap.org";

export function RecommendationMap({
  hospitals,
  recommendedHospital,
  userLocation,
  urgency,
  isLoading,
}: RecommendationMapProps) {
  const visibleHospitals = selectMapHospitals(hospitals, recommendedHospital);
  const mapView = buildMapView([
    ...visibleHospitals.map((hospital) => ({ lat: hospital.lat, lng: hospital.lng })),
    ...(userLocation ? [{ lat: userLocation.lat, lng: userLocation.lng }] : []),
  ]);
  const mappedHospitals = projectHospitals(visibleHospitals, mapView, hospitals, recommendedHospital, urgency);
  const recommended = mappedHospitals.find((hospital) => hospital.id === recommendedHospital?.id);
  const userPoint = userLocation && mapView ? projectToMapView(userLocation.lat, userLocation.lng, mapView) : null;
  const scoreMode = urgency === "severe" ? "Nearest ER first" : userLocation ? "Wait + drive time" : "Known wait time";

  return (
    <section className="map-section">
      <div className="map-section__header">
        <div>
          <span className="section-kicker">Recommendation map</span>
          <h2>Scraped ER options on a real area map</h2>
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
            <strong>{scoreMode}</strong>
          </div>
          <div>
            <span>Green pin</span>
            <strong>{recommended?.name || "No recommendation yet"}</strong>
          </div>
          <div>
            <span>Area shown</span>
            <strong>{mappedHospitals.length ? `${mappedHospitals.length} mapped hospital options` : "No mapped options"}</strong>
          </div>
        </div>

        <div className="er-map" role="img" aria-label="Street map showing the top hospital locations and ranking">
          {mapView ? (
            <div className="er-map__tiles" aria-hidden="true">
              {mapView.tiles.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  style={{
                    left: `${tile.left}%`,
                    top: `${tile.top}%`,
                    width: `${tile.width}%`,
                    height: `${tile.height}%`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="map-empty">No coordinates are available for this set of hospitals.</div>
          )}

          <div className="map-attribution">
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © OpenStreetMap
            </a>
          </div>

          {isLoading ? <div className="map-loading">Loading map pins...</div> : null}

          {userPoint ? (
            <div className="user-map-marker" style={{ left: `${userPoint.x}%`, top: `${userPoint.y}%` }}>
              <span />
              <strong>You</strong>
            </div>
          ) : null}

          {mappedHospitals.map((hospital) => (
            <a
              key={hospital.id}
              className={`map-pin ${hospital.colorClass} ${labelSideClass(hospital.mapX)}`}
              href={googleMapsDirectionsUrl(hospital)}
              style={{ left: `${hospital.mapX}%`, top: `${hospital.mapY}%` }}
              target="_blank"
              rel="noreferrer"
              aria-label={`${hospital.name}: ${hospital.colorLabel}`}
            >
              <span className="map-pin__dot">{recommendedHospital?.id === hospital.id ? "★" : hospital.mapRank}</span>
              <span className="map-pin__label">
                <strong>{shortName(hospital.name)}</strong>
                <small>
                  {hospital.colorLabel}
                  {" • "}
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
              <div className="map-detail__rank">{recommendedHospital?.id === hospital.id ? "★" : hospital.mapRank}</div>
              <div>
                <span>{recommendedHospital?.id === hospital.id ? "Recommended" : hospital.colorLabel}</span>
                <strong>{hospital.name}</strong>
                <small>
                  Wait {formatMinutes(hospital.waitMinutes)} · Drive {formatMinutes(hospital.estimatedDriveMinutes)} ·
                  Total {formatMinutes(hospital.totalEstimatedMinutes)}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function selectMapHospitals(
  hospitals: ScoredHospital[],
  recommendedHospital: ScoredHospital | undefined,
): Array<ScoredHospital & { lat: number; lng: number }> {
  const locatedHospitals = hospitals.filter(hasCoordinates);
  const visibleHospitals = locatedHospitals.slice(0, 5);

  if (
    recommendedHospital &&
    hasCoordinates(recommendedHospital) &&
    !visibleHospitals.some((hospital) => hospital.id === recommendedHospital.id)
  ) {
    visibleHospitals.splice(Math.max(visibleHospitals.length - 1, 0), 1, recommendedHospital);
  }

  return visibleHospitals;
}

function projectHospitals(
  visibleHospitals: Array<ScoredHospital & { lat: number; lng: number }>,
  mapView: MapView | null,
  allHospitals: ScoredHospital[],
  recommendedHospital: ScoredHospital | undefined,
  urgency: Urgency,
): PositionedHospital[] {
  if (!mapView) {
    return [];
  }

  return visibleHospitals.map((hospital, index) => {
    const position = projectToMapView(hospital.lat, hospital.lng, mapView);
    const color = colorForHospital(hospital, recommendedHospital, allHospitals, urgency);

    return {
      ...hospital,
      mapRank: index + 1,
      mapX: position.x,
      mapY: position.y,
      ...color,
    };
  });
}

function buildMapView(points: Array<{ lat: number; lng: number }>): MapView | null {
  if (points.length === 0) {
    return null;
  }

  const zoom = chooseZoom(points);
  const worldPoints = points.map((point) => latLngToWorld(point.lat, point.lng, zoom));
  const minX = Math.min(...worldPoints.map((point) => point.x));
  const maxX = Math.max(...worldPoints.map((point) => point.x));
  const minY = Math.min(...worldPoints.map((point) => point.y));
  const maxY = Math.max(...worldPoints.map((point) => point.y));
  const worldSize = TILE_SIZE * 2 ** zoom;
  const viewportLeft = (minX + maxX) / 2 - MAP_WIDTH / 2;
  const viewportTop = clamp((minY + maxY) / 2 - MAP_HEIGHT / 2, 0, Math.max(worldSize - MAP_HEIGHT, 0));

  return {
    tiles: mapTilesForViewport(zoom, viewportLeft, viewportTop),
    viewportLeft,
    viewportTop,
    zoom,
  };
}

function chooseZoom(points: Array<{ lat: number; lng: number }>): number {
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const worldPoints = points.map((point) => latLngToWorld(point.lat, point.lng, zoom));
    const width = Math.max(...worldPoints.map((point) => point.x)) - Math.min(...worldPoints.map((point) => point.x));
    const height = Math.max(...worldPoints.map((point) => point.y)) - Math.min(...worldPoints.map((point) => point.y));

    if (width <= MAP_WIDTH - MAP_PADDING * 2 && height <= MAP_HEIGHT - MAP_PADDING * 2) {
      return zoom;
    }
  }

  return MIN_ZOOM;
}

function mapTilesForViewport(zoom: number, viewportLeft: number, viewportTop: number): MapTile[] {
  const tileCount = 2 ** zoom;
  const startX = Math.floor(viewportLeft / TILE_SIZE);
  const endX = Math.floor((viewportLeft + MAP_WIDTH) / TILE_SIZE);
  const startY = Math.floor(viewportTop / TILE_SIZE);
  const endY = Math.floor((viewportTop + MAP_HEIGHT) / TILE_SIZE);
  const tiles: MapTile[] = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= tileCount) {
        continue;
      }

      const wrappedX = modulo(x, tileCount);
      tiles.push({
        key: `${zoom}-${x}-${y}`,
        url: `${OPEN_STREET_MAP_TILE_URL}/${zoom}/${wrappedX}/${y}.png`,
        left: ((x * TILE_SIZE - viewportLeft) / MAP_WIDTH) * 100,
        top: ((y * TILE_SIZE - viewportTop) / MAP_HEIGHT) * 100,
        width: (TILE_SIZE / MAP_WIDTH) * 100,
        height: (TILE_SIZE / MAP_HEIGHT) * 100,
      });
    }
  }

  return tiles;
}

function projectToMapView(lat: number, lng: number, mapView: MapView): { x: number; y: number } {
  const point = latLngToWorld(lat, lng, mapView.zoom);

  return {
    x: clamp(((point.x - mapView.viewportLeft) / MAP_WIDTH) * 100, 4, 96),
    y: clamp(((point.y - mapView.viewportTop) / MAP_HEIGHT) * 100, 7, 93),
  };
}

function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const sinLat = Math.sin((safeLat * Math.PI) / 180);
  const worldSize = TILE_SIZE * 2 ** zoom;

  return {
    x: ((lng + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize,
  };
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

function labelSideClass(mapX: number): string {
  if (mapX > 70) {
    return "is-label-left";
  }

  if (mapX < 30) {
    return "is-label-right";
  }

  return "";
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
