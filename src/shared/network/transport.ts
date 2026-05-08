// =============================================================================
// DEX Platform — Track D1: transport selection (QUIC / TCP / P2P)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Picks the best transport for a given peer based on detected network
 * conditions, NAT type, and capability flags. Real send/recv lives in
 * the host (quinn napi). This module is the policy.
 */

export type Transport = 'quic-direct' | 'quic-relay' | 'tcp-https' | 'p2p-mdns';

export interface NetCondition {
  /** RTT estimate in ms. */
  rttMs: number;
  /** 0..1 packet loss. */
  loss: number;
  /** True if both peers reachable on the same LAN. */
  sameLan: boolean;
  /** NAT type as detected by STUN. */
  nat: 'open' | 'cone' | 'symmetric' | 'unknown';
  /** Local mDNS bridge available. */
  mdns: boolean;
  /** TURN relay reachable. */
  turn: boolean;
}

export interface TransportRequirement {
  /** Throughput-bound flow benefits from QUIC; control flows do not. */
  bulk: boolean;
  /** Need ordered, lossless. */
  reliable: boolean;
  /** Cannot tolerate relay (privacy). */
  noRelay?: boolean;
}

export function pickTransport(net: NetCondition, req: TransportRequirement): Transport {
  if (net.sameLan && net.mdns) return 'p2p-mdns';
  if (net.nat === 'symmetric') {
    if (req.noRelay) return 'tcp-https';
    return net.turn ? 'quic-relay' : 'tcp-https';
  }
  if (net.loss > 0.05 && req.bulk) return 'quic-direct'; // QUIC handles loss better
  if (req.bulk) return 'quic-direct';
  return 'tcp-https';
}

/** Estimate effective throughput (kB/s) under loss given window size. */
export function estimateThroughputKbps(net: NetCondition, windowKb: number): number {
  const rttSec = Math.max(0.001, net.rttMs / 1000);
  const lossFactor = Math.max(0.01, 1 - net.loss);
  return (windowKb / rttSec) * lossFactor;
}
