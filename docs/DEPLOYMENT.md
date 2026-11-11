# Static hosting with GitHub Pages

The app is compatible with a GitHub Pages project site. The repository is public, so this route is available on GitHub Free. It serves only the reviewed static build and the original artificial fixture; it needs no paid service, server, provider request, API key or personal access token.

**Status:** deployment is prepared, but Pages must be enabled by a repository administrator. A passing build or a skipped deployment job is not proof of a live website. No working public app URL is claimed until the deployed version and user flows have been checked in a browser.

## One-time administrator setup

1. Open [repository Settings → Pages](https://github.com/roni-altshuler/nhl_predictor/settings/pages). Under **Build and deployment**, select **GitHub Actions** as the source. Keep the default project site; no custom domain or paid plan is required.
2. Open [Settings → Secrets and variables → Actions → Variables](https://github.com/roni-altshuler/nhl_predictor/settings/variables/actions). Add the nonsecret repository variable `NHL_PAGES_ENABLED` with value `true` only after Pages is enabled. No secret/token is needed.
3. Open **Actions → Prototype checks → Run workflow**, select `main`, and run it. The workflow runs the full Python checks and both web targets before deploying. Future main pushes follow the same gates automatically. Honor any existing environment approval rules; do not weaken them.
4. Inspect the **Deploy GitHub Pages** job. Use its reported `page_url` and deployment commit, then complete the live verification below. The expected default project path is `/nhl_predictor/`; the inferred host is `roni-altshuler.github.io`. These are configuration expectations, not a verified working website link.

The current connector cannot enable repository Pages settings or edit repository variables. An administrator must perform these steps through normal supported GitHub settings. Do not broaden global workflow permissions, add a PAT, auto-enable Pages with an elevated token, or retry a denied operation through another route. If an organization policy or environment rule blocks deployment, preserve it and report the exact blocker.

## Build, checks and permissions

`.github/workflows/ci.yml` retains the full Python suite and runs the web suite at both `/` and `/nhl_predictor/`. Each target uses the same lockfile and runs lint, strict types, unit tests, production build and the complete responsive browser campaign. The default root build remains suitable for other static hosts.

The Pages target uploads only `web/dist`, after its browser QA passes, on an opted-in main push or manual main run. Deployment depends on the Python job and both web targets. PRs and feature branches cannot upload or deploy a Pages artifact. The deploy job consumes that tested artifact without rebuilding or checking out other source.

The default token permission remains `contents: read`. Only the deploy job receives `pages: write` and `id-token: write`, as required by GitHub's official deployment action. It uses the `github-pages` environment, serial deployment concurrency and the built-in workflow token. `configure-pages` has `enablement: false`; it reads the administrator-enabled setup and cannot bootstrap access. Artifacts expire after one day.

If `NHL_PAGES_ENABLED` is absent or not exactly `true`, upload and deployment are deliberately skipped. Ordinary tests still run. Set the variable to `false` to stop future deployments; this does not remove an already published site. No administration or visibility change is performed by this workflow.

## Reproduce the project-path build locally

Use the documented Node 24/Python 3.11 setup and locked dependencies. In addition to all checks in [CONTRIBUTING.md](../CONTRIBUTING.md):

```bash
APP_BASE_PATH=/nhl_predictor/ npm --prefix web run build
QA_BASE_PATH=/nhl_predictor/ npm --prefix web run test:browser
```

For an explicit build identity, set `APP_COMMIT` to the full source SHA during the build. CI uses its checked-out commit. The `version.json` file records that identity and the configured base path; the footer carries the same commit.

Browser QA checks that images, notices, data, generated scripts/styles and the version stay under the configured project path, then exercises every page, normal/repeated/interrupted interactions, error/empty states and narrow layouts. The app uses hash routes, so bookmarked views do not require a server-side fallback. No data or evaluation protocol changes are required for this hosting route.

## Required live verification after every deployment

Use the actual deployment output URL, not an assumed URL or build badge. Confirm the expected full commit in `version.json` and the footer, then check desktop and mobile layouts, all navigation and detail links, filters and date boundaries, team sorting/history, matchup controls, accuracy timeline/zero selection, coverage and download, source selection, loading/empty/error/retry and interrupted/repeated flows. Inspect broken assets, browser errors and base-path requests. Test genuine server behavior separately from locally intercepted fault cases.

Record the URL, full version, browser, viewports, passed checks and any untested functionality. Add a website link to README and the repository website field only after it is verified working. If browser or network access is denied, do not retry through another route or claim completion; preserve the deployment and report the exact live-verification gap.

## References

- [GitHub Pages custom workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite project-site base-path guidance](https://vite.dev/guide/static-deploy#github-pages)
- [GitHub's Pages deployment action](https://github.com/actions/deploy-pages)
