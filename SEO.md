# Discoverability — search and AI assistants

What was changed, how to regenerate it, and the work that cannot be done from
inside this repo.

## The honest summary

Being cited by an AI assistant for "land clearing near Augusta" comes down to
three things. Only the first two are in this repo:

1. **Can a crawler reach and parse the site?** Fixed here.
2. **Does the page answer the question in extractable form?** Fixed here — that
   is what the FAQ sections are for.
3. **Do off-site sources corroborate it?** Google Business Profile, reviews, and
   directory citations. **Not in this repo, and it is the biggest remaining
   factor.** See [Off-site work](#off-site-work-not-in-this-repo).

Anyone promising AI visibility from code changes alone is overselling. The code
side is now genuinely solid; the off-site side is untouched.

## What changed

### URLs — the significant technical fix

The site is served at **www** with `cleanUrls: true`, so `m310landworks.com/contact.html`
took **two 308 redirects** to reach `www.m310landworks.com/contact`. Every
canonical tag, `og:url`, sitemap entry and internal link used that redirecting
form. Search engines discount a canonical that does not resolve directly, so the
site was undermining its own indexing on every page.

Now everything points at the form the server actually serves: 36 absolute URLs,
298 internal links, and all 11 sitemap entries. Nav clicks no longer redirect.

### Structured data

Before: one hand-written `LocalBusiness` block on the homepage. Ten pages had none
— including all six service pages, which are exactly what an assistant would cite.

Now every page carries a single `@graph` with cross-referenced nodes — 45 nodes
across the site, zero dangling `@id` references:

| Node | Where | Why |
| --- | --- | --- |
| `LocalBusiness` + `GeneralContractor` | homepage, full | one authoritative copy; other pages reference its `@id` |
| `WebSite` | homepage | ties the pages into one property |
| `WebPage` / `ContactPage` / `AboutPage` / `CollectionPage` | every page | per-page identity |
| `BreadcrumbList` | 10 pages | hierarchy, and rich-result breadcrumbs |
| `Service` | 6 service pages | what is offered, by whom, where |
| `FAQPage` | 6 service pages | the question-answer pairs |
| `OfferCatalog` | homepage | lets an assistant enumerate services without parsing prose |
| `GeoCircle` | 7 pages | 40-mile radius, covering towns not named individually |

The business node is emitted **in full on the homepage only**; every other page
references it by `@id`. Repeating it eleven times invites the copies to disagree
the moment one is edited.

### FAQ content

Six service pages gained a "Common Questions" section — 31 questions total, using
the existing design language. Service pages went from **~300 words to
1,100–1,400**, which matters independently of the schema: 300 words was too thin
to rank or be worth citing.

Questions are phrased the way people actually ask assistants ("how much does land
clearing cost near Augusta?"). The visible text and the `FAQPage` schema are
generated from the same source, so they cannot drift — Google penalises schema
that does not match visible content.

Answers use `<details>`/`<summary>`, so they are in the DOM and readable whether
or not expanded. A JS accordion that injected answers on click would hide them
from crawlers.

### Crawler access

`robots.txt` now names the AI crawlers explicitly — GPTBot, ClaudeBot,
PerplexityBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent and
others. The old wildcard already allowed them, so this is mostly documentation of
intent, with one exception that matters: **`Google-Extended` is a separate opt-in**
governing whether Google may use the content for Gemini and AI Overviews, and a
wildcard `Allow` does not cover it.

Note the structure: a crawler obeys only the most specific group matching its name
and does **not** inherit the wildcard's rules, which is why `Disallow: /api/`
appears in both groups rather than once.

`llms.txt` is new — a plain-text summary at `/llms.txt` following the emerging
convention. It states the service area, the six services with URLs, and
explicitly tells assistants **not to infer pricing**, since none is published.

## Regenerating

```bash
node tools/build-seo.mjs      # schema + FAQ sections
node tools/fix-urls.mjs YYYY-MM-DD   # canonicals, links, sitemap lastmod
```

Edit **[tools/seo-data.mjs](tools/seo-data.mjs)**, not the HTML — the generated
blocks are fenced by `SEO:START`/`SEO:END` and `FAQ:START`/`FAQ:END` markers and
are replaced in place. Both scripts are idempotent; re-running produces no diff.

`tools/` is in `.vercelignore` — it is source, not output. The HTML it produces is
what deploys.

## Deliberately not asserted

Structured data is a machine-readable claim about a real business. Inventing
values is dishonest and a manual-action risk with Google, so these were left out
rather than guessed:

| Missing | Why | Worth adding? |
| --- | --- | --- |
| `aggregateRating` / `review` | no real review data existed | **Yes — highest impact.** Only ever from genuine reviews |
| `hasCredential`, insurance status | never stated on the site | **Yes.** One of the most-asked questions in this trade |
| `foundingDate` | site badges "3 years" but gave no date | minor |
| `sameAs` | no social profile URLs anywhere on the site | yes, if profiles exist |

Never hand-write an `aggregateRating`. If reviews exist, take the count and
average from the real source.

## Off-site work, not in this repo

Ranked by impact:

1. **Google Business Profile.** For local trade searches this outweighs everything
   on the site. Claim it, set the same NAP (name, address, phone) as the site —
   **it must match `(803) 989-0031` exactly**, or the mismatch actively hurts —
   pick Land Clearing Service as the primary category, add the service area, and
   post photos.
2. **Reviews.** Volume and recency drive both local ranking and whether an
   assistant treats the business as real. Also unlocks the rating schema above.
3. **The phone number in the images.** See below — this is a live inconsistency.
4. **Citations.** Consistent NAP on Bing Places, Apple Business Connect, Yelp and
   trade directories.
5. **Location pages.** The natural next content step: `/land-clearing-augusta-ga`,
   `/land-clearing-aiken-sc` and so on, each with genuinely local content. Do not
   spin up near-duplicate pages per town — thin doorway pages are penalised.

## Known issue: old phone number baked into images

The `slick_*` hero graphics have **(803) 634-1616 rendered into the image itself**,
and brand as "M310 **Land Clearing**" rather than "Land Works". Verified in
`slick_A4` and `slick_A2`; the rest of the set very likely matches.

Text on the site is fully updated, but these cannot be fixed by editing code — the
graphics need re-exporting. Affected pages:

| Image | Used as hero on |
| --- | --- |
| `slick_A1` | `/yard-cleanup`, `/small-demolition` |
| `slick_A2` | `/services`, `/grading` |
| `slick_A3` | `/storm-debris` |
| `slick_A4` | `/land-clearing`, `/brush-clearing` |
| `slick_R2` | `/about` |
| `slick_R1` | unused — safe to delete |

Until they are replaced, eight pages show visitors a disconnected phone number,
and Google may read the conflicting number via image OCR. Both `.webp` and `.jpg`
versions of each need updating.
