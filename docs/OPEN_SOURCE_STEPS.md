# Preparing and publishing a Community source package

This guide covers publishing a reviewed version of the offline edition. Read the [source scope](OPEN_SOURCE_SCOPE.md), [license explanation](COMMUNITY_LICENSE.md), and [first steps](FIRST_STEPS.md).

## 1. Confirm rights and scope

The owner states that they created the application-specific code, including with AI assistance, and did not include someone else's proprietary code without permission. This statement is recorded; it is not an independent legal review. Shared code required by the offline application is public. Implementations of online accounts, subscriptions, payments, cloud services, and networked AI services are excluded.

Apache-2.0 applies to the public source. The authoritative license is [LICENSE](../LICENSE). Fonts and dependencies retain their own licenses and notices. Unpublished commercial files do not become public through this publication, and recipients retain their rights to versions already released under Apache-2.0.

## 2. Create a fresh export

From the development workspace or a prepared Community source checkout, run:

```sh
node scripts/export-community-source.mjs
```

The exporter creates a new directory under `artifacts/source-export` containing `source`, `EXPORT_MANIFEST.json`, and `SCAN_REPORT.json`. It does not overwrite the original application files, copy private Git history, publish to GitHub, or submit a support application.

The export allowlist, Community-specific replacements, and the files actually needed by the application determine the output. Review the contents of each newly allowed path. Do not publish an incomplete export or one that reports an error.

## 3. Review that exact output

Check file paths, sizes, and hashes against the manifest. Review binaries, external references, names, comments, and sample data. A pattern scan with no findings does not prove that all secrets or private information are absent.

Verify that implementations and dependencies for online accounts, subscriptions, payments, cloud services, and networked AI services are absent. Hiding their buttons is insufficient. Keep the font and dependency notices with the package.

## 4. Build and test from that source

Enter the exported `source` directory. Node.js 24 is recommended; the minimum supported version for the build tools is 22.12.0. The dependency installation and browser installation require an internet connection.

```sh
npm ci
npm audit
npm run verify:dependency-notices
npm run typecheck
npm run lint
npm run test:source-export
npm run test:unit
npx playwright install chromium
npm run test:e2e:community
npm run build
npm run verify:artifacts -- dist
npm run electron:build
npm run test:community:desktop
```

The desktop build and packaged desktop checks target Windows. Record the date, Node.js version, operating system, source commit or manifest, commands, and actual results. Results for another source version or an older executable do not establish that the version being published has passed. Check the corresponding run in [GitHub Actions](https://github.com/fazlafghan8-svg/warekeep-community/actions) before reporting its result as successful.

### Desktop download compatibility

The stable `electron-builder 26.15.3` uses a narrowly scoped `app-builder-lib` override to `@electron/get 5.1.0`. This removes the old HTTP-cache dependency chain from the build tools. It does not add a network requirement to the installed application.

The downloader uses Fetch. Old Got-specific options such as `timeout.request` and custom `agent` settings are incompatible; do not assume that the old retry behavior based on `response.statusCode` still applies. The Community configuration does not use custom Got options. Enable the downloader's official proxy route with `ELECTRON_GET_USE_PROXY=true`. Test downloads in the network configuration used for the build.

Each build step has a 20-minute deadline. If a step hangs, its process and child processes are stopped on Windows and the build fails. This deadline does not affect application backup operations.

## 5. Test the real executable

Run the newly built desktop executable with made-up records. Add a quantity of 10, sell 2, and verify the remaining quantity of 8 and invoice after closing and reopening. Export a backup, restore into an empty test workspace, and reopen again.

Record installer execution, digital-signature status, physical printing, data encryption, testing on a second computer, and persistence over more than three days separately. Do not report checks that were not performed as successful.

## 6. Publish the reviewed source and maintain private reporting

The official public repository is [fazlafghan8-svg/warekeep-community](https://github.com/fazlafghan8-svg/warekeep-community). For each publication, upload only the reviewed export's `source` contents. Keep the private development history and mixed commercial workspace out of the public repository.

Private vulnerability reporting is enabled for the official repository. Use its [Security advisories](https://github.com/fazlafghan8-svg/warekeep-community/security/advisories) and follow [SECURITY.md](../SECURITY.md). The owner or repository administrator should keep the reporting option available and check receipt of security notifications. Publishing a policy file alone does not enable this GitHub feature.

## 7. Apply for support using accurate evidence

No OpenAI support application has been submitted for this project. If you decide to apply, prepare accurate information about the maintainer's role, the application's purpose, and evidence of use. Read the current [Codex for Open Source](https://developers.openai.com/community/codex-for-oss) page and use its application link. Do not invent users, downloads, contributions, or endorsements. Open-source publication and passing these checks do not guarantee acceptance or six months of support.
