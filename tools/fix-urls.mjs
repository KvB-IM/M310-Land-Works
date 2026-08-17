// One-off: point every URL at the form the server actually serves.
//
// The site is hosted at www with cleanUrls:true, so "https://m310landworks.com/
// contact.html" costs two 308s before it resolves to
// "https://www.m310landworks.com/contact". Every canonical, og:url, sitemap entry
// and internal link used the redirecting form, which weakens indexing (search
// engines discount a canonical that does not resolve directly) and made every
// nav click a redirect.
//
// Run from the project root:  node tools/fix-urls.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const ORIGIN = 'https://www.m310landworks.com';

// Every page slug on the site. index maps to "/" rather than "/index".
const PAGES = [
  'index', 'about', 'services', 'contact', 'privacy',
  'land-clearing', 'grading', 'brush-clearing',
  'storm-debris', 'yard-cleanup', 'small-demolition',
];

const cleanPath = (slug) => (slug === 'index' ? '/' : `/${slug}`);

const files = readdirSync('.').filter((f) => f.endsWith('.html'));
let totals = { absolute: 0, internal: 0 };

for (const file of files) {
  let html = readFileSync(file, 'utf8');
  const before = html;

  // 1. Absolute URLs: apex -> www, and strip .html
  html = html.replace(/https:\/\/(?:www\.)?m310landworks\.com(\/[^"'\s>]*)?/g, (_m, path = '') => {
    let p = path || '/';
    for (const slug of PAGES) {
      if (p === `/${slug}.html`) { p = cleanPath(slug); break; }
    }
    totals.absolute++;
    return ORIGIN + (p === '/' ? '/' : p);
  });

  // 2. Internal relative links: foo.html -> /foo, index.html -> /
  for (const slug of PAGES) {
    const re = new RegExp(`(href=")${slug}\\.html(#[^"]*)?(")`, 'g');
    html = html.replace(re, (_m, a, hash = '', b) => {
      totals.internal++;
      return a + cleanPath(slug) + hash + b;
    });
  }

  if (html !== before) writeFileSync(file, html);
}

// 3. Sitemap, rebuilt so lastmod is accurate and URLs match the canonicals.
//    Priority is left off deliberately — Google has ignored it for years, and a
//    hand-maintained value that contradicts the site's real structure is noise.
const today = process.argv[2];
if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error('Pass the date as YYYY-MM-DD: node tools/fix-urls.mjs 2026-08-14');
  process.exit(1);
}

const ORDER = [
  'index', 'services', 'land-clearing', 'grading', 'brush-clearing',
  'storm-debris', 'yard-cleanup', 'small-demolition', 'about', 'contact', 'privacy',
];

writeFileSync(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ORDER.map((slug) => `  <url><loc>${ORIGIN}${cleanPath(slug)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`
);

console.log(`absolute URLs rewritten: ${totals.absolute}`);
console.log(`internal links rewritten: ${totals.internal}`);
console.log(`sitemap rebuilt with ${ORDER.length} URLs at lastmod ${today}`);
