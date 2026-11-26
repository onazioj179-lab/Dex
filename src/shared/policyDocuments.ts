// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/** Full bundled policy documents. Keep this separate from policies.ts. */

import {
  POLICY_CONTACT_EMAIL,
  POLICY_EFFECTIVE_DATE,
  POLICY_METADATA,
  POLICY_REPOSITORY_URL,
  type PolicyDocument,
  type PolicySlug,
} from './policies';

const TERMS_BODY = `# DEX Terms of Use\n\nEffective date: ${POLICY_EFFECTIVE_DATE}\nContact: ${POLICY_CONTACT_EMAIL}\n\nDEX is commercial software. It is licensed, not sold, under the DEX Software License Agreement: every new installation gets a 30-day full-feature trial, and continued use after the trial requires a paid licence. DEX has no advertising. How DEX handles data is described in the Privacy Policy.\n\nBy installing, launching, accessing, or using DEX, you agree to these Terms and the DEX Privacy Policy. If you do not agree, do not use DEX.\n\n## 1. Owner and Product\nDEX is created, owned, and maintained by Onazi Treasure OJ. DEX, the DEX name, logo, icons, product experience, documentation, wallpapers, DEX-OS assets, and related brand elements are reserved to the owner except where the MIT License expressly applies to covered source code.\n\n## 2. License and Limits\nDEX, including its source code, is proprietary and licensed only under the DEX Software License Agreement: a 30-day trial, then a paid licence. Published source does not grant any right to use, copy, modify, or redistribute DEX outside that agreement, nor any trademark, brand, marketplace, hosted service, model, dataset, telemetry, account, update-channel, or distribution-platform rights. Forks and redistributed builds must not imply endorsement, official status, or origin from DEX.\n\n## 3. Required Rules\nYou must not use DEX to break the law, violate rights, bypass security, distribute malware, scrape or attack systems, run unauthorized automation, abuse plugins, evade rate limits, interfere with DEX services, misuse AI/model features, or create safety-critical dependencies without your own independent review and risk acceptance.\n\n## 4. Automation Responsibility\nDEX can automate powerful actions. You are responsible for commands, workflows, scripts, files, accounts, credentials, plugins, outputs, and downstream effects you create, approve, run, schedule, or distribute through DEX. DEX is not responsible for losses caused by user instructions, automation choices, third-party services, plugins, or unsupported configurations.\n\n## 5. Data Use to Improve DEX\nSubject to the Privacy Policy and available user controls, you grant DEX / Onazi Treasure OJ a worldwide, non-exclusive, royalty-free, sublicensable license to process, analyze, derive insights from, aggregate, de-identify, use, reproduce, modify, create derivative works from, and otherwise use data you provide, submit, generate, or make available through DEX as needed to operate, secure, maintain, troubleshoot, personalize, improve, develop, train, test, and support DEX and related systems. This includes permitted diagnostics, usage patterns, feedback, user-submitted samples, model interactions, automation examples, and other data categories described in the Privacy Policy.\n\n## 6. AI and Model Improvement\nDEX may use permitted data to train, evaluate, tune, test, and improve models, automation systems, recommendations, search, classification, safety systems, abuse detection, and product quality. Sensitive content is not collected or shared by default. If you intentionally submit content to DEX or its developer, that data may be used as described in the Privacy Policy.\n\n## 7. Diagnostics\nDEX keeps diagnostics (crash log, timings, errors) on your device and does not send diagnostics or analytics. If that ever changes, the Privacy Policy will describe it and DEX will ask for your consent first.\n\n## 8. Plugins and Third Parties\nPlugins are independent software. You are responsible for plugins you install, permissions you grant, and data you share with plugins. DEX may review, block, quarantine, disable, delist, remove, rate-limit, or restrict plugins, integrations, accounts, features, or workflows that create risk, violate policy, harm users, infringe rights, or threaten DEX.\n\nDEX does not include advertising or sponsored content. Paid licences are described in the DEX Software License Agreement and the pricing page. Features you use may contact third-party online services, which are listed in the Privacy Policy; those services handle requests under their own terms.\n\n## 9. Updates and Changes\nDEX may provide updates, migrations, compatibility changes, security fixes, model/system changes, feature removals, policy updates, and emergency mitigations. Some changes may be required for security or compatibility. If material policy terms change, DEX may require re-acceptance before continued use.\n\n## 10. Ownership and Feedback\nYou retain ownership of your content subject to the licenses granted in these Terms. Feedback, suggestions, diagnostics, samples, bug reports, and ideas you submit may be used without restriction or compensation to improve DEX, create features, train systems, and operate the product.\n\n## 11. No Warranties\nDEX is provided as is and as available. To the maximum extent permitted by law, DEX disclaims all warranties, including merchantability, fitness for a particular purpose, non-infringement, accuracy, uninterrupted operation, security, and error-free behavior.\n\n## 12. Limitation of Liability\nTo the maximum extent permitted by law, DEX / Onazi Treasure OJ will not be liable for indirect, incidental, special, consequential, punitive, exemplary, data-loss, profit-loss, business-interruption, security, automation, plugin, model-output, or third-party damages.\n\n## 13. Indemnity\nYou agree to defend, indemnify, and hold harmless DEX / Onazi Treasure OJ from claims, losses, liabilities, damages, costs, and expenses arising from your use, misuse, modifications, distributions, automations, plugins, data submissions, rights violations, unlawful conduct, or breach of these Terms.\n\n## 14. Termination\nDEX may suspend, disable, restrict, or terminate access to features, services, update channels, plugin listings, or accounts where needed to enforce these Terms, protect users, protect DEX, comply with law, or reduce risk.\n\n## 15. Contact\nQuestions, legal notices, privacy requests, and security reports should be sent to ${POLICY_CONTACT_EMAIL}. Repository: ${POLICY_REPOSITORY_URL}.`;

/** Generated from PRIVACY.md (repository root); a test keeps the two identical. */
export const PRIVACY_BODY = `# DEX Privacy Policy

Effective date: 2026-11-25
Contact: onazi75@gmail.com

DEX is a desktop environment that runs on your computer. It has no advertising and needs no account. This policy describes what DEX stores, what it sends and when, and the controls you have. It reflects what the software does in version 7.0.1.

## 1. The short version

- DEX keeps your data on your computer.
- DEX sends nothing in the background. It has no analytics, no telemetry, no crash upload and no advertising.
- DEX contacts an online service only when you use a feature that needs one, and only that service receives the request. Section 3 lists them.
- Passwords, Vault items, clipboard contents, your files and your documents are never collected by DEX.

## 2. Data stored on your computer

| What | Where | How to remove it |
|---|---|---|
| Notes, tasks, calendar, settings and other app data | The DEX data folder (\`%APPDATA%\\com.onazioj.dex\`) | Delete items in the apps, or Settings › Reset DEX |
| Search index of your Documents, Desktop and Downloads folders, notes and clipboard history | The DEX data folder | Rebuilt automatically if removed |
| Clipboard history | The DEX data folder | Clipboard history › Clear. Copies made inside DEX are kept; copies from other programs are kept only if you turn on "Include copies from other apps" |
| Vault (passwords) | \`vault.dex\`, encrypted with AES-256-GCM using a key derived from your master password (Argon2id). The master password is never stored | Vault |
| Assistant (UKI) conversations and memory | The DEX data folder, encrypted | UKI settings: turn off Memory Recording, set Retention, forget items, export, or Clear All Memory |
| AI provider keys | Encrypted for your Windows account (DPAPI) | AI Providers settings |
| Diagnostics: crash log, startup and app-launch timings, frame timing, interface errors | The DEX data folder and the interface storage | Shown in Nexus › Diagnostics. They contain numbers, app names and error messages, never document contents |
| Startup log (version, WebView2 runtime, errors) | \`%LOCALAPPDATA%\\com.onazioj.dex\\logs\` | Settings › Storage › Clear caches |
| Interface state and web caches | The WebView2 profile in \`%LOCALAPPDATA%\\com.onazioj.dex\` | Settings › Storage › Clear caches |

When you uninstall DEX with the .exe installer, it offers to delete this data.

## 3. Online services DEX uses, and when

DEX makes these requests only when you use the feature. Each service receives the request and your IP address, and handles it under its own privacy policy.

| Feature | Service | What is sent |
|---|---|---|
| Weather | Open-Meteo (\`open-meteo.com\`) | The city you search for, or the coordinates of a place you choose |
| Maps | OpenFreeMap; Esri ArcGIS and OpenTopoMap for the Satellite and Topo styles; Open-Meteo for place search | Map tiles for the area you view; your search text |
| Maps › My location | Windows location service | Used only on your computer to center the map. Location is off until you turn it on in Settings |
| Assistant answers without an AI provider | DuckDuckGo, Wikipedia, WorldTimeAPI, Free Dictionary API, ExchangeRate-API | Your question, or the time zone, word or currency you ask about |
| Assistant with an AI provider | The provider whose API key you add: OpenAI, Anthropic, Google Gemini or OpenRouter | Your message, recent conversation and the DEX context the request needs; file text (up to 64 KB) only with your file-read permission; one screen image only after you pick a window or screen in the Windows picker |
| Voice input | The WebView2 speech service, which can use Microsoft's online speech recognition | Your voice while the microphone control is on |
| Browser | The websites you visit | Normal web traffic. Sites may set their own cookies |
| Link previews | The linked website | A request for the page's title and preview |
| Git | The remote repositories you configure | Git traffic |
| File sharing on your network | Devices on your local network | Only the files you choose to share, while sharing is on |

The assistant's Processing setting controls where requests can go. "Local only" never sends requests to a cloud provider.

## 4. Permissions

Settings › Permissions lists what DEX itself may use (clipboard, microphone, camera, location, notifications and others), with Allow, Ask or Block for each and when each was last requested. Websites in the Browser ask for permissions separately. The assistant's own access (files, network, screen) is listed on the same page and can be revoked at any time.

## 5. What DEX does not do

- It does not sell or share personal information.
- It does not show advertising or use advertising identifiers.
- It does not send analytics, usage statistics, diagnostics or crash reports.
- It does not record your screen, camera or microphone in the background.
- It does not set tracking cookies.

## 6. Sending information to the developer

DEX sends nothing to the developer. If you email the developer or open an issue on GitHub, you choose what to include, and that message is used only to answer you and fix problems. Nexus › Diagnostics › Copy report copies a summary that contains numbers, app names and statuses only, so you can review it before sharing.

## 7. Your rights

All DEX data is on your computer and under your control: you can view, export and delete it with the tools in section 2. The developer holds no personal data about DEX users unless you send it. To ask a privacy question or exercise a right under laws such as the GDPR or the CCPA, contact onazi75@gmail.com.

## 8. Children

DEX is not directed to children under 13, or the minimum age required where you live.

## 9. Changes

If this policy changes in a way that affects your data, DEX shows the new version and asks you to accept it before you continue. Earlier versions are in the project's history on GitHub.

## 10. Contact

onazi75@gmail.com · https://github.com/onazioj179-lab/Dex`;

const SECURITY_BODY = `# DEX Security Policy\n\nEffective date: ${POLICY_EFFECTIVE_DATE}\nContact: ${POLICY_CONTACT_EMAIL}\n\nDEX runs its interface in a WebView2 page that reaches the system only through one narrow native IPC entry point. Browser tabs are separate web views with no access to DEX's IPC. Passwords are kept in an encrypted Vault (AES-256-GCM, Argon2id key derivation), AI provider keys are encrypted for your Windows account, and assistant actions that change data ask for confirmation. Report vulnerabilities privately to ${POLICY_CONTACT_EMAIL} with the subject [SECURITY] DEX Vulnerability Report. Do not open public issues for exploitable vulnerabilities. Supported version: 7.0.x. Security fixes are released as new versions on GitHub.`;

const THIRD_PARTY_BODY = `# DEX Third-Party Notices\n\nEffective date: ${POLICY_EFFECTIVE_DATE}\n\nDEX is built with open-source software, including Tauri, Microsoft Edge WebView2, React, Zustand, Vite, TypeScript, and Rust libraries such as serde, sysinfo, tantivy and arboard. Each component remains under its own license; the full list of notices is in the NOTICE file installed with DEX. Third-party licenses do not grant rights to the DEX name, brand or bundled assets.`;

const PLUGIN_BODY = `# DEX Plugin and Marketplace Policy\n\nEffective date: ${POLICY_EFFECTIVE_DATE}\n\nPlugins must be honest about capabilities, permissions, data access, network use, paid features, and risks. Plugins must not contain malware, spyware, credential theft, unauthorized scraping, hidden data exfiltration, illegal automation, safety bypasses, deceptive UI, trademark misuse, or policy-evading behavior. DEX may review, reject, delist, quarantine, disable, remove, rate-limit, or block plugins or developers when needed to protect users, DEX, rights holders, infrastructure, or the company. Users install plugins at their own risk and are responsible for permissions they grant. Plugin developers must comply with DEX Terms, Privacy, Security, applicable laws, and all third-party licenses.`;

export const POLICY_DOCUMENTS: readonly PolicyDocument[] = POLICY_METADATA.map(policy => ({
  ...policy,
  body: policy.slug === 'terms'
    ? TERMS_BODY
    : policy.slug === 'privacy'
      ? PRIVACY_BODY
      : policy.slug === 'security'
        ? SECURITY_BODY
        : policy.slug === 'thirdParty'
          ? THIRD_PARTY_BODY
          : PLUGIN_BODY,
}));

export const getPolicyDocument = (slug: PolicySlug): PolicyDocument => {
  const policy = POLICY_DOCUMENTS.find(p => p.slug === slug);
  if (!policy) throw new Error(`Unknown DEX policy document: ${slug}`);
  return policy;
};
