# Install and try WareKeep Community on Windows

WareKeep Community is an offline inventory, sales, and purchasing application. You do not need programming knowledge, an online account, or a paid subscription to use its core features.

This guide is for **version 1.0.10, Windows x64**. Internet access is needed to download the application; everyday use works offline afterward. This release does not include macOS, Linux, or Android packages.

## 1. Choose a download

| Download | Choose this when |
| --- | --- |
| [Setup](https://github.com/fazlafghan8-svg/warekeep-community/releases/download/v1.0.10/WareKeep-Community-Setup-1.0.10-x64.exe) | You want to install the application and open it from a shortcut. Recommended for regular use. |
| [Portable](https://github.com/fazlafghan8-svg/warekeep-community/releases/download/v1.0.10/WareKeep-Community-Portable-1.0.10-x64.exe) | You want to run the application without installing it. |

Download only one to begin. Both provide the same Community features. Portable means that an installer is unnecessary; business records are still stored in your Windows user profile, not inside the executable. Copying the Portable file to another computer does not copy your records. Use backup export and restore when moving data.

All files and release notes are on the [official 1.0.10 release page](https://github.com/fazlafghan8-svg/warekeep-community/releases/tag/v1.0.10).

## 2. Open the application

For **Setup**:

1. Open `WareKeep-Community-Setup-1.0.10-x64.exe` from your Downloads folder.
2. Follow the installer prompts.
3. Open **WareKeep Community** from its shortcut.

For **Portable**:

1. Keep `WareKeep-Community-Portable-1.0.10-x64.exe` in a folder where you can find it again.
2. Open that file whenever you want to use the application. Its first launch can take a moment while it prepares the application.

These files do not have a digital signature. Windows may display an unknown-publisher or reputation warning. Check that your file came from the official release page. If Windows blocks it, stop and ask for help through [GitHub Issues](https://github.com/fazlafghan8-svg/warekeep-community/issues); do not disable Windows protection.

## 3. Check your settings

A fresh workspace opens in **English**, with the **Gregorian** calendar and your computer's local time zone. To select Persian/Dari, open **Settings → General** and change the language. Review the business name, currency, and date settings before adding real records. Changing the language does not convert existing amounts or currency values.

Start with made-up information while learning. The screenshots below use demonstration records; they are not customer data or records automatically included with every new workspace.

![Dashboard with demonstration records](images/dashboard.png)

## 4. Add your first test item

1. Open **Inventory & Stock** and choose **Add Medicine**. The application uses medicine-related labels for its product records.
2. Enter a made-up name, such as `Test Product`, and complete the required details.
3. Choose **Next Step**. Enter a selling price, an initial quantity of **10**, and the required batch and expiry details. Use a future expiry date for this test.
4. Choose **Final Save**, then find the item in the inventory list and check that its stock is **10**.

![Inventory with demonstration products](images/inventory.png)

## 5. Record your first test sale

1. Open **Sales & Invoices** (also called **Sales / POS**) and search for `Test Product` by its name.
2. Select the item, enter **2** in **Qty**, and choose **Add line**.
3. Select a test customer, or create a made-up customer from the customer field. Review the price and payment details.
4. Choose **Print (F10)** to confirm the invoice. Check the success message and invoice preview; physical printing is not needed for this stock check.
5. Return to the inventory. Stock should now be **8**. Close and reopen the application and check that the item and invoice remain.

## 6. Save a backup

1. Open **Settings → Maintenance**.
2. Under **Backup & Restore**, choose **Export Data**.
3. Save the `.json` backup file and keep a dated copy in a safe place outside the application's data folder, such as a separate drive.

Export a backup regularly and **before updating, switching between Setup and Portable, or moving to another computer**. Backups contain business records; keep them private and do not attach them to public GitHub issues.

Restoring replaces the current workspace's records when you choose a valid backup file. Export the current records first, and practise restoration only in an empty test workspace before relying on a backup for real business data. To restore, open **Settings → Maintenance → Import Data**, choose the backup file, and wait for the success message. Setup and Portable use the same Community profile for the same Windows user; switching between them does not create an empty test workspace.

## What was checked for this release

The Windows files were built on **8 October 2026** from [source commit 05dbd9449016c5beb61a3122e71ddcaa94e0e1dc](https://github.com/fazlafghan8-svg/warekeep-community/commit/05dbd9449016c5beb61a3122e71ddcaa94e0e1dc). The source's [GitHub Actions checks passed](https://github.com/fazlafghan8-svg/warekeep-community/actions/runs/37734027684).

On the maintainer's Windows computer, checks passed for Setup installation and removal, Portable launch, offline operation, a test sale reducing stock from 10 to 8, records after reopening, and exporting and restoring a backup into a fresh test workspace. Tests used made-up data. The backup test checked the exported file and restoration; it used a test download handler instead of the normal Windows save dialog.

This release has not yet been tested on a second computer. Physical printing, encryption of stored records, and keeping records beyond three days were not tested in this release step. Try it with made-up records on your computer before relying on it for business data.

### File verification

The SHA-256 values below identify the exact files checked for this release. Comparing a downloaded file's SHA-256 value is optional and does not make an unsigned application digitally signed.

| File | SHA-256 |
| --- | --- |
| `WareKeep-Community-Setup-1.0.10-x64.exe` | `c6179da1a16be4dd2cd9a7f884e0150d7f64fc4939c573b407afa72ec3556c14` |
| `WareKeep-Community-Portable-1.0.10-x64.exe` | `ed68ba12aaec76b72aac47bddd6fd6f52f558fae52ec4fd9c471a9b60e385492` |

## Get help

For an ordinary problem, open an [issue](https://github.com/fazlafghan8-svg/warekeep-community/issues) with the application version, Windows version, what you tried, and what happened. Use made-up data in screenshots.

For a security vulnerability, use [private vulnerability reporting](https://github.com/fazlafghan8-svg/warekeep-community/security/advisories) and follow [SECURITY.md](../SECURITY.md).
