// GET /api/leads — read back what /api/lead stored.
//
// A private Blob store is only reachable through an authenticated request, so
// without this route the archive is dashboard-only. Guarded by a shared secret
// in LEADS_ADMIN_KEY; if that variable is unset the route refuses to run at all.
//
//   /api/leads?key=…                       newest 50, each with its details
//   /api/leads?key=…&prefix=leads/2026/08  one month
//   /api/leads?key=…&full=1                same, but every stored field
//   /api/leads?key=…&format=csv            flattened export for a spreadsheet
//   /api/leads?key=…&index=1               names only, no record bodies (cheap)
//   /api/leads?key=…&pathname=leads/…json  one full record

import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { get, list } from '@vercel/blob';

const ADMIN_KEY = process.env.LEADS_ADMIN_KEY;
const BLOB_ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';

const MAX_CSV_ROWS = 250;
const FETCH_CONCURRENCY = 8;

// The default listing reads each blob so the response is actually useful on its
// own. Capped because every row is one Blob round-trip inside a 15s function.
const MAX_HYDRATE_ROWS = 100;

// What a listing row shows without `full=1` — enough to decide who to call back.
const SUMMARY = (r) => ({
  receivedAt: r.receivedAt,
  name: r.lead?.full_name ?? null,
  phone: r.lead?.phone ?? null,
  email: r.lead?.email ?? null,
  address: r.lead?.property_address ?? null,
  service: r.lead?.service_needed ?? null,
  propertySize: r.lead?.property_size ?? null,
  message: r.lead?.message ?? null,
  city: [r.source?.city, r.source?.region].filter(Boolean).join(', ') || null,
  page: r.source?.page ?? null,
  utmSource: r.utm?.utm_source ?? null,
  suspectedBot: r.signals?.suspectedBot ?? null,
  id: r.id,
});
const CSV_COLUMNS = [
  ['receivedAt', (r) => r.receivedAt],
  ['name', (r) => r.lead?.full_name],
  ['phone', (r) => r.lead?.phone],
  ['email', (r) => r.lead?.email],
  ['address', (r) => r.lead?.property_address],
  ['service', (r) => r.lead?.service_needed],
  ['property_size', (r) => r.lead?.property_size],
  ['message', (r) => r.lead?.message],
  ['consent', (r) => r.lead?.consent],
  ['page', (r) => r.source?.page],
  ['city', (r) => r.source?.city],
  ['region', (r) => r.source?.region],
  ['utm_source', (r) => r.utm?.utm_source],
  ['utm_medium', (r) => r.utm?.utm_medium],
  ['utm_campaign', (r) => r.utm?.utm_campaign],
  ['suspectedBot', (r) => r.signals?.suspectedBot],
  ['id', (r) => r.id],
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return text(res, 'Method not allowed', 405, { Allow: 'GET' });
  if (!ADMIN_KEY) return text(res, 'Lead export is not configured.', 503);

  const { searchParams } = new URL(req.url, `https://${req.headers.host || 'local'}`);
  const auth = req.headers.authorization || '';
  const supplied = auth.replace(/^Bearer\s+/i, '') || searchParams.get('key') || '';
  if (!matches(supplied, ADMIN_KEY)) return text(res, 'Unauthorized', 401);

  const pathname = searchParams.get('pathname');
  if (pathname) return one(res, pathname);

  const prefix = searchParams.get('prefix') || 'leads/';
  const limit = clampInt(searchParams.get('limit'), 50, 1, 1000);
  const listing = await list({ prefix, limit, cursor: searchParams.get('cursor') || undefined });

  // list() returns ascending pathnames; our names are timestamped, so reversing
  // puts the newest lead first.
  const blobs = [...listing.blobs].reverse();

  if (searchParams.get('format') === 'csv') return csv(res, blobs.slice(0, MAX_CSV_ROWS));

  // Opt back in to the cheap names-only listing.
  if (isTrue(searchParams.get('index'))) {
    return json(res, {
      count: blobs.length,
      hasMore: listing.hasMore,
      cursor: listing.cursor ?? null,
      leads: blobs.map((blob) => ({
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
        size: blob.size,
      })),
    });
  }

  const page = blobs.slice(0, MAX_HYDRATE_ROWS);
  const shape = isTrue(searchParams.get('full')) ? (r) => r : SUMMARY;
  const hydrated = await hydrate(page);

  return json(res, {
    count: hydrated.length,
    truncated: blobs.length > page.length ? blobs.length - page.length : 0,
    hasMore: listing.hasMore,
    cursor: listing.cursor ?? null,
    leads: hydrated.map(({ pathname, record }) => ({ pathname, ...shape(record) })),
  });
}

// Reads each blob body, concurrency-limited. Unreadable blobs are dropped rather
// than failing the whole listing — one corrupt record shouldn't hide the rest.
async function hydrate(blobs) {
  const out = [];
  for (let i = 0; i < blobs.length; i += FETCH_CONCURRENCY) {
    const batch = await Promise.all(
      blobs.slice(i, i + FETCH_CONCURRENCY).map(async (blob) => {
        try {
          const result = await get(blob.pathname, { access: BLOB_ACCESS });
          if (!result || result.statusCode !== 200) return null;
          return { pathname: blob.pathname, record: JSON.parse(await new Response(result.stream).text()) };
        } catch {
          return null;
        }
      })
    );
    out.push(...batch.filter(Boolean));
  }
  return out;
}

function isTrue(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

async function one(res, pathname) {
  if (!pathname.startsWith('leads/')) return text(res, 'Not found', 404);
  const result = await get(pathname, { access: BLOB_ACCESS });
  if (!result || result.statusCode !== 200) return text(res, 'Not found', 404);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  Readable.fromWeb(result.stream).pipe(res);
}

async function csv(res, blobs) {
  const records = (await hydrate(blobs)).map(({ record }) => record);

  const rows = [CSV_COLUMNS.map(([header]) => header).join(',')];
  for (const record of records) {
    rows.push(CSV_COLUMNS.map(([, read]) => cell(read(record))).join(','));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="m310-landworks-leads.csv"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(rows.join('\r\n'));
}

function cell(value) {
  if (value === undefined || value === null) return '';
  const s = String(value);
  // Neutralise spreadsheet formula injection from free-text fields.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function matches(supplied, expected) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function json(res, payload, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(payload, null, 2));
}

function text(res, message, status, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(message);
}
