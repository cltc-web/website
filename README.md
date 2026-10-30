# CLTC website — committee preview

Selected **Community C2** design for Carshalton Lawn Tennis Club. This is a
public committee-review snapshot, **not the live club website** or an approved
launch. C2 keeps one opening tennis photo on phones and the selected C desktop
layout. The club history is a separate page.

## Preview locally

Open `index.html`, or run `python3 -m http.server 8000 --bind 127.0.0.1`
and visit http://127.0.0.1:8000/.

## Share with the committee

A repository administrator can enable GitHub Pages in **Settings → Pages**:
choose **Deploy from a branch**, branch **main**, folder **/ (root)**.
Once deployment succeeds, the preview address is:

https://cltc-web.github.io/website/

Do not connect the club domain or add a CNAME until launch is explicitly approved.
No deployment workflow is included. Pushing this snapshot alone does not enable
GitHub Pages.

## Contents and privacy

Only the C2 homepage, history page, required styles, selected images and newsletter
placeholder pages are included. No working newsletters, member documents, other
design proposals, credentials or previous Git history are included.

This repository is public. `noindex, nofollow` and `robots.txt` discourage search
indexing; they do not provide access control. The two inherited external gallery
photographs still load from Wix. The remaining images are local copies.

## Before launch

- Obtain committee approval of content and design.
- Confirm fees, weekly sessions, teams and coaching details.
- Replace the 2024/25 LTA badge with a current approved asset.
- Review the history's archival wording about “today” and the first 100 years.
- Approve which newsletters may be public, then replace the placeholders.
- Confirm public contact details, WhatsApp links, photo permissions and policies.
- Complete accessibility and cross-browser checks.
- Remove preview notices/indexing restrictions only when launch is approved.

## Source

Exported from the working project's `CLTC Website/design-options/community-c2.html`
and `community-history-template.html` using `export-c2-review.py`, with explicit
asset allowlisting and relative link rewriting. Source homepage, published
newsletters and distribution folders were not changed.
