# WareKeep Community public source scope

The Community repository is a separate source publication. Original commercial files remain in the owner's private development workspace.

## Included

The public source includes code and build tools required for inventory, purchases, sales, batches and expiry dates, invoices, customers and suppliers, local reporting and accounts, local users and PIN access, local storage, and backup/restore. Shared interface and application code that is also used in a commercial edition is public when included for the offline edition.

## Separate commercial implementations

Implementations of online accounts and login, subscriptions and activation, payments, cloud services and synchronization, online device management, server services, and networked AI services are excluded from the Community source. Hiding a control is not sufficient separation: exported files and dependencies must also be reviewed.

Confidential configuration, private Git history, commercial backend and deployment files, real customer records and backups, internal conversations, private reports, and build output are outside the public source scope. A legacy field or name retained to read an existing backup does not imply that a commercial service is included.

## License and provenance

The public Community source is offered under Apache-2.0. Other recipients may use and distribute it commercially in accordance with that license. Recipients retain their rights to already published versions. Separate unpublished commercial components may have independent terms. See the [plain-language license explanation](COMMUNITY_LICENSE.md).

The application's provenance statement is the owner's declaration that they created the application-specific code, including with AI assistance, and did not include someone else's proprietary code without permission. This declaration does not replace an independent legal review. Third-party fonts and libraries retain their own licenses and notices.

## Publication checks

Each publication needs a current file inventory and hashes, sensitive-data scanning, review of imports and excluded components, dependency installation, and relevant tests. A successful check of an older shared edition or executable does not count as a check of new source. This document records no test counts or unperformed checks as successful.

The [official repository](https://github.com/fazlafghan8-svg/warekeep-community) contains the Community source. Check [GitHub Actions](https://github.com/fazlafghan8-svg/warekeep-community/actions) for the workflow result associated with a source version. GitHub private vulnerability reporting is enabled; use the channel described in [SECURITY.md](../SECURITY.md). Publishing the repository does not establish OpenAI support-program acceptance.
