# Lead capture

Both estimate forms on the site (the inline one on the homepage and the one on
[contact.html](contact.html)) post to `/api/lead`. That endpoint does two
independent things:

1. **Stores** the full submission as JSON in **Vercel Blob** — the permanent record.
2. **Emails** a notification through the **Resend HTTP API** — the alert.

They are decoupled on purpose. If Resend has an outage the lead is still stored;
if Blob has an outage the email still arrives. The request only fails when both
fail, which is the only case where a lead would actually be lost. The JSON
response says which of the two succeeded (`stored` / `notified`).

Every notification also carries the full record as a **JSON attachment**, so even
if the Blob write is the half that failed, the raw lead is still sitting in the
inbox.

## Where the email goes

`quote@m310landworks.com`, plus Yashwanth and Mario — set in `LEAD_TO_EMAIL`.
`reply_to` is set to the customer's address when they gave one, so hitting Reply
in the inbox answers the customer directly rather than the send address.

Subject line looks like:

```
🌲 New Estimate Request — Dale Whitcomb · Storm debris, 1–5 acres
```

Name plus the two facts that decide whether it's worth calling back immediately,
which is all that fits in a phone notification.

The HTML body leads with the name, a tap-to-call phone number and a
Reply-by-Email button, then the job details, then a small provenance block
(page, city, UTM tags, blob path). It is table-based with fully inline styles and
no external assets, so it renders the same in Gmail, Outlook and Apple Mail and
does not trip remote-content blocking.

## Why Resend

The site has no server, but Vercel Functions *are* the backend — the `api/`
folder deploys as serverless functions on the Hobby plan at no cost. From a
function, sending mail is just an HTTPS POST, so the only requirement is an
email provider with a plain REST API (no SMTP sockets, which serverless
functions handle badly anyway).

Resend fits: REST API, free tier of 3,000 emails/month (100/day), one custom
domain, 30-day log retention, and a first-party Vercel integration. Volume here
is a few leads a day, so the free tier is ample.

This is the same setup as the M310 Renovations site — same shape, same env var
names — so whatever you learn on one applies to the other.

If you ever outgrow it, the drop-in alternatives with the same shape (one
authenticated POST, JSON body) are **Postmark**, **Mailgun**, and **AWS SES**.
Only `sendNotification()` in [api/lead.js](api/lead.js) would change.

## One-time setup

### 1. Blob store

Vercel dashboard → project → **Storage** → **Create Database** → **Blob** →
set access to **Private** (leads are personal data — a public store hands out
readable URLs). Connect it to this project for Production and Preview.

Vercel injects the credentials automatically; you don't need to copy a token.

### 2. Resend

1. Sign up at [resend.com](https://resend.com) and add `m310landworks.com`
   under **Domains**.
2. Add the DKIM/SPF DNS records it shows you and wait for **Verified**.
   Until the domain verifies, mail from that address will be rejected.
3. **API Keys** → create one with *Sending access* → copy the `re_…` value.

### 3. Environment variables

Project → **Settings** → **Environment Variables**, for Production *and*
Preview. See [.env.example](.env.example) for the full annotated list; the
required ones are:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | the `re_…` key from step 2 |
| `LEAD_TO_EMAIL` | `quote@m310landworks.com,yashwanth.challa@insurancemasters.biz,mario@insurancemasters.biz` |
| `LEAD_FROM_EMAIL` | `M310 Land Works <leads@m310landworks.com>` — must be the verified domain |
| `BLOB_ACCESS` | `private` (match how you created the store) |
| `LEADS_ADMIN_KEY` | long random string, only if you want the export endpoint |

> **Every recipient requires a verified domain.** Until `m310landworks.com`
> verifies, Resend refuses the whole send — not just one address — with a 403.
> Keep `LEAD_TO_EMAIL` at a single address you control while the domain is
> pending, and add the rest the moment it verifies. Leads are archived in Blob
> either way, and the notification carries the JSON attachment.

Optional: `LEAD_BCC_EMAIL`, `LEAD_AUTOREPLY=true` to send the customer a
branded confirmation, `ALLOWED_ORIGIN_HOSTS` for extra staging domains.

Redeploy after adding them — env vars are baked in at deploy time.

## Reading leads back

A private Blob store needs an authenticated request, so leads are visible in the
Vercel dashboard (Storage → your store) or through `GET /api/leads`, which is
gated on `LEADS_ADMIN_KEY`. Leave that variable unset and the endpoint returns
503 and does nothing.

```
/api/leads?key=…                        newest 50, as a JSON index
/api/leads?key=…&prefix=leads/2026/08   one month
/api/leads?key=…&limit=200&format=csv   spreadsheet export (max 250 rows)
/api/leads?key=…&pathname=leads/…json   one full record
```

The key also works as `Authorization: Bearer …`. Blobs are stored at
`leads/YYYY/MM/<timestamp>-<name>.json`, so they sort chronologically with no
separate index.

## Spam handling

- **Honeypot** — a `company_website` field positioned off-canvas and hidden from
  assistive tech. Anything that fills it gets a `200 OK` and is silently dropped,
  so the bot never learns it was caught.
- **Fill timing** — `form_render_ts` is stamped by JS when the page loads.
  Submissions under two seconds are recorded with `suspectedBot: true` and get a
  warning banner in the email. This only annotates; it never rejects, so a fast
  real person is never lost.
- **Origin check** — cross-origin POSTs are refused.
- **Field allowlist** — only the known form fields are persisted, capped at 5,000
  characters each and 32 KB per request. Extra keys in the payload are discarded.
- **Escaping** — every value is HTML-escaped into the email, and the subject is
  collapsed to one line so a pasted newline cannot split the header.

If spam ever gets through at volume, add [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
— a free invisible check, verified with one more `fetch` in the handler.

## Local development

```bash
npm install
vercel env pull      # writes .env.local with the Blob + Resend credentials
vercel dev
```

`.env*` files are gitignored. Never commit the Resend key or the admin key.

## Files

| File | Role |
| --- | --- |
| [api/lead.js](api/lead.js) | accepts submissions, writes the blob, sends the email |
| [api/leads.js](api/leads.js) | authenticated read-back and CSV export |
| [assets/site.js](assets/site.js) | form submit handler, timestamp stamping, inline errors |
| [.env.example](.env.example) | annotated list of every variable |
