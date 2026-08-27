require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { db, seedIfEmpty } = require('./db');
const authRoutes = require('./routes/auth');
const destinationRoutes = require('./routes/destinations');
const ratingRoutes = require('./routes/ratings');
const commentRoutes = require('./routes/comments');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/destinations', destinationRoutes);      // list + single
app.use('/api/destinations', ratingRoutes);           // nested ratings
app.use('/api/destinations', commentRoutes);          // nested comments
app.use('/api/users', userRoutes);

// --- health ---
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- static frontend ---
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// SPA-ish fallback: any unknown non-api route serves index.html
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Seed destinations on boot
seedIfEmpty();

app.listen(PORT, () => {
  console.log(`🌊 Pokhara Tourism API running on http://localhost:${PORT}`);
});
