// Destination catalogue.
//
// Listing used to run 1 query for the rows plus 3 queries per row (avg, comment
// count, my rating). It is now a single query — see DEST_SELECT in db.js.
const express = require('express');
const router = express.Router();

const { q, DEST_SELECT, mapDestination, myRatingFor } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { RULES, isStr } = require('../validate');
const config = require('../config');

const LIST_HARD_CAP = 500; // never stream an unbounded table in one response

function publicCatalogue(res) {
  res.setHeader('Cache-Control', `public, max-age=${config.catalogueMaxAge}, stale-while-revalidate=${config.catalogueMaxAge * 2}`);
}

// GET /api/destinations  (optional ?category=&q=&featured=)
router.get('/', (req, res) => {
  const { category, q: search, featured } = req.query;

  if (search !== undefined && (!isStr(search) || search.length > RULES.QUERY_MAX)) {
    return res.status(400).json({ error: `q must be a string of at most ${RULES.QUERY_MAX} characters` });
  }
  if (category !== undefined && (!isStr(category) || category.length > RULES.CATEGORY_MAX)) {
    return res.status(400).json({ error: 'invalid category filter' });
  }

  let sql = `${DEST_SELECT} WHERE 1=1`;
  const params = [];
  if (category) { sql += ' AND d.category = ?'; params.push(category); }
  if (featured === '1') sql += ' AND d.featured = 1';
  if (search) {
    sql += ' AND (d.name LIKE ? OR d.short_desc LIKE ? OR d.tags LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY d.featured DESC, d.name ASC LIMIT ?';
  params.push(LIST_HARD_CAP);

  const rows = q(sql).all(...params).map((r) => mapDestination(r));
  publicCatalogue(res); // public + user-independent → brief browser/CDN caching
  res.json({ destinations: rows, count: rows.length });
});

// GET /api/destinations/:slug
router.get('/:slug', optionalAuth, (req, res) => {
  const slug = req.params.slug;
  if (!isStr(slug) || slug.length > RULES.SLUG_MAX) {
    return res.status(404).json({ error: 'destination not found' });
  }
  const row = q(`${DEST_SELECT} WHERE d.slug = ?`).get(slug);
  if (!row) return res.status(404).json({ error: 'destination not found' });

  const destination = mapDestination(row, myRatingFor(req.user && req.user.sub, row.id));
  if (req.user) res.setHeader('Cache-Control', 'private, no-store');
  else publicCatalogue(res);
  res.json({ destination });
});

module.exports = router;
