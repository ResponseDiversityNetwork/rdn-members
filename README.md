# rdn-members

The public member map for the Response Diversity Network.
Site: https://responsediversitynetwork.github.io/rdn-members/

- `index.qmd` is the map page, built with Quarto, Observable JS and Leaflet. The visitor's browser does all the work, so there is no server.
- `join.qmd` and `privacy.qmd` are the "Join, update, leave" and privacy pages.
- `data/demo-members.csv` holds fictional members, used while `DATA_URL` in `index.qmd` is `null`.
- `.github/workflows/publish.yml` renders the site and deploys it to GitHub Pages on every push to `main`.

## Where the real data comes from

The page never sees the private membership sheet. RDN's Apps Script (in the rdn.projectbase@gmail.com account) writes a **public subset** to a separate Google Sheet:

- only members who consented to the map;
- only the fields each member agreed to show;
- locations at city level.

That sheet is published to the web as CSV, and its URL is set as `DATA_URL` in `index.qmd`. Changes reach the map within about 5 minutes, and the site doesn't need rebuilding. **No member data is committed to this repo.**

## Public CSV columns (the contract between Apps Script and this page)

| column | content |
|---|---|
| id | random public id (not the form response id) |
| name, institution, email, website, interests | blank if the member chose not to show it |
| city, country | as entered |
| lat, lon | rounded to 2 decimals |
| career_stage | one value |
| approach, systems, organisms, levels, stressors, regions | several values, separated by `; ` |

Filter options are built from the data, so a new answer option in the form shows up as a filter automatically.

## Preview locally

```
quarto preview
```
