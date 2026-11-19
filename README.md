# Carshalton Lawn Tennis Club website

Static website for GitHub Pages, served from the repository root. Open `index.html` locally, or run `python3 -m http.server 8000 --bind 127.0.0.1` and visit http://127.0.0.1:8000/.

## Contents

- `index.html` and `history.html`: club website and history.
- `table-tennis.html` and `table-tennis.css`: provisional table tennis information, separate from LTA tennis membership, pending table tennis committee review.
- Coaching stays on the homepage: there are no separate adult or junior coaching pages and no published timetable. Coaches assess players before recommending a group, and the coaching section directs timetable and availability questions to the head coach. Coaching charges are additional to club membership.
- `assets/`: website images, logos and venue badge.
- `newsletters/`: public newsletter index and published May 2026 issue.
- `policies/`: nine supplied policy PDFs, including the transgender and non-binary statement, replacing the previous eight-document set. PDF wording is preserved as supplied; obtain corrected originals for any policy-author changes. Existing document paths are retained, with versioned links to avoid stale cached PDFs.
- `assets/lta-registered-venue-2026-27.png`: web rendering of the supplied LTA PDF. The complete wide badge appears in the shared header and policies-page header, with larger versions in the homepage registration card and policies-page content. The published May newsletter retains its original badge.
- CSS files: homepage, history and newsletter index styling. The May issue has its own styles and assets.
- `templates/site-header.html` and `navigation.js`: shared homepage/newsletter-index header and mobile-menu behaviour.
- `newsletters/issues.json`: explicit catalogue of approved, published newsletters; generates cards on both listing pages.

This is a public repository. The May newsletter's player-contact PDF and link have been omitted to protect members' privacy. Do not add private documents or unpublished newsletters without approval.

## Updating newsletter listings

The website still serves plain, checked-in HTML: Node is only needed when updating generated blocks or running tests, not to view or host the site.

1. Finish and approve an issue before adding its public folder at `newsletters/YYYY-MM/index.html`. Do not copy private documents into this public repository.
2. Add its `id` (`YYYY-MM`), `title`, `description` and stable analytics `trackingId` to `newsletters/issues.json`.
3. Run `npm run build:newsletters` from this folder (Node 20+; no dependencies needed for this command).
4. Review the changes to `index.html` and `newsletters/index.html`. The homepage shows up to three latest issues; the archive shows all issues, newest first. Links always include `index.html`.
5. Run `npm run check:newsletters` to check the generated blocks are current before publishing.

Edit the shared header in `templates/site-header.html`; its navigation items are defined in `scripts/build-newsletters.mjs`. Do not hand-edit the marked generated header/card blocks. The archive applies the shared theme to its header only, preserving its existing content typography, spacing and white issue cards. Other page content remains directly editable. The generator only updates those blocks: it never discovers drafts, regenerates an issue, or refreshes a distribution folder. Existing analytics identifiers are retained.

### Published issue corrections

Published issues are snapshots: change them only with explicit approval. The approved May 2026 accessibility/layout correction adds intrinsic image dimensions and named, keyboard-scrollable table regions. It does not change newsletter wording, destinations, or analytics identifiers. Its print stylesheet removes the screen-only table wrappers from layout to preserve the original desktop-style grids and pagination.

For future issues, declare each image's actual pixel dimensions, retain responsive CSS sizing, and wrap wide tables in a labelled `.table-scroll` region with `role="region"` and `tabindex="0"`. Keep the corresponding screen/print rules together when preparing a new issue; do not retroactively apply future designs to released issues.

## Regression checks

```sh
npm ci
npx playwright install chromium
npm test
npm run check:newsletters
```

Alternatively, use an existing Chrome installation without downloading Chromium:

```sh
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm test
```

Tests cover catalogue validation/escaping, generated HTML freshness, header overlap from 320px to 1920px, archive content-style preservation, mobile/keyboard navigation, reduced motion, sampled WCAG rules, narrow-screen table scrolling, image dimensions, print grids and no-JavaScript navigation. External requests are blocked during tests so they do not record analytics visits. Automated checks do not replace manual screen-reader, Safari, device and print/PDF review.

## Before publishing

- Replace the coach silhouettes with approved photographs. Confirm photo permissions before adding identifiable people to the gallery or other public pages.
- Confirm fees, sessions, teams, coaching details, contact details and photo permissions.
- Have the table tennis committee replace the provisional information in `table-tennis.html` with approved session, team and charge details before publishing.
- Resolve policy-author review points: the safeguarding statement's club-name placeholder, privacy wording (dates, data-protection references and cookies), social-media administrator roles, and the older photography/transgender statement dates. Confirm the related changing-room, safe-recruitment and disciplinary/complaints policies referenced by the supplied documents.
- Review the history's archival wording about “today” and the first 100 years.
- Check the public newsletter and its linked documents before publication.
- Complete accessibility, mobile and browser checks. Check the GitHub Pages settings and domain/DNS separately.

Pushing to `main` may update GitHub Pages immediately if Pages is enabled. Review changes before pushing.
