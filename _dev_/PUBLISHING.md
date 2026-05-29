# Publishing Guide for langsys-js-react

This project includes an automated publishing script to streamline the release process.

## Prerequisites

Before using the publishing scripts, ensure you have:

1. **GitHub CLI (gh)** installed - [Installation guide](https://cli.github.com/)
2. **npm** authentication configured for publishing (or trusted publishing via CI — see below)
3. **Git** configured with push access to the repository
4. You are on the `main` branch with unpushed commits ready to release

> Before the first publish, switch the `langsys-js-typescript` dependency in `package.json` from `file:../langsys-js-typescript` to a published semver range (e.g. `^0.2.0`). The `file:` form is for the local monorepo workflow only.

## Publishing Script

```bash
npm run release
# or
./_dev_/publish.sh
```

## What the Script Does

The publishing script automates the entire release process:

1. **Verify Prerequisites**
   - Check GitHub CLI is installed and authenticated
   - Verify you're on the main branch
   - Ensure there are unpushed commits to release

2. **Version Management**
   - Display current version
   - Prompt for new version (with suggestion)
   - Validate version format
   - Check version doesn't already exist

3. **Build and Test**
   - Update version in package.json
   - Run `npm install` to update package-lock.json
   - Run `npm run build` to verify everything compiles

4. **Git Operations**
   - Amend the last commit with the version bump
   - Push to origin
   - Create and push git tag

5. **Release Creation**
   - Create GitHub release with auto-generated notes
   - The `release: published` event triggers the npm publish workflow

6. **Error Handling**
   - Comprehensive error checking at each step
   - Automatic rollback option if something fails

## Version Format

Versions must follow semantic versioning:
- Format: `x.y.z` or `x.y.z-tag`
- Examples: `1.2.3`, `2.0.0-beta.1`

## How publishing actually happens (trusted publishing)

The local script **does not** run `npm publish`. Creating the GitHub Release fires `.github/workflows/publish.yml`, which runs `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npm publish --provenance` inside the `npm-publish` GitHub Environment using OIDC. No long-lived npm token is stored anywhere.

The three trust-handshake strings must stay in sync:
- GitHub Environment name: `npm-publish`
- npm trusted publisher config: Environment `npm-publish`, workflow filename `publish.yml`
- `.github/workflows/publish.yml`: `environment: npm-publish`

## Manual Publishing (fallback)

```bash
git checkout main && git status
# bump "version" in package.json
npm install
npm run build
git add package.json package-lock.json
git commit -m "chore: bump version to x.y.z"
git push origin main
git tag -a vx.y.z -m "Release vx.y.z"
git push origin vx.y.z
gh release create vx.y.z --title "vx.y.z" --notes "Release notes here"
# then either let CI publish, or: npm publish
```

## Troubleshooting

### GitHub CLI Not Found
Install the GitHub CLI from https://cli.github.com/

### Permission Denied (script not executable)
```bash
chmod +x _dev_/publish.sh
```

### Rollback Failed
```bash
git reset --hard HEAD~1
git tag -d vx.y.z
git push origin :refs/tags/vx.y.z
```

## Security Notes

- Never commit sensitive credentials.
- Prefer trusted publishing (OIDC) over long-lived npm tokens.
- Use GitHub's built-in secrets/environments for CI/CD automation.
