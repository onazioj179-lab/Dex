// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus knowledge-graph force simulation.
 *
 * Wraps d3-force with a small, framework-free API tailored for the Canvas2D
 * renderer in Nexus.tsx. The simulation runs in 2D (xy plane); the existing
 * 3D camera in Nexus projects xy positions through its rotation matrix. The
 * z-axis is reserved by callers for subtle parallax (we do not write to it).
 *
 * Design goals:
 *   - Keep the dense-graph aesthetic from the user's reference: many thin
 *     edges, weighted hub sizing, organic clustering.
 *   - Stay deterministic enough for animation without freezing on cold start.
 *   - Be cheap: capped tick budget, alphaMin gate, easy to throttle on
 *     low-tier devices through a single ratio.
 *   - Never throw on empty input. Never use emojis in messages or comments.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

export interface NexusGraphNode extends SimulationNodeDatum {
  id: string;
  weight: number;
  /** Cluster bucket for gravity grouping. */
  group?: string;
  /** Optional palette override. Renderer applies it. */
  color?: string;
  /** Node radius in CSS pixels at simulation scale. */
  radius?: number;
}

export interface NexusGraphLink extends SimulationLinkDatum<NexusGraphNode> {
  /** Edge weight in [0,1]. Renderer maps to alpha and width. */
  weight?: number;
}

export interface NexusGraphConfig {
  /** Approximate render area used for centering and layout strength. */
  width: number;
  height: number;
  /** Multiplier 1=normal, 0.5=throttled, etc. Used to scale forces and decay. */
  intensity?: number;
  /** Optional cluster gravity strength. */
  clusterStrength?: number;
}

export interface NexusGraphSimulation {
  readonly sim: Simulation<NexusGraphNode, NexusGraphLink>;
  readonly nodes: NexusGraphNode[];
  readonly links: NexusGraphLink[];
  /** Run one tick step. Returns current alpha. */
  tick: () => number;
  /** Reheat the simulation after data or layout changes. */
  reheat: (alpha?: number) => void;
  /** Replace nodes/links and reheat. */
  setData: (nodes: NexusGraphNode[], links: NexusGraphLink[]) => void;
  /** Resize centering forces. */
  resize: (width: number, height: number) => void;
  /** Stop and release. */
  dispose: () => void;
  /** Whether the simulation has settled below alphaMin. */
  isSettled: () => boolean;
}

const DEFAULT_INTENSITY = 1;
const DEFAULT_CLUSTER_STRENGTH = 0.06;

/**
 * Create a force simulation suitable for the Nexus knowledge-graph mode.
 * The caller is responsible for calling `tick()` on each render frame.
 */
export function createNexusGraphSimulation(
  initialNodes: NexusGraphNode[],
  initialLinks: NexusGraphLink[],
  config: NexusGraphConfig,
): NexusGraphSimulation {
  const intensity = config.intensity ?? DEFAULT_INTENSITY;
  const clusterStrength = config.clusterStrength ?? DEFAULT_CLUSTER_STRENGTH;

  const nodes = initialNodes.slice();
  const links = initialLinks.slice();

  // Seed positions so the first frame is not a singularity.
  seedPositions(nodes, config.width, config.height);

  const sim = forceSimulation<NexusGraphNode, NexusGraphLink>(nodes)
    .alphaDecay(0.03 * intensity)
    .velocityDecay(0.32)
    .force(
      'link',
      forceLink<NexusGraphNode, NexusGraphLink>(links)
        .id(n => n.id)
        .distance(l => 60 + (1 - (l.weight ?? 0.5)) * 60)
        .strength(l => 0.15 + (l.weight ?? 0.5) * 0.4),
    )
    .force(
      'charge',
      forceManyBody<NexusGraphNode>()
        .strength(n => -40 - (n.weight ?? 0) * 80)
        .distanceMax(360),
    )
    .force(
      'collide',
      forceCollide<NexusGraphNode>()
        .radius(n => (n.radius ?? 6) + 2)
        .strength(0.85),
    )
    .force('center', forceCenter(0, 0).strength(0.04))
    .force('x', forceX<NexusGraphNode>(0).strength(clusterStrength))
    .force('y', forceY<NexusGraphNode>(0).strength(clusterStrength));

  // Run the manual tick loop ourselves; we do not want d3 firing internal events.
  sim.stop();

  let disposed = false;

  return {
    sim,
    nodes,
    links,
    tick(): number {
      if (disposed) return 0;
      sim.tick(1);
      return sim.alpha();
    },
    reheat(alpha = 0.6): void {
      if (disposed) return;
      sim.alpha(Math.max(sim.alpha(), alpha)).restart();
      sim.stop(); // keep manual tick control
    },
    setData(newNodes: NexusGraphNode[], newLinks: NexusGraphLink[]): void {
      if (disposed) return;
      // Carry over previous positions for any node id we already had.
      const prev = new Map(nodes.map(n => [n.id, n] as const));
      nodes.length = 0;
      for (const incoming of newNodes) {
        const existing = prev.get(incoming.id);
        if (existing) {
          incoming.x = existing.x;
          incoming.y = existing.y;
          incoming.vx = existing.vx;
          incoming.vy = existing.vy;
        }
        nodes.push(incoming);
      }
      seedPositions(nodes, config.width, config.height);
      links.length = 0;
      for (const l of newLinks) links.push(l);

      sim.nodes(nodes);
      const linkForce = sim.force('link') as ReturnType<typeof forceLink<NexusGraphNode, NexusGraphLink>> | null;
      linkForce?.links(links);

      sim.alpha(0.7);
      sim.stop();
    },
    resize(width: number, height: number): void {
      if (disposed) return;
      config.width = width;
      config.height = height;
    },
    dispose(): void {
      disposed = true;
      sim.stop();
      sim.on('tick', null);
    },
    isSettled(): boolean {
      return sim.alpha() <= sim.alphaMin();
    },
  };
}

/**
 * Place nodes in a deterministic seed pattern (golden-angle spiral) to avoid
 * the cold-start singularity that vanilla d3-force produces from origin.
 */
function seedPositions(nodes: NexusGraphNode[], width: number, height: number): void {
  const radiusBase = Math.min(width, height) * 0.28;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (typeof n.x === 'number' && typeof n.y === 'number') continue;
    const t = i / Math.max(1, nodes.length - 1);
    const r = Math.sqrt(t) * radiusBase;
    const a = i * golden;
    n.x = Math.cos(a) * r;
    n.y = Math.sin(a) * r;
    n.vx = 0;
    n.vy = 0;
  }
}
