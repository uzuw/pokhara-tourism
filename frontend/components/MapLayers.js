'use client';
import { useEffect, useRef, useState } from 'react';

// Reusable Leaflet base-layer switcher: Street | Satellite | Base (minimal).
// `mapRef` is the Leaflet map instance; we add all layers once and toggle.
const LAYERS = {
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '© OpenStreetMap contributors' },
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics' },
  },
  base: {
    label: 'Base',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 19, attribution: '© OpenStreetMap · © CARTO' },
  },
};

export default function MapLayers({ mapRef, LRef }) {
  const layersRef = useRef({});
  const [active, setActive] = useState('street');

  useEffect(() => {
    const m = mapRef.current; const L = LRef.current;
    if (!m || !L || layersRef.current.street) return;
    // remove any tile layer the page already added so we don't double up
    m.eachLayer((layer) => { if (layer instanceof L.TileLayer) m.removeLayer(layer); });
    // add every layer; only the active one is visible
    Object.entries(LAYERS).forEach(([key, cfg]) => {
      const layer = L.tileLayer(cfg.url, cfg.options);
      if (key === 'street') layer.addTo(m); else layer.addTo(m).remove();
      layersRef.current[key] = layer;
    });
  }, [mapRef, LRef]);

  function setLayer(key) {
    const m = mapRef.current;
    if (!m) return;
    Object.entries(layersRef.current).forEach(([k, layer]) => {
      if (k === key) { if (!m.hasLayer(layer)) layer.addTo(m); }
      else { if (m.hasLayer(layer)) m.removeLayer(layer); }
    });
    setActive(key);
  }

  return (
    <div className="map-layer">
      <span className="map-layer-label">Map</span>
      <div className="layer-seg" role="group" aria-label="Map style">
        {Object.keys(LAYERS).map((k) => (
          <button key={k} className={active === k ? 'active' : ''} onClick={() => setLayer(k)}>{LAYERS[k].label}</button>
        ))}
      </div>
    </div>
  );
}
