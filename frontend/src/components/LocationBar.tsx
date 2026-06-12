import { useRef, useState } from 'react';
import { geocodeAddress } from '../hooks/useGeolocation';

interface Props {
  label: string | null;           // current location label, null if not set
  onGPS: () => void;              // trigger browser geolocation
  onManual: (lat: number, lng: number, label: string) => void;
}

export function LocationBar({ label, onGPS, onManual }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openEditor() {
    setValue('');
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function close() {
    setEditing(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await geocodeAddress(value.trim());
      if (!result) {
        setError("Location not found — try a full address or zip code.");
      } else {
        onManual(result.lat, result.lng, value.trim());
        setEditing(false);
        setValue('');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleGPS() {
    onGPS();
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="locbar-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="locbar-input"
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder="Address, neighborhood, or zip code"
          disabled={loading}
          autoComplete="off"
        />
        {error && <span className="locbar-error">{error}</span>}
        <button type="submit" className="locbar-btn-go" disabled={loading || !value.trim()}>
          {loading ? '…' : 'Go'}
        </button>
        <button type="button" className="locbar-btn-gps" title="Use GPS" onClick={handleGPS}>
          ◎
        </button>
        <button type="button" className="locbar-btn-cancel" onClick={close}>
          ✕
        </button>
      </form>
    );
  }

  return (
    <button className="locbar-pill" onClick={openEditor} title="Change location">
      <span className="locbar-pin">📍</span>
      <span className="locbar-label">
        {label ?? 'Set location'}
      </span>
      <span className="locbar-caret">›</span>
    </button>
  );
}
