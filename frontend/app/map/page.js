'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from '@/lib/auth';
import MapLayers from '@/components/MapLayers';

function makeIcon(L, active) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${active ? '#ff7a45' : '#0e7490'};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:14px">📍</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });
}

// Load Leaflet + the routing plugin *together* and make sure the plugin
// actually attaches to the same L instance. leaflet-routing-machine is a UMD
// bundle that expects a global `L`, so we set window.L before importing it.
let leafletPromise = null;
function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = (async () => {
    const L = (await import('leaflet')).default || (await import('leaflet'));
    if (typeof window !== 'undefined') window.L = L;
    await import('leaflet-routing-machine');
    return L;
  })();
  return leafletPromise;
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
  const [locStatus, setLocStatus] = useState('');      // "locating" | "ready" | "" 
  const [currentPos, setCurrentPos] = useState(null);  // { lat, lng }
  const currentMarkerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api('/api/destinations').then((r) => { if (!cancelled) setDests(r.destinations); }).catch(() => toast('Could not load map data'));

    if (!mapRef.current && mapEl.current) {
      loadLeaflet().then((L) => {
        LRef.current = L;
        if (mapEl.current._leaflet_id) return; // already initialized (strict-mode double invoke)
        const m = L.map(mapEl.current).setView([28.21, 83.96], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
        mapRef.current = m;
      }).catch(() => toast('Map library failed to load'));
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
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(mapEl.current);
    window.addEventListener('resize', () => m.invalidateSize());
    return () => ro.disconnect();
  }, [dests, params]);

  function clearRoute() {
    if (routingRef.current && mapRef.current) { mapRef.current.removeControl(routingRef.current); routingRef.current = null; }
    setRouteInfo(null); setFromId(''); setToId('');
  }

  // --- geolocation: route from the user's live position ---
  function useMyLocation(side) {
    if (!navigator.geolocation) { toast('Geolocation is not supported on this device'); return; }
    setLocStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const posLL = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentPos(posLL);
        setLocStatus('ready');
        // drop a marker at the current position
        const L = LRef.current, m = mapRef.current;
        if (L && m) {
          if (currentMarkerRef.current) m.removeLayer(currentMarkerRef.current);
          currentMarkerRef.current = L.marker([posLL.lat, posLL.lng], {
            icon: L.divIcon({ className: '', html: '<div style="width:26px;height:26px;border-radius:50%;background:#ff7a45;border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,122,69,.25)"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
          }).addTo(m).bindPopup('📍 You are here').openPopup();
          m.flyTo([posLL.lat, posLL.lng], 14, { duration: 0.8 });
        }
        if (side === 'from') setFromId('current'); else setToId('current');
        toast('Using your current location 📍');
      },
      (err) => {
        setLocStatus('');
        const msg = err.code === 1 ? 'Location permission denied' : 'Could not get your location';
        toast(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function drawRoute() {
    const L = LRef.current;
    if (!L || !L.Routing) { toast('Map still loading — try again in a moment'); return; }
    if (!fromId || !toId) { toast('Pick a From and To spot (or use your location)'); return; }
    if (fromId === toId) { toast('Pick two different spots'); return; }

    const resolve = (id) => {
      if (id === 'current') return currentPos;
      const d = dests.find((x) => String(x.id) === String(id));
      return d ? { lat: d.lat, lng: d.lng } : null;
    };
    const a = resolve(fromId), b = resolve(toId);
    if (!a || !b) { toast('Could not resolve both points'); return; }

    if (routingRef.current && mapRef.current) mapRef.current.removeControl(routingRef.current);

    const routing = L.Routing.control({
      waypoints: [L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng)],
      // public OSRM demo; fall back to a second mirror if the first is down
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
      lineOptions: { styles: [{ color: '#ff7a45', weight: 5, opacity: 0.85 }] },
      show: false, addWaypoints: false, fitSelectedRoutes: true, createMarker: () => null,
    }).addTo(mapRef.current);

    routing.on('routesfound', (e) => {
      const r = e.routes[0];
      const aName = fromId === 'current' ? 'Your location' : dests.find((x) => String(x.id) === String(fromId))?.name;
      const bName = toId === 'current' ? 'Your location' : dests.find((x) => String(x.id) === String(toId))?.name;
      setRouteInfo({ a: aName, b: bName, km: (r.summary.totalDistance / 1000).toFixed(1), min: Math.round(r.summary.totalTime / 60) });
    });
    let errored = false;
    routing.on('routingerror', () => {
      if (errored) return; errored = true;
      toast('Routing service unavailable right now — try again shortly');
    });
    routingRef.current = routing;
  }

  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="container">
        <div className="section-head" style={{ textAlign: 'left', margin: '0 0 20px', maxWidth: 'none' }}>
          <span className="eyebrow">🗺️ OpenStreetMap</span>
          <h2 style={{ margin: '8px 0 4px' }}>The whole valley, on one map</h2>
          <p>Pick two spots to draw a real route between them — or use your live location. Click any destination to centre the map.</p>
        </div>

        <div className="map-controls">
          <MapLayers mapRef={mapRef} LRef={LRef} />
        </div>

        <div className="route-box">
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}><option value="">From…</option><option value="current">📍 My location</option>{dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <span style={{ color: 'var(--muted)' }}>→</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}><option value="">To…</option><option value="current">📍 My location</option>{dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <button className="btn btn-primary" onClick={drawRoute}>Draw route</button>
          <button className="btn btn-outline" onClick={clearRoute}>Clear</button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <button className="btn btn-amber" style={{ padding: '9px 16px' }} onClick={() => useMyLocation('from')}>📍 Use my location</button>
          {locStatus === 'locating' && <span className="muted" style={{ fontSize: '.85rem' }}>Locating you…</span>}
          {locStatus === 'ready' && <span className="muted" style={{ fontSize: '.85rem' }}>📍 Location ready — pick a destination and Draw route</span>}
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
