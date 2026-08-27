import './globals.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { AuthProvider } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Pokhara Tú — Discover the Jewel of the Himalayas',
  description: 'Explore Pokhara lakes, temples, viewpoints and caves with live OpenStreetMap navigation, ratings and traveller reviews.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          {children}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
