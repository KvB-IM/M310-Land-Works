// POST /api/lead — the only backend this site needs.
//
// Two things happen per submission, independently:
//   1. The full record is written to Vercel Blob (system of record, never lost).
//   2. A notification email goes out through the Resend HTTP API (no SMTP).
//
// They are deliberately decoupled: if Resend is down the lead is still stored,
// and if Blob is down the email still goes out. We only fail the request when
// BOTH fail, because that is the only case where the lead is actually gone.

import { put } from '@vercel/blob';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TURNSTILE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Cloudflare Turnstile. Only the secret lives here — the site key is public and
// sits in the HTML. Leave this unset and the check is skipped entirely, so the
// form keeps working before the variable is added in Vercel.
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_TIMEOUT_MS = 5000;
const LEAD_TO =
  process.env.LEAD_TO_EMAIL ||
  'quote@m310landworks.com,yashwanth.challa@insurancemasters.biz,mario@insurancemasters.biz';
const LEAD_FROM = process.env.LEAD_FROM_EMAIL || 'M310 Land Works <leads@m310landworks.com>';
const LEAD_BCC = process.env.LEAD_BCC_EMAIL || '';
const AUTOREPLY = process.env.LEAD_AUTOREPLY === 'true';
const BLOB_ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
const ALLOWED_HOSTS = (process.env.ALLOWED_ORIGIN_HOSTS || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const PHONE_DISPLAY = '(803) 634-1616';
const PHONE_HREF = 'tel:+18036341616';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_FIELD_CHARS = 5000;
// A human cannot read the form, type a name and a phone number, and submit in
// under two seconds. Bots routinely do. This only flags — it never rejects.
const MIN_FILL_MS = 2000;

// Allowlist. Anything a client posts that is not in here is discarded, so a
// scripted POST can't stuff 500 junk keys into the blob or the email body.
const LEAD_FIELDS = {
  full_name: 'Name',
  phone: 'Phone',
  email: 'Email',
  property_address: 'Property address / city',
  service_needed: 'What needs clearing',
  property_size: 'Property size',
  message: 'Project details',
  consent: 'Consent to contact',
  brand: 'Brand',
};

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, { error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }

  if (!isSameSite(req)) {
    return json(res, { error: 'Forbidden.' }, 403);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    if (err.code === 'BODY_TOO_LARGE') return json(res, { error: 'Payload too large.' }, 413);
    return json(res, { error: 'Invalid JSON body.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(res, { error: 'Invalid body.' }, 400);
  }

  // Honeypot: a hidden input no sighted user or screen reader ever reaches.
  // Filled means bot. Answer 200 so the bot believes it succeeded and moves on.
  if (clean(body.company_website)) {
    return json(res, { ok: true });
  }

  const lead = {};
  for (const key of Object.keys(LEAD_FIELDS)) {
    const value = clean(body[key]);
    if (value) lead[key] = value;
  }

  const errors = [];
  if (!lead.full_name) errors.push('full_name');
  if (!lead.phone) errors.push('phone');
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) errors.push('email');
  if (errors.length) {
    return json(res, { error: 'Please check the highlighted fields.', fields: errors }, 400);
  }

  const clientIp = header(req, 'x-forwarded-for')?.split(',')[0].trim() || null;

  // Turnstile is checked after field validation on purpose: a token is
  // single-use, so burning it on an error the browser could have caught would
  // force the visitor to solve a second challenge to fix a typo.
  const turnstile = await verifyTurnstile(clean(body['cf-turnstile-response']), clientIp);
  if (turnstile.status === 'missing' || turnstile.status === 'failed') {
    return json(
      res,
      { error: 'Please complete the human-verification check and submit again.', fields: ['turnstile'] },
      400
    );
  }

  const now = new Date();
  const elapsedMs = fillTime(body.form_render_ts, now);
  const utm = {};
  for (const key of UTM_FIELDS) {
    const value = clean(body[key]);
    if (value) utm[key] = value;
  }

  const record = {
    id: crypto.randomUUID(),
    receivedAt: now.toISOString(),
    lead,
    utm,
    source: {
      page: clean(body.page) || header(req, 'referer') || null,
      userAgent: header(req, 'user-agent') || null,
      ip: clientIp,
      country: header(req, 'x-vercel-ip-country') || null,
      region: header(req, 'x-vercel-ip-country-region') || null,
      city: geo(header(req, 'x-vercel-ip-city')) || null,
    },
    signals: {
      fillTimeMs: elapsedMs,
      // Not a verdict, just a note in the record so you can spot a spam wave later.
      suspectedBot: elapsedMs !== null && elapsedMs < MIN_FILL_MS,
      // 'passed' | 'disabled' | 'provider-unreachable' | 'provider-error'.
      // The two provider states mean the lead was let through unverified.
      turnstile: turnstile.status,
    },
  };

  const serialized = JSON.stringify(record, null, 2);
  const pathname = blobPathname(now, lead.full_name);

  const [stored, mailed] = await Promise.allSettled([
    put(pathname, serialized, {
      access: BLOB_ACCESS,
      contentType: 'application/json',
      addRandomSuffix: true,
      cacheControlMaxAge: 60,
    }),
    sendNotification(record, serialized, pathname),
  ]);

  if (stored.status === 'rejected') console.error('[lead] blob write failed:', stored.reason);
  if (mailed.status === 'rejected') console.error('[lead] notification email failed:', mailed.reason);

  if (stored.status === 'rejected' && mailed.status === 'rejected') {
    return json(res, { error: `We could not save your request. Please call ${PHONE_DISPLAY}.` }, 502);
  }

  // Best-effort courtesy reply to the property owner. Never fails the request.
  if (AUTOREPLY && lead.email) {
    try {
      await sendAutoReply(lead);
    } catch (err) {
      console.error('[lead] auto-reply failed:', err);
    }
  }

  return json(res, {
    ok: true,
    id: record.id,
    stored: stored.status === 'fulfilled',
    notified: mailed.status === 'fulfilled',
  });
}

/* -------------------------------------------------------------- turnstile
 * Returns a status rather than a boolean, because "the visitor failed the
 * challenge" and "Cloudflare did not answer us" need opposite handling:
 *
 *   missing / failed      -> reject. This is the bot case.
 *   disabled              -> no secret configured; check skipped.
 *   provider-unreachable  -> Cloudflare is down or slow. Let the lead through.
 *   provider-error        -> Cloudflare answered but not usefully. Same.
 *
 * Failing open on provider trouble is deliberate. A Cloudflare outage would
 * otherwise silently block every real estimate request on the site, which costs
 * far more than the handful of bots the honeypot and fill-timer already catch.
 * Whichever way it goes is recorded in the lead so a spam wave stays diagnosable.
 */
async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET) return { status: 'disabled' };
  if (!token) return { status: 'missing' };

  const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  if (ip) form.set('remoteip', ip);

  let response;
  try {
    response = await fetch(TURNSTILE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[lead] turnstile unreachable:', err);
    return { status: 'provider-unreachable' };
  }

  if (!response.ok) {
    console.error('[lead] turnstile HTTP', response.status);
    return { status: 'provider-error' };
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.success !== 'boolean') {
    console.error('[lead] turnstile sent an unreadable body');
    return { status: 'provider-error' };
  }

  if (data.success) return { status: 'passed' };

  const codes = data['error-codes'] || [];
  console.warn('[lead] turnstile rejected a submission:', codes.join(', '));
  return { status: 'failed', codes };
}

/* ------------------------------------------------------------------ email */

async function sendNotification(record, serialized, pathname) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set.');

  const { lead } = record;

  // Subject is built to be scannable in a phone notification: what it is, who
  // it is, and the two facts that decide whether you call back right now.
  // oneLine() because a pasted newline in a field would otherwise split the header.
  // Brand leads the subject so Land Works leads are distinguishable at a glance
  // from M310 Renovations leads, which land in the same inboxes.
  const detail = [lead.service_needed, lead.property_size].filter(Boolean).join(', ');
  const subject = oneLine(
    `🌲 M310 Land Works — New Estimate Request: ${lead.full_name}${detail ? ` · ${detail}` : ''}`
  );

  // [key, label, value] — the key is kept so the HTML can skip the fields it
  // already shows in the prominent contact block. Plaintext keeps every field.
  const rows = Object.entries(LEAD_FIELDS)
    .filter(([key]) => lead[key])
    .map(([key, label]) => [key, label, lead[key]]);

  const context = [
    ['Received', formatStamp(record.receivedAt)],
    ['Page', record.source.page],
    ['Location', [record.source.city, record.source.region, record.source.country].filter(Boolean).join(', ')],
    ...Object.entries(record.utm).map(([k, v]) => [k, v]),
    ['Stored at', pathname],
  ].filter(([, value]) => value);

  const payload = {
    from: LEAD_FROM,
    to: LEAD_TO.split(',').map((address) => address.trim()).filter(Boolean),
    subject,
    // reply_to makes the notification directly answerable from the inbox.
    ...(lead.email ? { reply_to: lead.email } : {}),
    ...(LEAD_BCC ? { bcc: LEAD_BCC.split(',').map((a) => a.trim()).filter(Boolean) } : {}),
    text: textBody(rows, context, record),
    html: htmlBody(rows, context, record),
    attachments: [
      {
        filename: `${pathname.split('/').pop()}`,
        content: Buffer.from(serialized).toString('base64'),
      },
    ],
  };

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // A retried submission with the same id will not double-send.
      'Idempotency-Key': record.id,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function sendAutoReply(lead) {
  if (!RESEND_API_KEY) return;
  const firstName = lead.full_name.split(/\s+/)[0];

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: LEAD_FROM,
      to: [lead.email],
      reply_to: LEAD_TO.split(',')[0].trim(),
      subject: 'M310 Land Works — We got your estimate request',
      text:
        `Hi ${firstName},\n\n` +
        'Thanks for reaching out to M310 Land Works. We have your request and someone from our ' +
        'crew will call you shortly to schedule your free on-site estimate.\n\n' +
        `Need us sooner? Call ${PHONE_DISPLAY}. We answer 7 days a week, with 24/7 storm response.\n\n` +
        'M310 Land Works\n332 Edgefield Rd, North Augusta, SC 29841\n',
      html: autoReplyHtml(firstName),
    }),
  });

  if (!response.ok) throw new Error(`Resend auto-reply ${response.status}: ${await response.text()}`);
}

function textBody(rows, context, record) {
  const lines = ['New estimate request from the M310 Land Works website.', ''];
  for (const [, label, value] of rows) lines.push(`${label}: ${value}`);
  lines.push('', '--- context ---');
  for (const [label, value] of context) lines.push(`${label}: ${value}`);
  if (record.signals.suspectedBot) lines.push('', 'NOTE: submitted suspiciously fast — possible spam.');
  return lines.join('\n');
}

/* --------------------------------------------------------------- html mail
 * Everything is inline-styled with table layout and no external assets. Gmail,
 * Outlook and Apple Mail all strip <style> blocks or rewrite classes, so the
 * brand palette (orange #F26B1F on ink #141414) is written directly onto cells.
 */

const ORANGE = '#F26B1F';
const ORANGE_DEEP = '#EA5B0C';
const INK = '#141414';
const CHARCOAL = '#232323';
const CREAM = '#F7F4F0';
const BORDER = '#E4DED7';
const MUTED = '#6E6A64';
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function htmlBody(rows, context, record) {
  const { lead } = record;

  // Skip what the contact block above already states in larger type.
  const SHOWN_ABOVE = new Set(['full_name', 'phone', 'email']);
  const cells = rows
    .filter(([key]) => !SHOWN_ABOVE.has(key))
    .map(
      ([, label, value], i) =>
        `<tr>
          <td style="padding:11px 16px;background:${i % 2 ? '#FBF9F7' : CREAM};border-bottom:1px solid ${BORDER};font:600 11px/1.4 ${SANS};color:${MUTED};text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;vertical-align:top">${esc(
          label
        )}</td>
          <td style="padding:11px 16px;background:#ffffff;border-bottom:1px solid ${BORDER};font:15px/1.55 ${SANS};color:${INK};vertical-align:top">${esc(
          value
        ).replace(/\n/g, '<br>')}</td>
        </tr>`
    )
    .join('');

  const meta = context
    .map(
      ([label, value]) =>
        `<tr><td style="padding:3px 0;font:12px/1.5 ${SANS};color:#9A958E;white-space:nowrap;vertical-align:top">${esc(
          label
        )}</td><td style="padding:3px 0 3px 12px;font:12px/1.5 ${SANS};color:${MUTED};word-break:break-word">${esc(
          value
        )}</td></tr>`
    )
    .join('');

  // Tap targets first: on a phone these two buttons are the whole point.
  const actions = [
    `<a href="${PHONE_HREF}" style="display:inline-block;background:${ORANGE};color:#ffffff;font:700 14px/1 ${SANS};text-transform:uppercase;letter-spacing:.05em;text-decoration:none;padding:14px 22px;border-radius:6px">Call ${esc(
      PHONE_DISPLAY
    )}</a>`,
    lead.email
      ? `<a href="mailto:${esc(lead.email)}" style="display:inline-block;background:#ffffff;color:${INK};font:700 14px/1 ${SANS};text-transform:uppercase;letter-spacing:.05em;text-decoration:none;padding:13px 21px;border:1px solid ${INK};border-radius:6px">Reply by Email</a>`
      : '',
  ]
    .filter(Boolean)
    .map((button) => `<td style="padding:0 8px 8px 0">${button}</td>`)
    .join('');

  const phoneDigits = lead.phone.replace(/[^\d+]/g, '');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#EFEBE6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(lead.full_name)} · ${esc(
    lead.phone
  )}${lead.service_needed ? ` · ${esc(lead.service_needed)}` : ''}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEBE6;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER}">

      <tr><td style="background:${INK};padding:22px 24px">
        <div style="font:700 27px/1.15 ${SANS};color:#ffffff;letter-spacing:-.01em">M310 Land Works<span style="color:${ORANGE}">.</span></div>
        <div style="height:3px;background:${ORANGE};margin:14px 0 14px;width:52px"></div>
        <div style="font:700 21px/1.25 ${SANS};color:#ffffff;text-transform:uppercase;letter-spacing:.01em">New Estimate Request</div>
        <div style="font:14px/1.5 ${SANS};color:${ORANGE};margin-top:5px">${esc(
    formatStamp(record.receivedAt)
  )}</div>
      </td></tr>

      ${
        record.signals.suspectedBot
          ? `<tr><td style="background:#FFF6DE;border-bottom:1px solid #F0E0AF;padding:12px 24px;font:13px/1.5 ${SANS};color:#7A5C00"><strong>Submitted unusually fast.</strong> Could be a bot — worth a glance before you call.</td></tr>`
          : ''
      }

      <tr><td style="padding:24px 24px 8px">
        <div style="font:600 11px/1 ${SANS};color:${MUTED};text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Contact</div>
        <div style="font:700 24px/1.2 ${SANS};color:${INK}">${esc(lead.full_name)}</div>
        <div style="margin-top:8px"><a href="tel:${esc(
          phoneDigits
        )}" style="font:600 19px/1.3 ${SANS};color:${ORANGE_DEEP};text-decoration:none">${esc(lead.phone)}</a></div>
        ${
          lead.email
            ? `<div style="margin-top:4px"><a href="mailto:${esc(
                lead.email
              )}" style="font:15px/1.5 ${SANS};color:${CHARCOAL};text-decoration:none;border-bottom:1px solid ${BORDER}">${esc(
                lead.email
              )}</a></div>`
            : ''
        }
      </td></tr>

      <tr><td style="padding:16px 24px 4px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>${actions}</tr></table>
      </td></tr>

      <tr><td style="padding:12px 24px 24px">
        <div style="font:600 11px/1 ${SANS};color:${MUTED};text-transform:uppercase;letter-spacing:.1em;margin:8px 0 10px">The Request</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;border-collapse:separate">${cells}</table>
      </td></tr>

      <tr><td style="background:${CREAM};border-top:1px solid ${BORDER};padding:16px 24px">
        <div style="font:600 10px/1 ${SANS};color:#9A958E;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Where it came from</div>
        <table role="presentation" cellpadding="0" cellspacing="0">${meta}</table>
      </td></tr>

      <tr><td style="background:${INK};padding:16px 24px;font:12px/1.6 ${SANS};color:rgba(255,255,255,.55)">
        M310 Land Works · 332 Edgefield Rd, North Augusta, SC 29841<br>
        Full record attached as JSON and archived in Vercel Blob.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function autoReplyHtml(firstName) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#EFEBE6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEBE6;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER}">
      <tr><td style="background:${INK};padding:22px 24px">
        <div style="font:700 25px/1.15 ${SANS};color:#ffffff;letter-spacing:-.01em">M310 Land Works<span style="color:${ORANGE}">.</span></div>
        <div style="height:3px;background:${ORANGE};margin-top:12px;width:46px"></div>
      </td></tr>
      <tr><td style="padding:28px 24px 8px">
        <div style="font:700 22px/1.3 ${SANS};color:${INK}">Thanks, ${esc(firstName)} — we got it.</div>
        <p style="font:15px/1.65 ${SANS};color:${CHARCOAL};margin:14px 0 0">Someone from our crew will call you shortly to schedule your <strong>free on-site estimate</strong>. No obligation, no pressure.</p>
        <p style="font:15px/1.65 ${SANS};color:${CHARCOAL};margin:14px 0 0">Need us sooner? We answer 7 days a week, with 24/7 storm response.</p>
      </td></tr>
      <tr><td style="padding:20px 24px 28px">
        <a href="${PHONE_HREF}" style="display:inline-block;background:${ORANGE};color:#ffffff;font:700 15px/1 ${SANS};text-transform:uppercase;letter-spacing:.05em;text-decoration:none;padding:15px 26px;border-radius:6px">Call ${esc(
    PHONE_DISPLAY
  )}</a>
      </td></tr>
      <tr><td style="background:${INK};padding:16px 24px;font:12px/1.6 ${SANS};color:rgba(255,255,255,.55)">
        M310 Land Works · 332 Edgefield Rd, North Augusta, SC 29841<br>
        Land clearing &amp; site work across the CSRA.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/* ----------------------------------------------------------------- helpers */

function clean(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : '';
  const text = String(value).replace(/\r\n/g, '\n').trim();
  if (text === 'on') return 'Yes'; // unchecked checkboxes are simply absent
  return text.slice(0, MAX_FIELD_CHARS);
}

// "Aug 12, 2026 at 2:47 PM ET" reads faster in an inbox than an ISO string.
// The crew works one timezone, so a fixed zone is correct and keeps this deps-free.
function formatStamp(iso) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso)) + ' ET';
  } catch {
    return iso;
  }
}

// Subject lines are a single header — collapse any embedded newlines/runs of
// whitespace and cap the length so long pasted text can't bloat the header.
function oneLine(value) {
  const flat = String(value).replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}

function fillTime(renderedAt, now) {
  const started = Number(renderedAt);
  if (!Number.isFinite(started) || started <= 0) return null;
  const elapsed = now.getTime() - started;
  return elapsed >= 0 && elapsed < 86_400_000 ? elapsed : null;
}

// leads/2026/08/2026-08-12T14-32-07Z-jane-doe.json — sorts chronologically in
// the Blob dashboard and in list() output without any extra index.
function blobPathname(now, name) {
  const stamp = now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  const slug =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'lead';
  return `leads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${stamp}-${slug}.json`;
}

// Blocks cross-origin scripted POSTs. Requests with no Origin header (curl,
// some privacy tooling) are allowed through — the honeypot handles those.
function isSameSite(req) {
  const origin = header(req, 'origin');
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  // The apex redirects to www, so compare registrable host, not the exact one.
  const self = (header(req, 'host') || '').toLowerCase();
  if (bareHost(host) === bareHost(self)) return true;
  if (host.endsWith('.vercel.app')) return true;
  return ALLOWED_HOSTS.includes(host);
}

function bareHost(host) {
  return host.replace(/^www\./, '');
}

function header(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value || '';
}

// Vercel percent-encodes the geo headers, so "North Augusta" arrives as
// "North%20Augusta" and would otherwise be stored that way.
function geo(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Vercel's Node runtime pre-parses JSON bodies onto req.body, but that is not
// guaranteed for every content-type, so fall back to reading the stream.
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('Body too large');
      err.code = 'BODY_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json(res, payload, status = 200, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}
