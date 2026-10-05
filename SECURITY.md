# Security policy

No supported-version window or guaranteed security response time has been announced for WareKeep Community.

## Report a vulnerability

GitHub **Private vulnerability reporting** is enabled for [fazlafghan8-svg/warekeep-community](https://github.com/fazlafghan8-svg/warekeep-community).

Open the repository's [Security advisories](https://github.com/fazlafghan8-svg/warekeep-community/security/advisories), select **Report a vulnerability**, and submit a private report with a summary, likely impact, affected version, and reproduction steps using synthetic data. See [GitHub's private reporting guide](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

If the private reporting option is unavailable, do not post vulnerability details in a public issue. You may ask the maintainer to provide a private security contact without describing the vulnerability or attaching sensitive material. Wait for a confirmed private channel before sending details. No fallback email address is announced here.

Never publish passwords, tokens, customer records, or exploit details for a live system in a public issue. Remove private information before sharing any additional files.

## Scope

Relevant reports include unauthorized file access, Electron IPC problems, code execution, injection in displayed or printed invoices, backup disclosure, unauthorized access to local records, and unexpected data leaving the offline edition. Test only systems and information you have permission to use.

## Local data

Offline operation does not by itself mean that every file is encrypted, that other operating-system users cannot access records, or that a forgotten password can be recovered automatically. These protections must be stated and tested for each release.

Restrict access to the application's data directory and backup files. Verify backup restoration before relying on the application for business records.

## Maintainer responsibilities

Keep private reporting enabled and verify that **Report a vulnerability** remains available. Update this policy if the reporting channel changes. See [GitHub's repository configuration guide](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

The maintainer should check receipt of security notifications. GitHub's **Watch → Custom → Security alerts** setting and account notification settings can be used for this purpose. This policy does not promise a response deadline or a definite resolution.

Source scanning and manual review are both required. A scan with no findings does not prove that all secrets and private information are absent. If a real credential was previously exposed, removing it from a new source package is insufficient; the owner must revoke or rotate it through its provider. The Community exporter does not rewrite private repository history.
