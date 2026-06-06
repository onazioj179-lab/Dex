// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lightweight policy metadata and data-category definitions.
 * Full policy text lives in policyDocuments.ts so feature chunks that only need
 * onboarding helpers do not carry the entire legal bundle.
 */

export const POLICY_CONTACT_EMAIL = 'onazi75@gmail.com';
export const POLICY_REPOSITORY_URL = 'https://github.com/onazioj179-lab/Dex';
export const POLICY_EFFECTIVE_DATE = '2026-06-06';
export const DATA_POLICY_VERSION = '2.1.0';

export type PolicySlug = 'terms' | 'privacy' | 'security' | 'thirdParty' | 'plugins';
export type DataCategoryId =
  | 'requiredDiagnostics'
  | 'optionalAnalytics'
  | 'localPersonalization'
  | 'feedbackSubmissions'
  | 'userContentSamples'
  | 'sensitiveContent'
  | 'pluginData'
  | 'cloudSyncData';

export interface PolicyMetadata {
  slug: PolicySlug;
  title: string;
  version: string;
  effectiveDate: string;
  requiredForUse: boolean;
  summary: string;
}

export interface PolicyDocument extends PolicyMetadata {
  body: string;
}

export interface DataCategoryDefinition {
  id: DataCategoryId;
  label: string;
  defaultState: 'required' | 'off' | 'local' | 'user-submitted' | 'feature-controlled' | 'never-by-default';
  purpose: string;
  examples: string[];
  userControl: string;
}

export const POLICY_METADATA: readonly PolicyMetadata[] = [
  {
    slug: 'terms',
    title: 'Terms of Use',
    version: '2.1.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: true,
    summary: 'Sharp use rules, DEX ownership rights, automation responsibility, plugin risk, updates, warranties, liability limits, and permitted data use for product improvement and model/system training.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    version: '2.1.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: true,
    summary: 'Explains required diagnostics, optional analytics, local personalization, feedback submissions, user content samples, sensitive-content limits, and user controls.',
  },
  {
    slug: 'security',
    title: 'Security Policy',
    version: '2.1.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: false,
    summary: 'Covers DEX security posture, supported versions, local vault/audit model, plugin risks, responsible disclosure, and diagnostic security signals.',
  },
  {
    slug: 'thirdParty',
    title: 'Third-Party Notices',
    version: '2.1.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: false,
    summary: 'Acknowledges major open-source dependencies and clarifies third-party licensing responsibilities.',
  },
  {
    slug: 'plugins',
    title: 'Plugin and Marketplace Policy',
    version: '1.0.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: false,
    summary: 'Rules for plugin developers and users, including permission disclosure, prohibited behavior, review/removal rights, and plugin data responsibilities.',
  },
] as const;

export const DATA_CATEGORIES: readonly DataCategoryDefinition[] = [
  {
    id: 'requiredDiagnostics',
    label: 'Required Diagnostics',
    defaultState: 'required',
    purpose: 'Keep DEX secure, reliable, compatible, updated, and able to recover from failures.',
    examples: ['app version', 'device class', 'crash category', 'startup timing', 'update/install state', 'security event category'],
    userControl: 'Required for DEX operation. Users can view the category and reduce optional detail, but cannot disable minimum reliability/security diagnostics.',
  },
  {
    id: 'optionalAnalytics',
    label: 'Optional Product Analytics',
    defaultState: 'off',
    purpose: 'Improve feature quality, workflow design, performance, reliability, and product direction.',
    examples: ['feature usage counts', 'workflow timing', 'render performance', 'non-content interaction patterns'],
    userControl: 'Off by default. Users can turn it on or off at any time in Settings > Legal & Privacy.',
  },
  {
    id: 'localPersonalization',
    label: 'Local Personalization',
    defaultState: 'local',
    purpose: 'Adapt DEX to the individual user on-device without sending personalization patterns out by default.',
    examples: ['frequent apps', 'layout preferences', 'local automation suggestions', 'recent command patterns'],
    userControl: 'Users can clear local app data or disable related features where available.',
  },
  {
    id: 'feedbackSubmissions',
    label: 'Feedback Submissions',
    defaultState: 'user-submitted',
    purpose: 'Support users, diagnose issues, improve DEX, and train/evaluate product safety and quality systems.',
    examples: ['written feedback', 'bug reports', 'attached logs', 'screenshots intentionally submitted by the user'],
    userControl: 'Only sent when the user chooses to submit or share it. Users should review content before sending.',
  },
  {
    id: 'userContentSamples',
    label: 'User Content Samples',
    defaultState: 'user-submitted',
    purpose: 'Improve DEX features, AI/model behavior, search, automation, recommendations, and safety systems when users intentionally submit or opt into data-improvement programs.',
    examples: ['sample prompts', 'example files', 'selected text/media snippets', 'workflow examples'],
    userControl: 'Not collected silently. Users submit, import into a cloud/AI feature, or opt into a program before DEX may use samples beyond local operation.',
  },
  {
    id: 'sensitiveContent',
    label: 'Sensitive Content',
    defaultState: 'never-by-default',
    purpose: 'Protect passwords, vault items, private files, clipboard content, chats, screenshots, and crash dumps from silent collection.',
    examples: ['passwords', 'vault secrets', 'clipboard contents', 'private documents', 'full crash dumps', 'screenshots'],
    userControl: 'Never collected or shared by default. Diagnostic capture must warn users if sensitive content may be included.',
  },
  {
    id: 'pluginData',
    label: 'Plugin Data',
    defaultState: 'feature-controlled',
    purpose: 'Allow plugins to operate only within declared permissions and user-granted capabilities.',
    examples: ['plugin settings', 'plugin storage', 'plugin network requests', 'permission grants'],
    userControl: 'Users can review, revoke, disable, or remove plugin permissions and plugins.',
  },
  {
    id: 'cloudSyncData',
    label: 'Cloud and Sync Data',
    defaultState: 'off',
    purpose: 'Provide sync, backup, or cloud-backed features only when enabled by the user.',
    examples: ['encrypted sync records', 'device identifiers for sync', 'cloud feature requests'],
    userControl: 'Off by default. Users can disable sync/cloud features and delete local data where supported.',
  },
] as const;

export const REQUIRED_POLICY_SLUGS = POLICY_METADATA.filter(p => p.requiredForUse).map(p => p.slug);

export const getPolicyMetadata = (slug: PolicySlug): PolicyMetadata => {
  const policy = POLICY_METADATA.find(p => p.slug === slug);
  if (!policy) throw new Error(`Unknown DEX policy: ${slug}`);
  return policy;
};

export const getRequiredPolicyVersions = (): Record<string, string> => {
  return Object.fromEntries(POLICY_METADATA.filter(p => p.requiredForUse).map(p => [p.slug, p.version]));
};
