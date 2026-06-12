import { useRef, useState } from 'react';
import { geocodeAddress } from '../hooks/useGeolocation';

interface Props {
  onAllow: () => void;
  onManual: (lat: number, lng: number, label: string) => void;
  onDismiss: () => void;
}

export function GeolocationPrompt({ onAllow, onManual, onDismiss }: Props) {
  const [mode, setMode] = useState<'choice' | 'manual'>('choice');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await geocodeAddress(address.trim());
      if (!result) {
        setError("Couldn't find that location. Try a full address or zip code.");
      } else {
        onManual(result.lat, result.lng, address.trim());
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function switchToManual() {
    setMode('manual');
    // focus input on next paint
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="geo-overlay">
      <div className="geo-card">
        {mode === 'choice' ? (
          <>
            <div className="geo-icon">📍</div>
            <h2>Where are you?</h2>
            <p>
              We'll show you how far you are from each ER. Your location stays
              on your device and is never sent to our servers.
            </p>
            <div className="geo-actions">
              <button className="btn-primary" onClick={onAllow}>
                Use my current location
              </button>
              <button className="btn-secondary" onClick={switchToManual}>
                Enter an address instead
              </button>
              <button className="btn-ghost" onClick={onDismiss}>
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="geo-back" onClick={() => { setMode('choice'); setError(null); }}>
              ← Back
            </button>
            <div className="geo-icon">🔍</div>
            <h2>Enter your location</h2>
            <p>Type a neighborhood, address, or zip code in the NYC area.</p>
            <form onSubmit={handleManualSubmit} className="geo-form">
              <input
                ref={inputRef}
                className="geo-input"
                type="text"
                placeholder="Address, neighborhood, or zip code"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              {error && <p className="geo-error">{error}</p>}
              <div className="geo-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || !address.trim()}
                >
                  {loading ? 'Searching…' : 'Set location'}
                </button>
                <button type="button" className="btn-ghost" onClick={onDismiss}>
                  Skip
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
