// Single source of truth for the site's structured data and FAQ content.
//
// EVERY FACT IN HERE MUST BE TRUE. Structured data is a machine-readable claim
// about a real business: invented review counts, credentials or founding dates
// are both dishonest and a manual-action risk with Google. Where a fact was not
// verifiable from the existing site copy it is left out rather than guessed —
// see the NOT ASSERTED list at the bottom for what is deliberately missing.

export const ORIGIN = 'https://www.m310landworks.com';

// Stable @id anchors. Using one canonical node per entity and referencing it by
// @id everywhere else means crawlers see one business with many pages, not
// eleven unrelated copies of a business.
export const ID = {
  business: `${ORIGIN}/#business`,
  website: `${ORIGIN}/#website`,
  page: (path) => `${ORIGIN}${path}#webpage`,
  service: (slug) => `${ORIGIN}/${slug}#service`,
};

export const BUSINESS = {
  name: 'M310 Land Works',
  legalName: 'M310 Land Works',
  slogan: 'Clear the Way for Your Next Project',
  phone: '+18039890031',
  email: 'quote@m310landworks.com',
  street: '332 Edgefield Rd',
  city: 'North Augusta',
  region: 'SC',
  postal: '29841',
  country: 'US',
  lat: 33.5018,
  lon: -81.9651,
  priceRange: '$$',
  // From the privacy policy: "approximately a 40-mile radius of North Augusta,
  // South Carolina, serving customers in South Carolina and Georgia."
  radiusMiles: 40,
};

// Cities the site already claims in its footer and service-area copy.
export const CITIES = [
  { name: 'North Augusta', region: 'SC' },
  { name: 'Aiken', region: 'SC' },
  { name: 'Augusta', region: 'GA' },
  { name: 'Grovetown', region: 'GA' },
  { name: 'Evans', region: 'GA' },
  { name: 'Martinez', region: 'GA' },
];

// name is the H1; label is what appears in breadcrumbs and the offer catalogue.
export const SERVICES = [
  {
    slug: 'land-clearing',
    name: 'Land Clearing',
    label: 'Land Clearing',
    description:
      'Tree, stump, root and vegetation removal using tracked skid steers and forestry mulchers — turning overgrown or wooded property into clean, workable land for construction, reclamation or agriculture.',
  },
  {
    slug: 'grading',
    name: 'Land Grading',
    label: 'Land Grading',
    description:
      'Reshaping and levelling ground so it drains correctly and is ready to build, pave or plant on.',
  },
  {
    slug: 'brush-clearing',
    name: 'Brush Clearing',
    label: 'Brush Clearing',
    description:
      'Clearing undergrowth, briars, vines and invasive growth to open up a property without taking out the mature trees you want to keep.',
  },
  {
    slug: 'storm-debris',
    name: 'Storm Debris Removal',
    label: 'Storm Debris Removal',
    description:
      'Removal of downed trees, limbs and wind-blown debris after a storm, with 24/7 response for blocked drives and hazards.',
  },
  {
    slug: 'yard-cleanup',
    name: 'Yard Cleanup',
    label: 'Yard Cleanup',
    description:
      'Clearing overgrowth, brush piles and accumulated yard debris to get a property back under control.',
  },
  {
    slug: 'small-demolition',
    name: 'Small Demolition',
    label: 'Small Demolition',
    description:
      'Taking down and clearing away sheds, outbuildings, old fencing, decks and small structures, including debris haul-off.',
  },
];

// ---------------------------------------------------------------------------
// FAQs
//
// Written to answer what someone actually asks an assistant ("how much does
// land clearing cost near Augusta?"), because a direct question-and-answer pair
// is the most extractable format there is. Answers stay inside what the site
// already claims: free on-site estimates, the ~40-mile service area, 7-day
// availability with 24/7 storm response, and tracked skid steers / forestry
// mulchers as the equipment.
//
// No prices, no timelines in days, no licence or insurance claims — none of
// that was verifiable, and a confidently wrong answer in an AI summary is worse
// than no answer.
// ---------------------------------------------------------------------------

const AREA_SENTENCE =
  'We work across the CSRA — North Augusta and Aiken in South Carolina, and Augusta, Grovetown, Evans and Martinez in Georgia — roughly a 40-mile radius of North Augusta, on both sides of the state line.';

const ESTIMATE_SENTENCE =
  'Every job starts with a free on-site estimate. We come out, walk the property, and give you a straight number with no obligation.';

export const FAQS = {
  'land-clearing': [
    {
      q: 'How much does land clearing cost near Augusta?',
      a: `There is no honest flat rate, because cost tracks acreage, how dense the growth is, tree size, terrain and how easily equipment can reach the work. A quarter-acre of light brush and five wooded acres with mature hardwood are completely different jobs. ${ESTIMATE_SENTENCE}`,
    },
    {
      q: 'Do you clear land in Augusta, GA and across the state line?',
      a: `Yes. ${AREA_SENTENCE} Crossing between South Carolina and Georgia is routine for us.`,
    },
    {
      q: 'Do you remove stumps and roots, or just the trees?',
      a: 'Both. Cutting trees at the base leaves stumps and root mass that block building, grading and mowing, so we remove stumps and roots as part of clearing — the ground ends up genuinely clear rather than just cut down.',
    },
    {
      q: 'What happens to the cleared material — mulched on site or hauled away?',
      a: 'Either, depending on what suits your property. A forestry mulcher grinds growth into mulch that stays on site as ground cover, which controls erosion and costs less than hauling. Where you need the lot completely bare, we haul the material off instead. We will go through the trade-off with you at the estimate.',
    },
    {
      q: 'Can you clear a lot for new construction?',
      a: 'Yes — site prep for new construction is one of the most common reasons people call us. We clear and grub the footprint so the lot is buildable, and we can grade it in the same visit if it needs to drain properly before work starts.',
    },
    {
      q: 'How soon can you start?',
      a: `That depends on the size of the job and what is already booked, so the fastest way to find out is to ask. Call (803) 989-0031 — we answer seven days a week, and storm damage gets a 24/7 response.`,
    },
  ],

  grading: [
    {
      q: 'What does land grading actually do?',
      a: 'Grading reshapes the surface of a property so water runs where you want it to and the ground is level enough to build, pave or plant on. Most grading calls come down to one of two problems: water collecting where it should not, or ground too uneven to use.',
    },
    {
      q: 'Can grading fix a yard that holds water or floods?',
      a: 'Often, yes. Standing water is usually a slope problem — the ground falls towards the house or towards a low spot with nowhere to drain. Re-establishing fall away from the structure fixes it. We will look at where the water actually goes before quoting, because some cases need drainage work rather than grading alone.',
    },
    {
      q: 'Do you grade driveways and gravel roads?',
      a: 'Yes. Gravel drives develop ruts, potholes and a crown that has flattened out, which makes them hold water and deteriorate faster. Re-grading restores the shape and the drainage.',
    },
    {
      q: 'Do you grade in the Augusta area?',
      a: `Yes. ${AREA_SENTENCE}`,
    },
    {
      q: 'How much does grading cost?',
      a: `It depends on the area involved, how much material has to move, and access for equipment. ${ESTIMATE_SENTENCE}`,
    },
  ],

  'brush-clearing': [
    {
      q: 'What is the difference between brush clearing and land clearing?',
      a: 'Brush clearing takes out the undergrowth — briars, vines, saplings, invasive growth — while leaving the mature trees standing. Land clearing removes everything, trees and stumps included. If you want a wooded property you can actually walk through without losing the canopy, brush clearing is the one you want.',
    },
    {
      q: 'Can you clear brush without damaging the trees I want to keep?',
      a: 'Yes, and that is the normal request. Tracked equipment and forestry mulching let us work selectively around trees you are keeping. Tell us at the estimate which ones matter and we will work around them.',
    },
    {
      q: 'Will the brush grow back?',
      a: 'Some regrowth is normal, and how fast depends on the species and the season. Mulching the material and cutting low slows it considerably compared with just cutting the tops. Properties that have been left for years usually need one heavy clearing and then occasional maintenance.',
    },
    {
      q: 'Do you clear brush near Augusta and Aiken?',
      a: `Yes. ${AREA_SENTENCE}`,
    },
    {
      q: 'How much does brush clearing cost?',
      a: `Cost depends on the area, how thick the growth is and how reachable it is with equipment. ${ESTIMATE_SENTENCE}`,
    },
  ],

  'storm-debris': [
    {
      q: 'Do you do emergency storm debris removal?',
      a: 'Yes — storm work is on a 24/7 response. If a tree is across your drive, leaning on a structure or blocking access, call (803) 989-0031 rather than filling in the form, because the phone reaches us fastest.',
    },
    {
      q: 'Can you remove a tree that fell on my driveway or fence?',
      a: 'Yes. Downed trees and large limbs across drives, fences and outbuildings are the most common storm call we get. We cut, clear and haul the material off so the property is usable again.',
    },
    {
      q: 'Will you work with my insurance claim?',
      a: 'We can give you a written estimate and document what we found on site, which is normally what an adjuster needs. Take photographs before anything is moved if you safely can — that record matters to the claim, and once debris is cleared it cannot be recreated.',
    },
    {
      q: 'How quickly can you get here after a storm?',
      a: 'After widespread weather the honest answer is that it depends on how many properties are affected and how severe each one is; hazards and blocked access come first. Call and we will tell you where you realistically sit rather than guess.',
    },
    {
      q: 'Do you cover storm cleanup in Augusta and North Augusta?',
      a: `Yes. ${AREA_SENTENCE}`,
    },
  ],

  'yard-cleanup': [
    {
      q: 'What does a yard cleanup include?',
      a: 'Clearing the overgrowth, brush piles, fallen limbs and accumulated debris that have built up until the yard is no longer usable or mowable. It is aimed at properties that have got away from you — after a long absence, a rental turnover, or a season nobody kept up with.',
    },
    {
      q: 'Can you clean up a property that has been neglected for years?',
      a: 'Yes, and that is most of this work. Heavy overgrowth is past what a mower or a homeowner with a trimmer can reasonably take on. Tracked equipment handles it in a fraction of the time and without the injury risk.',
    },
    {
      q: 'Do you haul the debris away?',
      a: 'Yes, we can haul the material off so you are not left with piles to deal with. Where mulching on site makes more sense — and it is often cheaper — we will say so at the estimate.',
    },
    {
      q: 'Do you clean up rental and vacant properties for landlords?',
      a: 'Yes. Vacant lots, rental turnovers and properties being prepared for sale or inspection are routine. We can work from an address if you are not local to meet us.',
    },
    {
      q: 'How much does yard cleanup cost?',
      a: `It comes down to the size of the area, how much material there is and whether it is being hauled away or mulched. ${ESTIMATE_SENTENCE}`,
    },
  ],

  'small-demolition': [
    {
      q: 'What kinds of structures do you demolish?',
      a: 'Small structures: sheds, outbuildings, barns, old fencing, decks, carports and similar. This is small-scale demolition, not commercial or multi-storey work — if a job is beyond what we should take on, we will tell you rather than take it anyway.',
    },
    {
      q: 'Do you haul away the debris after demolition?',
      a: 'Yes. Removal and haul-off are part of the job — the point is an empty, usable space, not a pile where the shed used to be.',
    },
    {
      q: 'Do I need a permit to demolish a shed or outbuilding?',
      a: 'It depends on your county or city and on the structure — some small accessory buildings need nothing, others do, and rules differ across the South Carolina and Georgia sides of the river. Check with your local building office before work starts. We are glad to talk through what your specific structure involves.',
    },
    {
      q: 'Can you demolish a structure and clear the lot at the same time?',
      a: 'Yes, and combining them is usually cheaper than two separate visits, since the equipment is already on site. Plenty of jobs are a demolition plus clearing and grading to leave a genuinely clean lot.',
    },
    {
      q: 'Do you do small demolition in the Augusta area?',
      a: `Yes. ${AREA_SENTENCE}`,
    },
  ],
};

// ---------------------------------------------------------------------------
// NOT ASSERTED — deliberately absent, add only once verified:
//
//   aggregateRating / review   No real review data was available. Fabricating
//                              ratings is a manual-action risk and dishonest.
//                              Add once Google reviews exist, sourced from them.
//   foundingDate               The site badges "3 years in business" but no
//                              actual date was available to convert that into.
//   sameAs                     No social profile URLs found anywhere on the site.
//   hasCredential / insurance  No licence or insurance status was stated. This is
//                              one of the most-asked questions for this trade, so
//                              adding it truthfully would be high value.
//   openingHours               Kept as the existing all-day spec, which reflects
//                              the site's "7 days a week / 24/7 storm response".
// ---------------------------------------------------------------------------
