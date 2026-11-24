# Mobile Regression

Compare a live website with a preview before deploying. Mobile Regression reports new horizontal scrolling and clipped controls at 320, 375 and 430 CSS pixels, with before and after screenshots.

## Install

Install [Node.js 24](https://nodejs.org/) and [Git](https://git-scm.com/), then run:

```sh
git clone https://github.com/centenosanti0-cpu/mobile-regression.git
cd mobile-regression
npm ci
npx playwright install chromium
```

On Linux CI, use `npx playwright install --with-deps chromium` to install system dependencies.

## Run a comparison

Replace the example URLs with the same page on your live site and on your preview deployment. Put the live URL first.

```sh
npm run check -- https://example.com/checkout https://preview.example.com/checkout
```

Open `report/report.md` to see the findings and links to the screenshots. The JSON report contains both existing and new issues. Exit status 0 means no new findings, 1 means new findings, and 2 means the scan could not run.

The scan covers the initial page in Chromium. It does not open menus or dialogs, and it compares findings by type and DOM locator. No account or API key is needed. Keep generated reports private if they contain private page content.
