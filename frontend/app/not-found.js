import Link from 'next/link';

// Styled 404 — Next renders this for any unmatched route.
export default function NotFound() {
  return (
    <section className="section center" style={{ paddingTop: 90, paddingBottom: 90 }}>
      <div className="container">
        <div style={{ fontSize: '3.4rem', lineHeight: 1 }}>🧭</div>
        <h1 style={{ marginBottom: 6 }}>This trail leads nowhere</h1>
        <p className="muted" style={{ maxWidth: 460, margin: '0 auto 22px' }}>
          The page you were looking for isn&apos;t here. It may have moved, or the link was mistyped.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" href="/">Back home</Link>
          <Link className="btn btn-outline" href="/destinations">Browse destinations</Link>
          <Link className="btn btn-outline" href="/map">Open the map</Link>
        </div>
      </div>
    </section>
  );
}
