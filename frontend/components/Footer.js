export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="brand"><span className="logo">🌊</span> Pokhara Tú</div>
          <p style={{ color: '#9fb4c4', fontSize: '.9rem', maxWidth: 280 }}>An open, community-driven guide to the most beautiful city in Nepal.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <a href="/destinations">All destinations</a>
          <a href="/map">Full map</a>
          <a href="/destinations?cat=Viewpoint">Sunrise viewpoints</a>
        </div>
        <div>
          <h4>Account</h4>
          <a href="/login">Log in</a>
          <a href="/register">Sign up</a>
          <a href="/profile">My profile</a>
        </div>
        <div>
          <h4>About</h4>
          <a href="#">How it works</a>
          <a href="#">Contribute</a>
          <a href="#">Photo credits</a>
        </div>
      </div>
      <div className="container footer-bottom">© 2026 Pokhara Tú · Map data © OpenStreetMap contributors · Photos via Wikimedia Commons</div>
    </footer>
  );
}
