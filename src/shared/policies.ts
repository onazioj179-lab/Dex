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
export const POLICY_EFFECTIVE_DATE = '2026-11-25';
export const DATA_POLICY_VERSION = '3.0.0';

export type PolicySlug = 'terms' | 'privacy' | 'security' | 'thirdParty' | 'plugins';
export type DataCategoryId =
  | 'localDiagnostics'
  | 'localPersonalization'
  | 'onlineServices'
  | 'aiRequests'
  | 'messagesToDeveloper'
  | 'sensitiveContent'
  | 'pluginData';

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
  defaultState: 'local' | 'when-used' | 'off' | 'user-submitted' | 'feature-controlled' | 'never';
  purpose: string;
  examples: string[];
  userControl: string;
}

export const POLICY_METADATA: readonly PolicyMetadata[] = [
  {
    slug: 'terms',
    title: 'Terms of Use',
    version: '3.0.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: true,
    summary: 'Rules for using DEX, ownership, responsibility for automation and plugins, updates, warranties, liability limits, and the license for content you submit.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    version: '3.0.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: true,
    summary: 'DEX keeps your data on your computer and sends nothing in the background. Lists every online service a feature can contact, what it receives, and your controls.',
  },
  {
    slug: 'security',
    title: 'Security Policy',
    version: '2.2.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: false,
    summary: 'How DEX isolates web content, protects passwords and keys, which versions are supported, and how to report a vulnerability.',
  },
  {
    slug: 'thirdParty',
    title: 'Third-Party Notices',
    version: '2.2.0',
    effectiveDate: POLICY_EFFECTIVE_DATE,
    requiredForUse: false,
    summary: 'Open-source components DEX is built with, and where to find their licenses.',
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
    id: 'localDiagnostics',
    label: 'Diagnostics',
    defaultState: 'local',
    purpose: 'Help you see how DEX is performing and why something failed. Never sent anywhere.',
    examples: ['crash log', 'startup and app-launch timings', 'frame timing', 'interface errors'],
    userControl: 'View in Nexus > Diagnostics. Copy report copies numbers only, for you to share if you choose.',
  },
  {
    id: 'localPersonalization',
    label: 'Local Personalization',
    defaultState: 'local',
    purpose: 'Adapt DEX to you on this computer.',
    examples: ['frequent apps', 'layout preferences', 'recent commands', 'suggestions'],
    userControl: 'Clear app data or turn off the related features.',
  },
  {
    id: 'onlineServices',
    label: 'Online Services',
    defaultState: 'when-used',
    purpose: 'Features such as Weather, Maps, voice input and the Browser contact an online service only when you use them.',
    examples: ['weather and map requests', 'place search text', 'voice input', 'websites you visit'],
    userControl: 'Do not use the feature, or block location, microphone and other permissions in Settings > Permissions.',
  },
  {
    id: 'aiRequests',
    label: 'AI Requests',
    defaultState: 'off',
    purpose: 'Send your assistant requests to the AI provider you add a key for.',
    examples: ['your message and recent conversation', 'file text with your permission', 'one screen image you pick'],
    userControl: 'Off until you add a provider key. Processing: Local only never uses a cloud provider.',
  },
  {
    id: 'messagesToDeveloper',
    label: 'Messages to the Developer',
    defaultState: 'user-submitted',
    purpose: 'Answer your questions and fix problems you report.',
    examples: ['emails you send', 'GitHub issues you open', 'reports you choose to attach'],
    userControl: 'Only what you choose to send, through your own email or GitHub account.',
  },
  {
    id: 'sensitiveContent',
    label: 'Sensitive Content',
    defaultState: 'never',
    purpose: 'Passwords, Vault items, clipboard contents and your files are never collected by DEX.',
    examples: ['passwords', 'Vault items', 'clipboard contents', 'private documents'],
    userControl: 'Never collected.',
  },
  {
    id: 'pluginData',
    label: 'Plugin Data',
    defaultState: 'feature-controlled',
    purpose: 'Plugins can use only the permissions you grant them.',
    examples: ['plugin settings', 'plugin storage', 'permission grants'],
    userControl: 'Review, revoke or remove plugins and their permissions.',
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
