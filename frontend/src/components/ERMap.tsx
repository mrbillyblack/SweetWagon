import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import type { Location } from '../types';
import { pinColor, pinSpeed } from '../types';

// Fix Leaflet default icon path broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makePinIcon(waitMinutes: number): L.DivIcon {
  const color = pinColor(waitMinutes);
  const speed = pinSpeed(waitMinutes);
  return L.divIcon({
    className: '',
    html: `
      <div class="pin-wrapper">
        <div class="pin-ring pin-${color} pin-speed-${speed}"></div>
        <div class="pin-dot pin-${color}"></div>
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function makeUserIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="user-dot"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

interface FlyToUserProps {
  lat: number;
  lng: number;
}

function FlyToUser({ lat, lng }: FlyToUserProps) {
  const map = useMap();
  map.flyTo([lat, lng], 13, { duration: 1.5 });
  return null;
}

interface Props {
  locations: Location[];
  userLat?: number;
  userLng?: number;
  selectedId: string | null;
  onSelect: (loc: Location) => void;
}

export function ERMap({ locations, userLat, userLng, selectedId, onSelect }: Props) {
  return (
    <MapContainer
      center={[40.73, -73.97]}
      zoom={11}
      className="map-container"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {userLat !== undefined && userLng !== undefined && (
        <>
          <FlyToUser lat={userLat} lng={userLng} />
          <Marker position={[userLat, userLng]} icon={makeUserIcon()} />
        </>
      )}

      {locations.map((loc) => (
        <Marker
          key={loc.id}
          position={[loc.lat, loc.lng]}
          icon={makePinIcon(loc.display_wait_minutes)}
          eventHandlers={{ click: () => onSelect(loc) }}
          opacity={selectedId && selectedId !== loc.id ? 0.5 : 1}
        />
      ))}
    </MapContainer>
  );
}
