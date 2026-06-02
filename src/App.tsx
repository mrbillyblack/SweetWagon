import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { HospitalCard } from "./components/HospitalCard";
import { RecommendationCard } from "./components/RecommendationCard";
import { fetchHospitals } from "./lib/api";
import { getUserLocation } from "./lib/geo";
import { scoreHospitals } from "./lib/scoring";
import type { FacilityFilter, Hospital, Urgency, UserLocation } from "./types";

const FILTERS: FacilityFilter[] = ["All", "Emergency Room", "Pediatric ER", "Urgent Care"];

const URGENCY_OPTIONS: Array<{ value: Urgency; label: string }> = [
  { value: "minor", label: "Minor / non-emergency" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Emergency / severe symptoms" },
];

const BOSTON_DEMO_LOCATION: UserLocation = {
  lat: 42.3555,
  lng: -71.0565,
  label: "Demo location near downtown Boston",
};

function App() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [urgency, setUrgency] = useState<Urgency>("minor");
  const [filter, setFilter] = useState<FacilityFilter>("All");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [manualLocation, setManualLocation] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [backendWarning, setBackendWarning] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadHospitals = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await fetchHospitals();
      setHospitals(result.hospitals);
      setIsDemo(result.isDemo);
      setBackendWarning(result.warning || "");
      setLastRefreshed(new Date());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load hospital data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  const scoredHospitals = useMemo(
    () => scoreHospitals(hospitals, userLocation, urgency),
    [hospitals, userLocation, urgency],
  );

  const filteredHospitals = useMemo(() => {
    if (filter === "All") {
      return scoredHospitals;
    }

    return scoredHospitals.filter((hospital) => (hospital.type || "").toLowerCase() === filter.toLowerCase());
  }, [filter, scoredHospitals]);

  const recommendedHospital = filteredHospitals[0];

  const lastRefreshedLabel = lastRefreshed
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(lastRefreshed)
    : "Not refreshed";

  const handleUseLocation = async () => {
    setIsLocating(true);
    setManualMessage("");

    try {
      const location = await getUserLocation();
      setUserLocation(location);
      setManualLocation("");
      setManualMessage("Location captured. Recommendations now include travel time.");
    } catch (error) {
      setManualMessage(error instanceof Error ? error.message : "Location permission was not granted.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleManualLocation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!manualLocation.trim()) {
      setManualMessage("Enter a ZIP code or address to use demo Boston coordinates.");
      return;
    }

    setUserLocation({
      ...BOSTON_DEMO_LOCATION,
      label: `Demo location for ${manualLocation.trim()}`,
    });
    setManualMessage("Geocoding is not connected yet, so demo Boston coordinates are being used.");
  };

  return (
    <div className="app-shell">
      <header className="top-panel">
        <div className="brand-block">
          <span className="section-kicker">Boston ER decision support</span>
          <h1>ER Compass Boston</h1>
          <p>Find the fastest practical ER based on wait time + your location.</p>
        </div>
        <div className="refresh-panel">
          <span>Last refreshed</span>
          <strong>{lastRefreshedLabel}</strong>
          <button type="button" className="small-button" onClick={loadHospitals} disabled={isLoading}>
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="emergency-alert">
        <strong>If this is a medical emergency, call 911 or go to the nearest emergency room immediately.</strong>
        <span>Hospitals triage by severity, so wait times are estimates only.</span>
      </section>

      {backendWarning ? <div className="warning-banner">{backendWarning}</div> : null}
      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <main className="dashboard-grid">
        <section className="controls-panel" aria-label="Recommendation controls">
          <div>
            <span className="section-kicker">Location</span>
            <h2>Where are you starting?</h2>
          </div>

          <button type="button" className="location-button" onClick={handleUseLocation} disabled={isLocating}>
            {isLocating ? "Finding location" : "Use My Location"}
          </button>

          <form className="manual-location-form" onSubmit={handleManualLocation}>
            <label htmlFor="manual-location">Enter ZIP code or address</label>
            <div className="manual-location-form__row">
              <input
                id="manual-location"
                type="text"
                value={manualLocation}
                onChange={(event) => setManualLocation(event.target.value)}
                placeholder="02118 or 75 Francis St"
              />
              <button type="submit">Use</button>
            </div>
          </form>

          {manualMessage ? <p className="helper-message">{manualMessage}</p> : null}
          {userLocation ? <p className="location-chip">{userLocation.label || "Location ready"}</p> : null}

          <div className="urgency-control">
            <span className="section-kicker">Urgency</span>
            <div className="segmented-control" role="radiogroup" aria-label="Urgency selector">
              {URGENCY_OPTIONS.map((option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={urgency === option.value}
                  key={option.value}
                  className={urgency === option.value ? "segment is-active" : "segment"}
                  onClick={() => setUrgency(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <RecommendationCard
          hospital={recommendedHospital}
          urgency={urgency}
          hasUserLocation={Boolean(userLocation)}
          isDemo={isDemo}
        />
      </main>

      <section className="list-section">
        <div className="list-section__header">
          <div>
            <span className="section-kicker">Sorted options</span>
            <h2>Hospital options</h2>
          </div>
          <div className="filter-chips" role="tablist" aria-label="Facility filters">
            {FILTERS.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === item}
                key={item}
                className={filter === item ? "filter-chip is-active" : "filter-chip"}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? <div className="loading-state">Loading hospital wait times...</div> : null}

        {!isLoading && filteredHospitals.length === 0 ? (
          <div className="empty-state">
            <h3>No facilities match this filter</h3>
            <p>Choose another facility type or refresh the data feed.</p>
          </div>
        ) : null}

        <div className="hospital-list">
          {!isLoading
            ? filteredHospitals.map((hospital, index) => (
                <HospitalCard key={hospital.id} hospital={hospital} rank={index + 1} isDemo={isDemo} />
              ))
            : null}
        </div>
      </section>
    </div>
  );
}

export default App;
