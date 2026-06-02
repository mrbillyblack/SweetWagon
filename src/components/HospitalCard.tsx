import type { ScoredHospital } from "../types";
import { formatDistance, formatMinutes, googleMapsDirectionsUrl } from "../lib/geo";

type HospitalCardProps = {
  hospital: ScoredHospital;
  rank: number;
  isDemo: boolean;
};

export function HospitalCard({ hospital, rank, isDemo }: HospitalCardProps) {
  return (
    <article className={rank === 1 ? "hospital-card is-leading" : "hospital-card"}>
      <div className="hospital-card__header">
        <span className="rank-badge">#{rank}</span>
        <div>
          <h3>{hospital.name}</h3>
          {hospital.address ? <p>{hospital.address}</p> : null}
        </div>
      </div>

      <div className="hospital-card__meta">
        <span>{hospital.type || "Emergency Room"}</span>
        {isDemo ? <span className="demo-pill">Demo data</span> : null}
      </div>

      <div className="metric-row">
        <Metric label="Wait" value={formatMinutes(hospital.waitMinutes)} />
        <Metric label="Distance" value={formatDistance(hospital.distanceMiles)} />
        <Metric label="Drive" value={formatMinutes(hospital.estimatedDriveMinutes)} />
        <Metric label="Total" value={formatMinutes(hospital.totalEstimatedMinutes)} highlight />
      </div>

      <p className="reason-line">{hospital.recommendationReason}</p>

      <a className="ghost-action" href={googleMapsDirectionsUrl(hospital)} target="_blank" rel="noreferrer">
        Open in Google Maps
      </a>
    </article>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "metric is-highlighted" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
