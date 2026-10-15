// Site-wide error boundary — shown when a page throws instead of a blank screen.
'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Keep the stack in the browser console; never render it to the visitor.
    console.error('page error:', error);
  }, [error]);

  return (
    <section className="section center" style={{ paddingTop: 90, paddingBottom: 90 }}>
      <div className="container">
        <div style={{ fontSize: '3rem', lineHeight: 1 }}>⛰️</div>
        <h1 style={{ marginBottom: 6 }}>That view is fogged in</h1>
        <p className="muted" style={{ maxWidth: 460, margin: '0 auto 22px' }}>
          Something went wrong loading this page. Try again — if it keeps happening, the API may be down.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
          <a className="btn btn-outline" href="/">Back home</a>
        </div>
      </div>
    </section>
  );
}
