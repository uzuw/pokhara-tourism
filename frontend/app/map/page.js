'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, toast } from '@/lib/auth';

function makeIcon(L, active) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${active ? '#ff7a45' : '#0e7490'};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });
}

function MapInner() {
  const params = useSearchParams();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const markersRef = useRef({});
  const routingRef = useRef(null);
  const [dests, setDests] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('/api/destinations').then((r) => { if (!cancelled) setDests(r.destinations); }).catch(() => toast('Could not load map data'));

    if (!mapRef.current && mapEl.current) {
      // dynamic import keeps leaflet (which touches window) out of SSR
      Promise.all([import('leaflet'), import('leaflet-routing-machine')]).then(([L]) => {
        LRef.current = L;
        const m = L.map(mapEl.current).setView([28.21, 83.96], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
        mapRef.current = m;
      });
    }
    return () => { cancelled = true; };
  }, []);

  // add markers once dests loaded
  useEffect(() => {
    const L = LRef.current;
    if (!mapRef.current || !L || dests.length === 0) return;
    const m = mapRef.current;
    dests.forEach((d) => {
      if (markersRef.current[d.id]) return;
      const mk = L.marker([d.lat, d.lng], { icon: makeIcon(L, false) })
        .addTo(m)
        .bindPopup(`<b>${d.name}</b><br>${d.category}<br><a href="/destination/${d.slug}">View →</a>`);
      markersRef.current[d.id] = mk;
    });
    const slug = params.get('slug');
    if (slug) {
      const d = dests.find((x) => x.slug === slug);
      if (d) { m.flyTo([d.lat, d.lng], 15, { duration: 0.8 }); markersRef.current[d.id].openPopup(); }
    }
    setTimeout(() => m.invalidateSize(), 200);
  }, [dests, params]);

  function clearRoute() {
    if (routingRef.current) { mapRef.current.removeControl(routingRef.current); routingRef.current = null; }
    setRouteInfo(null); setFromId(''); setToId('');
  }

  function drawRoute() {
    const L = LRef.current;
    if (!L || !fromId || !toId) { toast('Pick a From and To spot'); return; }
    if (fromId === toId) { toast('Pick two different spots'); return; }
    const a = dests.find((d) => String(d.id) === String(fromId));
    const b = dests.find((d) => String(d.id) === String(toId));
    if (routingRef.current) mapRef.current.removeControl(routingRef.current);
    const routing = L.Routing.control({
      waypoints: [L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng)],
      router: L.Routing.osrmRouter({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
      lineOptions: { styles: [{ color: '#ff7a45', weight: 5, opacity: 0.85 }] },
      show: false, addWaypoints: false, fitSelectedRoutes: true, createMarker: () => null,
    }).addTo(mapRef.current);
    routing.on('routesfound', (e) => {
      const r = e.routes[0];
      setRouteInfo({ a: a.name, b: b.name, km: (r.summary.totalDistance / 1000).toFixed(1), min: Math.round(r.summary.totalTime / 60) });
    });
    routing.on('routingerror', () => toast('Routing service unavailable — try again later'));
    routingRef.current = routing;
  }

  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="container">
        <div className="section-head" style={{ textAlign: 'left', margin: '0 0 20px', maxWidth: 'none' }}>
          <span className="eyebrow">🗺️ OpenStreetMap</span>
          <h2 style={{ margin: '8px 0 4px' }}>The whole valley, on one map</h2>
          <p>Pick two spots to draw a real route between them. Click any destination to centre the map.</p>
        </div>

        <div className="route-box">
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}><option value="">From…</option>{dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <span style={{ color: 'var(--muted)' }}>→</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}><option value="">To…</option>{dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <button className="btn btn-primary" onClick={drawRoute}>Draw route</button>
          <button className="btn btn-outline" onClick={clearRoute}>Clear</button>
        </div>
        {routeInfo && (
          <div className="route-info" style={{ display: 'block' }}>
            🚶 <b>{routeInfo.a} → {routeInfo.b}</b><br />Distance <b>{routeInfo.km} km</b> · about <b>{routeInfo.min} min</b> by road.
          </div>
        )}

        <div className="map-layout" style={{ marginTop: 14 }}>
          <div className="map-side">
            <h3>📍 All destinations</h3>
            {dests.map((d) => (
              <div key={d.id} className="dest-item" onClick={() => { mapRef.current.flyTo([d.lat, d.lng], 15, { duration: 0.8 }); markersRef.current[d.id]?.openPopup(); }}>
                <img className="dest-thumb" src={d.image} onError={(e) => { e.currentTarget.style.background = 'linear-gradient(120deg,#0e3a56,#14b8a6)'; e.currentTarget.removeAttribute('src'); }} alt="" />
                <div><div className="nm">{d.name}</div><div className="ct">{d.category}</div></div>
              </div>
            ))}
          </div>
          <div>
            <div id="fullMap" ref={mapEl}></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<section className="section center"><div className="spinner" style={{ borderColor: 'var(--teal-500)', borderTopColor: 'transparent' }} /></section>}>
      <MapInner />
    </Suspense>
  );
}
