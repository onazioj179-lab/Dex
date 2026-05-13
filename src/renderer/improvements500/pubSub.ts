// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Topic-based pub/sub bus. Distinct from `TypedEventEmitter`: subscribers
 * use string topic patterns ("orders.*", "system.network.online") and the
 * bus performs glob-style matching with `*` wildcard segments.
 */

export type TopicHandler = (topic: string, payload: unknown) => void;

interface Subscription {
  pattern: string;
  segments: string[];
  handler: TopicHandler;
}

function splitTopic(t: string): string[] {
  return t.split('.').filter((s) => s.length > 0);
}

function matches(patternSegments: string[], topicSegments: string[]): boolean {
  if (patternSegments.length === 0) return false;
  // Trailing '#' (multi-segment wildcard) - we use '**' for that here.
  for (let i = 0; i < patternSegments.length; i += 1) {
    const p = patternSegments[i];
    if (p === '**') return true;
    if (i >= topicSegments.length) return false;
    if (p === '*') continue;
    if (p !== topicSegments[i]) return false;
  }
  return patternSegments.length === topicSegments.length;
}

export class PubSub {
  private readonly subs: Set<Subscription> = new Set();

  subscribe(pattern: string, handler: TopicHandler): () => void {
    const sub: Subscription = { pattern, segments: splitTopic(pattern), handler };
    this.subs.add(sub);
    return () => { this.subs.delete(sub); };
  }

  publish(topic: string, payload: unknown = undefined): void {
    const segs = splitTopic(topic);
    for (const sub of Array.from(this.subs)) {
      if (matches(sub.segments, segs)) {
        try {
          sub.handler(topic, payload);
        } catch {
          // isolate handlers
        }
      }
    }
  }

  get subscriberCount(): number {
    return this.subs.size;
  }

  clear(): void {
    this.subs.clear();
  }
}
