# Releasing

1. Confirm the working tree contains only the intended release changes.
2. Update `CHANGELOG.md` and the version in `package.json`.
3. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm typecheck
   pnpm test:package
   pnpm audit --prod
   ```

4. Inspect `npm pack --dry-run --json` for unexpected files.
5. Configure GitHub release authorization before publishing:
   - Protect `main` with required pull-request reviews and passing CI; restrict direct pushes to maintainers.
   - Create a GitHub Environment named `npm`, configure required reviewers to the release maintainers, and restrict environment access to protected branches/tags as appropriate.
   - Add a repository Ruleset for tags matching `v*`; restrict creation, update, and deletion to the release maintainers.
6. Configure npm Trusted Publishing for `@nexbrowser/mcp`: GitHub organization `nex-browser`, repository `nexbrowser-mcp`, workflow filename `publish.yml`, environment name `npm`, with the `npm publish` action allowed. Do not configure an npm token. Sigstore provenance remains disabled while the GitHub source repository is private because npm only supports provenance from public source repositories.
7. Create and push a signed version tag whose exact name matches `package.json`, for example `git tag -s v1.0.3 -m "v1.0.3" && git push origin v1.0.3`. The tag triggers `.github/workflows/publish.yml`, which only accepts a tag commit contained in `main`, waits for `npm` environment approval, re-runs the release checks, publishes through OIDC Trusted Publishing, and creates the GitHub release.
8. After the workflow succeeds, install the exact published version in a clean directory and verify `npx -y @nexbrowser/mcp@<version> --version`.

Do not publish from a dirty worktree or bypass `prepublishOnly`.
