# KAISTEEL GitHub Pages deployment

The site is static HTML/CSS/JavaScript. No package installation or compilation is required.

To activate this workflow after reviewing the pull request:

1. In Settings → Pages → Build and deployment, change Source from **Deploy from a branch** to **GitHub Actions**. Preserve the existing custom domain and HTTPS settings.
2. Merge the workflow pull request into `main`. This triggers the initial deployment. If necessary, use Actions → Deploy KAISTEEL to GitHub Pages → Run workflow, selecting `main`.
3. Verify the build and deploy jobs succeed. Refresh the homepage and Australian dealer page and verify the inquiry helper is served. Do not send customer inquiries as deployment tests.

After activation, pushes to `main` trigger deployments automatically. Other branches and pull requests do not deploy. Concurrent deployments are serialized. The workflow reads Pages configuration; it does not automatically enable Pages or change its domain settings.

Only tracked website HTML/CSS, assets, robots.txt, sitemap.xml, llms.txt, and CNAME enter the artifact. Test scripts and workflow documentation are excluded. This serves the existing files directly without Jekyll transformations.

Deployment uses GitHub's `GITHUB_TOKEN` and OIDC authentication. Do not add personal tokens or production secrets. If repository policies require environment approval, approve the `github-pages` deployment using the existing review process.

The inquiry browser checks remain a separate development check; see tests/README.md. The deployment workflow checks artifact completeness but does not claim to run the browser suite.

To return to branch publishing, select **Deploy from a branch**, `main`, and `/(root)` in Pages settings, and remove or disable this custom workflow to avoid parallel deployment paths. This is a production configuration change and should be reviewed first.
