# CRM lead confirmation email

Customer-facing confirmation for leads that arrive from **Meta (Facebook/Instagram)
lead ads** into Zoho CRM. It echoes back what they submitted and sets the callback
expectation, so the lead knows they reached a real business and roughly when to
expect a call.

- Template: [zoho-lead-confirmation.html](zoho-lead-confirmation.html)
- Subject line to use: `M310 Land Works — We got your estimate request`

This folder is **not deployed** — it is listed in `.vercelignore`, because a stray
HTML file in the repo would otherwise be served as a public page on the website.

## Why this is separate from the website's auto-reply

Leads reach M310 by two different routes and each needs its own confirmation:

| Route | Confirmation sent by | Where it lives |
| --- | --- | --- |
| Website estimate forms | the site's own backend, via Resend | `sendAutoReply()` in [../api/lead.js](../api/lead.js) |
| Meta lead ads | Zoho CRM workflow | this template |

Meta leads never touch the website, so `/api/lead` never sees them. The two
emails are styled identically on purpose — same header, same palette, same
callback promise — so a customer who sees both does not think one is fake.

> The website route's auto-reply is **off by default**. It only sends when
> `LEAD_AUTOREPLY=true` is set in Vercel. Turn it on if you want website leads
> confirmed too, otherwise only Meta leads get an acknowledgement.

## Install it

1. **Zoho CRM → Setup → Templates → Email Templates → New Template.**
2. Module: **Leads**.
3. Switch the editor to **source / HTML view** (`</>` icon) and paste the whole
   file. Pasting into the rich-text view will mangle the inline styles.
4. Set the subject to `M310 Land Works — We got your estimate request`.
5. Set the **From** address to a verified Zoho sender on `m310landworks.com`, and
   **Reply-To** to `quote@m310landworks.com`.

## Wire the workflow

**Zoho CRM → Setup → Automation → Workflow Rules → Create Rule.**

- Module: **Leads**
- Execute on: **Create**
- Condition: `Lead Source` **is** the value Meta leads actually arrive with —
  commonly `Facebook`, `Facebook Ads`, or `Meta Lead Ads` depending on how the
  integration is configured. **Check one real Meta lead first**; guessing this is
  the most common reason the rule silently never fires.
- Instant action: **Email Notification** → the template above.

Add a second condition of `Email` **is not empty**. Meta lead forms can be
configured without an email question, and Zoho will otherwise try to send to
nobody and log a failure per lead.

## Field mapping — verify before going live

The template uses these merge fields. **Zoho renders an unknown field label as
empty text rather than raising an error**, so a mismatched label fails silently
and the customer gets a blank row.

| Template field | Standard Zoho? | Notes |
| --- | --- | --- |
| `${Leads.First Name}` | yes | also used in the greeting |
| `${Leads.Last Name}` | yes | Meta often dumps the whole name here |
| `${Leads.Phone}` | yes | check whether your mapping uses `Mobile` instead |
| `${Leads.Email}` | yes | |
| `${Leads.City}` / `${Leads.State}` | yes | only populated if your Meta form asks |
| `${Leads.Service Needed}` | **custom** | rename to your actual field label |
| `${Leads.Property Size}` | **custom** | rename to your actual field label |
| `${Leads.Description}` | yes | where free-text answers usually land |

To check the exact labels: **Setup → Customization → Modules and Fields → Leads**.
Merge fields use the field **label**, not the API name.

### If Meta puts the full name in Last Name

Common with Meta's single `full_name` question. The greeting then reads
"Thanks, — we've got your request." Fix either by splitting the name in the Meta
form (separate first/last questions), or by replacing `${Leads.First Name}` in
the greeting with `${Leads.Last Name}`.

## The blank-row limitation

Zoho email templates have **no conditional logic**. An unanswered question leaves
an empty cell instead of hiding the row, which looks like a bug to the customer.

Two ways to handle it:

1. **Simple** — delete any optional row from the template that your Meta form does
   not mark required. The rows are individually commented in the file.
2. **Robust** — replace the Email Notification action with a **Custom Function**
   (Deluge) that builds the same HTML with `if` checks around each row and sends
   via `sendmail`. More setup, but rows disappear cleanly when empty and you can
   reuse one function for both brands.

## Test before enabling

Create a Lead manually with `Lead Source` set to your Meta value and a real email
you control, and confirm:

- the email arrives and is not in spam (check SPF/DKIM on the Zoho sending domain)
- every row is populated — any blank row means a wrong field label
- the greeting shows a first name
- the phone button dials on a mobile
- Reply-To lands in `quote@m310landworks.com`

Then delete the test lead so it does not sit in the pipeline.
