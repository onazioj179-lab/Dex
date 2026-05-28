// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

/**
 * Blocked domains for the DEX Secure Browser.
 * Covers ad networks, trackers, fingerprinting services, retargeting, and
 * session-recording vendors. Edit this list to add or remove domains without
 * touching Browser.tsx.
 */
export const BLOCKED_DOMAIN_LIST: readonly string[] = [
  // Major Ad Networks
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'pagead2.googlesyndication.com',
  'adservice.google.com', 'ads.google.com', 'adsense.google.com', 'tpc.googlesyndication.com',
  'ads.yahoo.com', 'advertising.com', 'adnxs.com', 'adsrvr.org', 'adroll.com', 'amazon-adsystem.com',
  'media.net', 'outbrain.com', 'taboola.com', 'zedo.com', 'popads.net', 'adcolony.com',
  'inmobi.com', 'mopub.com', 'applovin.com', 'unity3d.com', 'vungle.com', 'chartboost.com',
  'admob.com', 'flurry.com', 'mobilecore.com', 'airpush.com', 'leadbolt.com', 'startapp.com',

  // Programmatic Exchanges
  'criteo.com', 'criteo.net', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'smartadserver.com',
  'bidswitch.net', 'casalemedia.com', 'contextweb.com', 'appnexus.com', 'indexexchange.com',
  'lijit.com', 'sovrn.com', 'spotxchange.com', 'springserve.com', 'freewheel.tv', 'spotx.tv',

  // Facebook/Meta Tracking (keep connect.facebook.net & graph.facebook.com for Facebook Login)
  'facebook.com/tr', 'pixel.facebook.com', 'an.facebook.com',
  'staticxx.facebook.com', 'business.facebook.com',

  // Google Analytics & Tracking
  'analytics.google.com', 'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'ssl.google-analytics.com', 'tagmanager.google.com', 'gtag.google.com',

  // Major Analytics Platforms
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'segment.com', 'segment.io',
  'mixpanel.com', 'amplitude.com', 'heap.io', 'heapanalytics.com', 'kissmetrics.com',
  'mxpnl.com', 'cdn.mxpnl.com', 'api.mixpanel.com', 'api.amplitude.com',

  // Session Recording & Heatmaps
  'hotjar.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'inspectlet.com',
  'luckyorange.com', 'logrocket.com', 'smartlook.com', 'clarity.ms', 'static.hotjar.com',
  'script.hotjar.com', 'vars.hotjar.com', 'rs.fullstory.com', 'edge.fullstory.com',

  // Data Management & DMP
  'bluekai.com', 'demdex.net', 'krxd.net', 'exelator.com', 'tealiumiq.com', 'tealium.com',
  'omtrdc.net', 'everesttech.net', 'adobedtm.com', 'tt.omtrdc.net', 'liveramp.com',
  'rlcdn.com', 'pippio.com', 'adsymptotic.com', 'eyeota.net', 'crwdcntrl.net',

  // Error Tracking (keep sentry/rollbar/bugsnag/newrelic/datadog - users may visit dashboards)
  'loggly.com', 'sumologic.com', 'trackjs.com', 'raygun.io', 'errorception.com',

  // A/B Testing & Optimization
  'optimizely.com', 'visualwebsiteoptimizer.com', 'abtasty.com', 'convert.com',
  'omniconvert.com', 'vwo.com', 'cdn.optimizely.com', 'logx.optimizely.com',

  // Social Media Trackers (keep t.co for Twitter links, platform.twitter.com for embeds)
  'analytics.twitter.com',
  'linkedin.com/px', 'snap.licdn.com', 'px.ads.linkedin.com', 'ads.linkedin.com',
  'sc-static.net', 'tr.snapchat.com', 'ads.pinterest.com', 'ct.pinterest.com',
  'trk.pinterest.com', 'widgets.pinterest.com', 'log.pinterest.com',

  // Fingerprinting Services
  'fingerprintjs.com', 'cdn.fpjs.io', 'api.fpjs.io', 'fpjs.pro', 'biocatch.com',
  'threatmetrix.com', 'inauth.com', 'iovation.com', 'bluecava.com', 'maxmind.com',

  // Retargeting & Remarketing
  'adform.net', 'adsymptotic.com', 'agkn.com', 'bat.bing.com',
  'bizible.com', 'bizographics.com', 'bkrtx.com', 'blismedia.com', 'boomtrain.com',

  // Video Ad Networks (keep imasdk.googleapis.com - required by many video players)
  'vid.springserve.com', 'static.adsafeprotected.com',
  'cdn.adsafeprotected.com', 'pixel.adsafeprotected.com', 'pagefair.com', 'pagefair.net',

  // Consent/Cookie Walls (keep - users need these to interact with cookie banners)
  'quantcast.com',

  // CDN Tracking
  'cdn.krxd.net', 'cdn.demdex.net', 'cdn.segment.com', 'cdn.amplitude.com',

  // Additional Tracking
  'sharethis.com', 'addthis.com', 'addtoany.com', 'shareaholic.com', 'click.linksynergy.com',
  'track.adform.net', 'sync.outbrain.com', 'widgets.outbrain.com', 'tr.outbrain.com',
  'ping.chartbeat.net', 'static.chartbeat.com', 'siteintercept.qualtrics.com',
  'cdn.heapanalytics.com', 'cdn.segment.io', 'api.segment.io', 't.clarity.ms',
  'www.clarity.ms', 'static.ads-twitter.com', 'syndication.twitter.com',
] as const;
