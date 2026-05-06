# DEX -- Personal Control Hub

> Created by Onazi Treasure OJ &lt;onazi75@gmail.com&gt; - Version 3.8.8 - Copyright (c) 2026 - DEX Software License Agreement v1.0

DEX is your personal command bar for the desktop. One key, one bar, anything done. Take notes, run timers, open files, snap a screenshot, focus your screen, mute the room, jump between apps -- without ever leaving the keyboard. Everything happens on your machine.

## What is new in 3.8.9 -- Polished accounts, 100 GB cloud, sharper Pro

- **Paid storage doubled to 100 GB.** Personal, Family, Pro, and Studio (per seat) all get 100 GB of cloud storage. Free Viewer keeps its 10 GB.
- **Polished account UI.** New welcome / sign-in / sign-up / terms-gate / two-factor / skip / success flow built on the shared design tokens. The Settings -> Account section is now a first-class surface with a storage-usage card and an upgrade prompt.
- **Onboarding sign-in or skip.** First-launch onboarding now includes an optional account step. Skipping is the recommended default; an account is never required to use DEX.
- **Pro perks made obvious.** New `proPerks` catalogue + `ProBadge` and `UpgradePrompt` components mean every paid feature shows up consistently with the same headline, blurb, and minimum plan everywhere it appears.
- **CHANGELOG trimmed.** The public CHANGELOG now documents the current release only; older entries live in git tags and GitHub Releases.

## What is new in 3.8.8 -- 2FA, legacy plan, cloud storage, smart UKI by plan

- **Two-factor sign-in.** Optional TOTP (Google Authenticator, Authy, 1Password, any RFC 6238 app). Set it up in Settings > Security; eight one-time recovery codes are printed once and never shown again.
- **Legacy / handover plan.** Nominate up to 5 people you trust. If you stop using DEX for the inactivity window you choose (default 90 days), DEX emails you first. If 14 more days pass with no reply, your heirs get a one-time link. Off by default, fully under your control, never automatic.
- **Cloud storage tiers.** Free Viewer gets 10 GB. Personal, Family, Pro, Studio get 100 GB (per seat for Studio). 90% triggers a soft warning, 100% pauses uploads -- never silent overage.
- **End-to-end encryption.** AES-GCM-256 with a per-object key. If you set a passphrase the cloud literally cannot read your data; PBKDF2-SHA256 600,000 rounds derives the wrap key from your passphrase and a per-account salt. Lose the passphrase, lose the data -- DEX warns you twice.
- **Backup is opt-in, per category.** Master switch is off until you turn it on. Pick exactly which categories sync (settings, snippets, notes, plans, Nexus graph, media, workspaces, history). Wi-Fi-only and night-only options on by default. Command history is OFF by default because it is sensitive.
- **Smart UKI scales with your plan.** Free Viewer: 20 plans/day, small model. Personal: 200/day, standard model. Pro: 1000/day, pro model, higher concurrency. Studio: 2000/seat/day. Visible counter in the UKI overlay so there is no surprise.
- **Hardened rate limiting reaches every cloud route.** Sign-in, account creation, checkout, sync push, UKI plan execution, search, and storage upload all sit behind the same TokenBucket rules.

## What is new in 3.8.7 -- Accounts, Stripe checkout, and a hardened door

- **Optional DEX account.** Sign in to keep your settings, snippets, plans, and (optionally) your Nexus graph in sync across devices. Skip it and DEX still works fully. Your data stays yours either way.
- **Stripe-powered checkout.** Buy any plan in two clicks. Subscriptions, lifetime, per-seat, and discount codes all work. The secret key lives only in our cloud function -- never in the desktop app, never in this public repo.
- **Hardened door.** Token-bucket rate limits on sign-in, account creation, checkout, and sync. Disposable-email detection. Per-IP and per-device fanout caps. Tor-exit awareness. Constant-time secret compare. Every limit is documented and tested.
- **Slightly sharper prices.** Personal $6.99/mo or $49/yr ($99 lifetime). Pro $12.99/mo or $119/yr ($199 lifetime). Studio $24.99/seat/mo. Free Viewer remains free, forever, for everyone.

## What is new in 3.8.6 -- Pricing that favors you

DEX is now a paid product, with a 30-day full-feature free trial and a free read-only viewer that keeps your data accessible after the trial ends.

- **One person, $6.99 / month** or **$49 / year** (save 41%) -- DEX Personal covers every app on your devices.
- **Pro is $12.99 / month** or **$119 / year**, adds commercial use rights, live collab, and priority support.
- **Studio is $24.99 / seat / month** for teams, with admin console and a 99.5% uptime SLA.
- **Lifetime licences** are available for Personal ($99), Family ($179) and Pro ($199) -- one-time payment, every update in the major version included.
- **50% off for students, educators, and non-profits.** **Free DEX Pro for open-source maintainers.** **One free year of Personal if you switch from a paid competitor.**
- **No ads. No data resale. 14-day no-questions refund. Read-only access kept forever after cancel.** See [PRICING](docs/PRICING.md).

## What is new in 3.8.5 -- Nexus Futurism

DEX's knowledge graph just grew up.

- **Ten ways to look at your world.** Switch the Nexus view between grid, circle, spiral, radial, cluster, hex, tree, random, weight-sorted and timeline layouts. Pick the shape that fits the question you are asking.
- **Smart "find similar".** Type a phrase and Nexus surfaces the most related items in your graph in milliseconds, on-device. No cloud calls, no model download.
- **Collab seeds.** A typed message protocol for shared graph editing landed under the hood, ready for the LAN p2p sessions arriving in the next wave.

## Why people use DEX

- **One assistant for everything.** Tap UKI, type what you want, get it done. No menu hunting.
- **Plans you can preview.** Anything risky is shown to you first as a clear list of steps. You hit Run or Cancel.
- **Apps that work together.** Notes, Tasks, Files, Workflows, Vinx, Axl, Rewind and more share context, so your work follows you.
- **Yours, on your machine.** Patterns, history, and shortcuts stay on this device. Optional analytics is off by default.
- **Built for keyboards.** Every action has a shortcut. Press `/` to see the command menu.
- **Always improving.** Free updates roll in, the changelog is one click away.

## What is new in 3.8 -- UKI AutoPilot

DEX got an upgrade you can feel.

- **A bigger command menu.** Type `/` and pick from `summarize`, `translate`, `timer`, `screenshot`, `clipboard`, `notify`, `diff`, `focus`, `mute`, `toast`, `open-link`, `count`, `snapshot`, `dismiss` (plus the originals `open`, `note`, `task`, `find`, `run`).
- **Smart multi-step requests.** Ask UKI to do several things at once. It plans them out, shows you the plan, runs the steps, and tells you when it is done.
- **A safety gate for risky stuff.** Anything destructive pauses on screen with a one-click Run or Cancel. Nothing happens behind your back.
- **A pattern learner.** UKI quietly notices what you tend to do in each context and suggests your next likely action. 100% on-device.
- **A scheduler.** Tell UKI to run something on a clock, when you go idle, when the system suspends, resumes, locks, or unlocks.

## What was new in 3.7

- **Shared activity feed.** Apps, files, tasks, and clipboard activity all flow through one stream so the assistant always has context.
- **Smoother feel.** New motion presets across hover, focus, fade, and progress. Reduced-motion is fully respected.
- **One hotkey per intent.** `Ctrl+K` is the command launcher. `Ctrl+Space` is the UKI panel. No more overlap.
- **First wave of slash commands.** `/help`, `/open`, `/note`, `/task`, `/find`, `/run`.

## Quickstart

```bash
npm install
npm run dev
```

That is it. The first time you run DEX it sets itself up.

## Get DEX

Pre-built installers and updates roll in automatically. Read the in-app About page or the changelog for what is shipping next.

## Help and feedback

- [Documentation](docs/APP_DOCUMENTATION.md)
- [Changelog](docs/CHANGELOG.md)
- [Privacy](PRIVACY.md)
- [Terms](TERMS.md)
- [Security](docs/SECURITY.md)
- [License](LICENSE)

---

**DEX** - Designed, built, and maintained by **Onazi Treasure OJ** &lt;onazi75@gmail.com&gt;.
Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. Licensed under the MIT License.