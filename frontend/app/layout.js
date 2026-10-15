import './globals.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { Sora, Manrope, Fraunces } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Particles from '@/components/decor/Particles';

const sora = Sora({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-display', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });

export const metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'Hamro Pokhara — हाम्रो पोखरा, Discover the Jewel of the Himalayas',
    template: '%s · Hamro Pokhara',
  },
  description: 'Explore Pokhara lakes, temples, viewpoints and caves with live OpenStreetMap navigation, ratings and traveller reviews.',
  keywords: ['Pokhara', 'Nepal', 'tourism', 'Phewa Lake', 'Sarangkot', 'travel guide'],
  openGraph: {
    type: 'website',
    siteName: 'Hamro Pokhara',
    title: 'Hamro Pokhara — discover the jewel of the Himalayas',
    description: 'Lakes, temples, viewpoints and caves in Pokhara, Nepal — with live map routing and traveller reviews.',
    images: ['/assets/images/phewa-lake.jpg'],
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable} ${fraunces.variable}`}>
      <body>
        <Particles />
        <AuthProvider>
          <Navbar />
          {children}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
