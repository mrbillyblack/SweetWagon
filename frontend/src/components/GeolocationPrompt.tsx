interface Props {
  onAllow: () => void;
  onDismiss: () => void;
}

export function GeolocationPrompt({ onAllow, onDismiss }: Props) {
  return (
    <div className="geo-overlay">
      <div className="geo-card">
        <div className="geo-icon">📍</div>
        <h2>Share your location?</h2>
        <p>
          We'll show you how far you are from each ER. Your location is never stored or sent
          to our servers — it stays on your device.
        </p>
        <div className="geo-actions">
          <button className="btn-primary" onClick={onAllow}>
            Allow location
          </button>
          <button className="btn-ghost" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
