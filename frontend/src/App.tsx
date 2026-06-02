import { useState } from 'react';
import { ERMap } from './components/ERMap';
import { GeolocationPrompt } from './components/GeolocationPrompt';
import { LocationPanel } from './components/LocationPanel';
import { useGeolocation } from './hooks/useGeolocation';
import { useLocations } from './hooks/useLocations';
import type { Location } from './types';
import { pinColor } from './types';

export default function App() {
  const { locations, loading, error } = useLocations();
  const { state: geoState, request: requestGeo, dismiss: dismissGeo } = useGeolocation();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const showGeoPrompt = geoState.status === 'idle';
  const userLat = geoState.status === 'granted' ? geoState.lat : undefined;
  const userLng = geoState.status === 'granted' ? geoState.lng : undefined;

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <span className="topbar-logo">🚑 SweetWagon</span>
        <div className="topbar-legend">
          <span className="legend-dot green" />
          <span className="legend-label">&lt;7m</span>
          <span className="legend-dot yellow" />
          <span className="legend-label">&lt;15m</span>
          <span className="legend-dot red" />
          <span className="legend-label">15m+</span>
        </div>
      </header>

      {/* Map */}
      <main className="map-wrapper">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}
        {error && (
          <div className="error-banner">
            Could not load ER data — backend may be starting up.
          </div>
        )}
        <ERMap
          locations={locations}
          userLat={userLat}
          userLng={userLng}
          selectedId={selectedLocation?.id ?? null}
          onSelect={setSelectedLocation}
        />
      </main>

      {/* Wait time list — scrollable bottom tray on mobile */}
      {!selectedLocation && locations.length > 0 && (
        <div className="location-tray">
          {locations.map((loc) => {
            const color = pinColor(loc.display_wait_minutes);
            const hex = color === 'green' ? '#22c55e' : color === 'yellow' ? '#eab308' : '#ef4444';
            return (
              <button
                key={loc.id}
                className="tray-card"
                onClick={() => setSelectedLocation(loc)}
              >
                <span className="tray-wait" style={{ color: hex }}>
                  {loc.display_wait_minutes}m
                </span>
                <span className="tray-name">{loc.name.replace('NYU Langone ', '').replace('Hospital — ', '')}</span>
                <span className="tray-borough">{loc.borough}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Location detail panel */}
      {selectedLocation && (
        <LocationPanel
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}

      {/* Geolocation prompt */}
      {showGeoPrompt && !selectedLocation && (
        <GeolocationPrompt onAllow={requestGeo} onDismiss={dismissGeo} />
      )}
    </div>
  );
}
