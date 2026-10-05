# Contributing to WareKeep Community

We welcome clear bug reports, focused fixes, improvements to the English and Persian/Dari interfaces, and better English documentation. This repository contains the offline Community source under Apache-2.0. It does not contain the owner's complete commercial development workspace. The authoritative license is [LICENSE](LICENSE).

## Report a bug

Use the repository's [Issues](https://github.com/fazlafghan8-svg/warekeep-community/issues). Include the application version, operating system, steps to reproduce, expected result, and actual result. Say whether the problem occurred in a browser or the Electron application and whether internet access was available.

Use made-up records in examples and screenshots. Do not attach customer data, API keys, passwords, `.env` files, real databases, or real backups. For a security issue, follow [SECURITY.md](SECURITY.md) instead of posting vulnerability details publicly.

## Make a change

1. Install dependencies with `npm ci` and start the application with `npm run dev`.
2. Prepare a focused change for one problem. Core offline behavior must remain independent of online login, subscriptions, and commercial servers.
3. Keep test records synthetic. Exclude logs, installation output, backups, and personal settings from source changes.
4. For changes to calculations, saving, or restoring, add tests that expose the actual failure. Documentation-only edits do not need new application tests.
5. Run the checks relevant to your change and record the actual results.

Typical checks include:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Changes to dependencies must also pass `npm audit` and `npm run verify:dependency-notices`. Publication-helper changes must pass `npm run test:source-export`. Use the browser tests for changes affecting user workflows.

For changes to storage, local sign-in, or the desktop shell, also describe a real close-and-reopen test and backup/restore test. A successful build alone does not establish that these behaviors work.

## Submit a pull request

Explain the problem, the resulting behavior, the checks you ran, and any remaining limitations. State clearly when a check was not run. Use made-up data for interface screenshots. Keep public documentation in English and retain the Persian/Dari language option when updating the interface.

Before adding a dependency, consider its purpose, offline behavior, and license. Keep technical names, commands, and code identifiers accurate.

Only submit work that you have the right to publish. Under section 5 of Apache-2.0, contributions intentionally submitted for inclusion are under the same license unless explicitly stated otherwise. Commercial use of contributions is allowed under those terms, and recipients retain their rights to previously published versions. If ownership is unclear, raise the question without submitting the disputed code.

## Respect the publication scope

Read the [Community source scope](docs/OPEN_SOURCE_SCOPE.md). Use the exporter in `scripts/export-community-source.mjs` and its allowlist when preparing a new public source package. Do not publish the original internal workspace as a whole.

Private Git history, internal documents, conversation archives, customer records, deployment settings, and unpublished commercial services belong outside this repository. Adding a path to the export allowlist requires reviewing that path's contents.
