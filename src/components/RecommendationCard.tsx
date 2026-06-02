import type { ScoredHospital, Urgency } from "../types";
import { formatDistance, formatMinutes, googleMapsDirectionsUrl } from "../lib/geo";

type RecommendationCardProps = {
  hospital?: ScoredHospital;
  urgency: Urgency;
  hasUserLocation: boolean;
  isDemo: boolean;
};

export function RecommendationCard({ hospital, urgency, hasUserLocation, isDemo }: RecommendationCardProps) {
  if (!hospital) {
    return (
      <section className="recommendation-card empty-state">
        <span className="section-kicker">Recommended option</span>
        <h2>No hospital data yet</h2>
        <p>Refresh the feed or broaden the facility filter to see ER options.</p>
      </section>
    );
  }

  return (
    <section className={urgency === "severe" ? "recommendation-card is-urgent" : "recommendation-card"}>
      <div className="recommendation-card__top">
        <div>
          <span className="section-kicker">Recommended option</span>
          <h2>{hospital.name}</h2>
          {hospital.address ? <p>{hospital.address}</p> : null}
        </div>
        <div className="badge-stack">
          <span className="best-badge">{urgency === "severe" ? "Nearest first" : "Best total time"}</span>
          {isDemo ? <span className="demo-pill">Demo data</span> : null}
        </div>
      </div>

      {urgency === "severe" ? (
        <div className="severe-inline-warning">
          Emergency / severe symptoms selected. Call 911 or go to the nearest emergency room immediately.
        </div>
      ) : null}

      <div className="big-metrics">
        <Metric label="Wait time" value={formatMinutes(hospital.waitMinutes)} />
        <Metric label="Distance" value={formatDistance(hospital.distanceMiles)} muted={!hasUserLocation} />
        <Metric label="Estimated drive" value={formatMinutes(hospital.estimatedDriveMinutes)} muted={!hasUserLocation} />
        <Metric label="Total estimate" value={formatMinutes(hospital.totalEstimatedMinutes)} emphasis />
      </div>

      <div className="recommendation-card__footer">
        <p>{hospital.recommendationReason}</p>
        <a className="primary-action" href={googleMapsDirectionsUrl(hospital)} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  const className = [
    "big-metric",
    emphasis ? "is-emphasis" : "",
    muted ? "is-muted" : "",
    value === "Unknown" ? "is-unknown" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
