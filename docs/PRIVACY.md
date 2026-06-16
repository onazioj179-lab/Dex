# DEX Privacy Notice

> Last updated: 2026-05-06 (v3.8.8). Plain-English first. This sits
> alongside [TERMS.md](TERMS.md) and [SECURITY.md](SECURITY.md).

## The short version

- DEX runs on your machine. Your files, notes, and commands do not
  leave your device unless you explicitly turn on cloud sync.
- DEX is free for everyone: every feature is available to all users at
  no cost, with no paid plans, no in-app purchases, and no advertising.
  In exchange, DEX may use limited data to operate and improve the
  product.
- How we use and share data -- including optional analytics and partner
  integrations -- is described in our [Privacy Policy](../PRIVACY.md),
  which also explains your choices and opt-outs.
- The only personal data we hold for an account is: your email, your
  display name, and -- if you opted in -- the encrypted blobs you chose
  to back up.
- You can delete your account and your cloud data at any time from
  Settings > Account > Delete account. We honour the request within 30
  days.

## What we collect, only if you choose

| Feature                  | What we hold                                            | When we hold it                  |
|---|---|---|
| Account                  | Email, display name, hashed password / TOTP secret      | Only if you create an account    |
| Cloud sync               | Encrypted blobs you ticked in backup settings           | Only with sync turned on         |
| Usage analytics          | Anonymous app-open count, version, OS                   | Only if you opt in (off by default) |
| Crash reports            | Stack trace, OS, app version (no file content)          | Only if you opt in (off by default) |
| Support email            | Whatever you write to us                                | When you email support           |

## What we do **not** collect

- The contents of your files, notes, screenshots, or commands -- unless
  you explicitly enabled the matching backup category.
- Your keystrokes outside the DEX command bar.
- Your location (DEX has no location feature).
- Any tracking IDs from third-party advertisers. We have none.
- Any data sold to brokers. We do not have a data-broker relationship.

## End-to-end encryption

If you set a cloud passphrase:

- Your blobs are encrypted with a key derived from that passphrase
  (PBKDF2-SHA256, 600,000 rounds) before upload.
- We literally cannot read them. If you lose the passphrase, you lose
  the data; we cannot recover it.
- The cloud only sees encrypted bytes plus a small unencrypted index
  (object id, size, timestamp) needed to bill storage and pace sync.

If you do not set a passphrase, the cloud holds the wrap key on your
behalf so you can recover after a device wipe. Your data is still
encrypted at rest with a key only the DEX cloud function can access.

## Backup is per-category and opt-in

The backup master switch is off until you turn it on. Even then, only
the categories you tick are uploaded:

- settings & preferences (default on)
- snippets (default on)
- notes (default off)
- saved plans (default off)
- Nexus knowledge graph (default off)
- screenshots & recordings (default off)
- workspaces (default off)
- command history (default off, sensitive)

You can change these at any time. Removing a category from the list
also schedules deletion from the cloud within 24 hours.

## 2FA secrets

The TOTP secret is stored on your device, encrypted with the OS
keystore (Windows DPAPI, macOS Keychain, Linux libsecret). The cloud
holds only the hashed secret needed to verify codes during sign-in.

## Legacy / handover plan

If you enable the optional handover plan, we hold:

- the email addresses of the heirs you nominated,
- the inactivity window you chose,
- timestamps of activity / challenge / transfer events.

We do not share the contents of your account with heirs unless the
handover sequence completes (owner inactive for the threshold + 14-day
challenge window, heir confirms identity). You may cancel the plan at
any time and we delete the heir list immediately.

## Your rights

- **Access**: ask for a copy of everything we hold about you.
- **Correction**: ask us to fix anything wrong.
- **Deletion**: ask us to erase everything; we honour within 30 days.
- **Export**: download your cloud data as an encrypted bundle.
- **Withdraw consent**: turn off any analytics, sync, or backup at any
  time in Settings.

For any of the above, email onazi75@gmail.com.

## How long we keep things

- Account record: until you delete the account, then 30 days for
  reversal.
- Encrypted backup blobs: while your sync is enabled, plus 30 days
  after disable for reversal, then permanent deletion.
- Audit logs (sign-in, sync activity): 90 days.

## Children

DEX is not directed at children under 13. We do not knowingly collect
data from children under 13.

## Contact

- Owner: Onazi Treasure OJ
- Email: onazi75@gmail.com
