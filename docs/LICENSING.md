# Licensing and redistribution boundaries

## Project code and synthetic fixtures

No project-wide license is currently specified for the code, documentation or synthetic fixtures. Public visibility should not be interpreted as an open-source reuse grant. Contact the maintainer about reuse and future licensing decisions. Third-party materials remain subject to their own terms.

The included implementation and tests were prepared for this prototype. No provider code, copied dataset, vendored developer tool, private evaluation, or transfer record is included.

## External data

MoneyPuck publishes conditions for attributed noncommercial use on its [data page](https://moneypuck.com/data.htm), alongside restrictions on unapproved scraping and directions for other uses. This repository does not claim raw-data redistribution rights and includes no MoneyPuck observations. Check current terms directly before acquiring or using a dataset. Code visibility does not license data.

## Developer tools

The Python evaluator and its tests use the standard library. Optional developer requirements pin Ruff 0.8.6 and mypy 1.13.0, whose installed package metadata identifies MIT licenses. They are obtained separately from PyPI and are not redistributed as part of this repository. Their upstream licenses and those of their dependencies remain applicable.

## Web runtime

The web app uses React, React DOM, scheduler, TanStack React Query and TanStack Query Core, under their upstream MIT terms. The complete notices from the locked runtime packages are in [`web/public/THIRD_PARTY_NOTICES.md`](../web/public/THIRD_PARTY_NOTICES.md). These dependency rights permit their use and redistribution in a browser build; they do not assign a new project-wide license.

The UI uses original code, CSS, an original SVG rink/mark and system fonts. It does not distribute league logos, player photos, team trademarks, NBA/NFL source code, third-party fonts or provider observations. Its checked-in report is derived only from the original artificial fixture. It makes no NHL affiliation claim.

Frontend development tools are installed from the official npm registry using the lockfile and retain their upstream licenses. Axe Core's MPL-2.0 development package is used for local/CI accessibility checks and is not imported into the application bundle. Playwright browsers and test output are not committed or deployed.

There is no trained model artifact, external dataset, pretrained weight, or bundled third-party executable in the published source tree.
