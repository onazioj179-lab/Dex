// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Workflow Graph Model
// Phase 20: Cross-App Orchestration & Unified Workflows
// One workflow = many steps, one intent
// ===========================================================================

import { Logger } from '../utils/Logger';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

export type NodeType = 
  | 'file-operation'
  | 'app-control'
  | 'document-create'
  | 'web-step'
  | 'data-transform'
  | 'user-confirm'
  | 'condition'
  | 'delay'
  | 'log';

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowInput {
  name: string;
  type: 'file' | 'folder' | 'text' | 'number' | 'url' | 'selection';
  required: boolean;
  default?: any;
  description?: string;
}

export interface WorkflowOutput {
  name: string;
  type: 'file' | 'folder' | 'text' | 'data';
  description?: string;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  params: Record<string, any>;
  inputs: string[]; // References to input names or previous node outputs
  outputs: string[]; // Output names produced by this node
  position: number; // Order in workflow
  status: NodeStatus;
  result?: any;
  error?: string;
  duration?: number;
}

export interface WorkflowEdge {
  id: string;
  from: string; // Node ID
  to: string;   // Node ID
  condition?: string; // Optional condition for branching
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: number;
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
  author?: string;
  tags?: string[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  inputValues: Record<string, any>;
  outputValues: Record<string, any>;
  nodeResults: Map<string, any>;
  currentNodeId: string | null;
  startedAt: number;
  completedAt?: number;
  totalDuration?: number;
  error?: string;
  log: ExecutionLogEntry[];
}

export interface ExecutionLogEntry {
  timestamp: number;
  nodeId?: string;
  nodeName?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

// ===========================================================================
// WORKFLOW GRAPH CLASS
// ===========================================================================

export class WorkflowGraph {
  private workflow: Workflow;

  constructor(workflow: Workflow) {
    this.workflow = workflow;
  }

  // -------------------------------------------------------------------------
  // GRAPH OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Get all nodes
   */
  getNodes(): WorkflowNode[] {
    return [...this.workflow.nodes].sort((a, b) => a.position - b.position);
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): WorkflowNode | null {
    return this.workflow.nodes.find(n => n.id === nodeId) ?? null;
  }

  /**
   * Get edges
   */
  getEdges(): WorkflowEdge[] {
    return [...this.workflow.edges];
  }

  /**
   * Get starting nodes (no incoming edges)
   */
  getStartNodes(): WorkflowNode[] {
    const nodesWithIncoming = new Set(this.workflow.edges.map(e => e.to));
    return this.workflow.nodes.filter(n => !nodesWithIncoming.has(n.id));
  }

  /**
   * Get ending nodes (no outgoing edges)
   */
  getEndNodes(): WorkflowNode[] {
    const nodesWithOutgoing = new Set(this.workflow.edges.map(e => e.from));
    return this.workflow.nodes.filter(n => !nodesWithOutgoing.has(n.id));
  }

  /**
   * Get next nodes from a given node
   */
  getNextNodes(nodeId: string): WorkflowNode[] {
    const outgoingEdges = this.workflow.edges.filter(e => e.from === nodeId);
    return outgoingEdges
      .map(e => this.workflow.nodes.find(n => n.id === e.to))
      .filter((n): n is WorkflowNode => n !== undefined);
  }

  /**
   * Get previous nodes to a given node
   */
  getPreviousNodes(nodeId: string): WorkflowNode[] {
    const incomingEdges = this.workflow.edges.filter(e => e.to === nodeId);
    return incomingEdges
      .map(e => this.workflow.nodes.find(n => n.id === e.from))
      .filter((n): n is WorkflowNode => n !== undefined);
  }

  /**
   * Get execution order (topological sort)
   */
  getExecutionOrder(): WorkflowNode[] {
    const visited = new Set<string>();
    const order: WorkflowNode[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const prevNodes = this.getPreviousNodes(nodeId);
      for (const prev of prevNodes) {
        visit(prev.id);
      }
      
      const node = this.getNode(nodeId);
      if (node) {
        order.push(node);
      }
    };

    // Visit all end nodes first to ensure all paths are covered
    for (const endNode of this.getEndNodes()) {
      visit(endNode.id);
    }

    // Visit any remaining nodes
    for (const node of this.workflow.nodes) {
      visit(node.id);
    }

    return order;
  }

  /**
   * Validate workflow graph
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for cycles
    if (this.hasCycle()) {
      errors.push('Workflow contains a cycle');
    }

    // Check all edges reference valid nodes
    const nodeIds = new Set(this.workflow.nodes.map(n => n.id));
    for (const edge of this.workflow.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge references non-existent source node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge references non-existent target node: ${edge.to}`);
      }
    }

    // Check for orphan nodes (except start nodes)
    const startNodes = this.getStartNodes();
    const reachable = new Set<string>();
    const queue = [...startNodes.map(n => n.id)];
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      
      for (const next of this.getNextNodes(nodeId)) {
        queue.push(next.id);
      }
    }

    for (const node of this.workflow.nodes) {
      if (!reachable.has(node.id) && !startNodes.some(s => s.id === node.id)) {
        errors.push(`Node is unreachable: ${node.name} (${node.id})`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check for cycles using DFS
   */
  private hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const next of this.getNextNodes(nodeId)) {
        if (!visited.has(next.id)) {
          if (dfs(next.id)) return true;
        } else if (recursionStack.has(next.id)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of this.workflow.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  /**
   * Get workflow summary
   */
  getSummary(): {
    nodeCount: number;
    edgeCount: number;
    inputCount: number;
    outputCount: number;
    isLinear: boolean;
    estimatedSteps: number;
  } {
    const isLinear = this.workflow.edges.length === this.workflow.nodes.length - 1 &&
      this.getStartNodes().length === 1 &&
      this.getEndNodes().length === 1;

    return {
      nodeCount: this.workflow.nodes.length,
      edgeCount: this.workflow.edges.length,
      inputCount: this.workflow.inputs.length,
      outputCount: this.workflow.outputs.length,
      isLinear,
      estimatedSteps: this.workflow.nodes.length,
    };
  }
}

// ===========================================================================
// WORKFLOW BUILDER
// ===========================================================================

export class WorkflowBuilder {
  private workflow: Workflow;
  private nodeCounter = 0;

  constructor(name: string, description?: string) {
    this.workflow = {
      id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      description,
      version: 1,
      inputs: [],
      outputs: [],
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Add an input definition
   */
  addInput(input: WorkflowInput): WorkflowBuilder {
    this.workflow.inputs.push(input);
    return this;
  }

  /**
   * Add an output definition
   */
  addOutput(output: WorkflowOutput): WorkflowBuilder {
    this.workflow.outputs.push(output);
    return this;
  }

  /**
   * Add a node
   */
  addNode(
    type: NodeType,
    name: string,
    params: Record<string, any> = {},
    options: { inputs?: string[]; outputs?: string[]; description?: string } = {}
  ): string {
    const nodeId = `node_${++this.nodeCounter}`;
    
    const node: WorkflowNode = {
      id: nodeId,
      type,
      name,
      params,
      inputs: options.inputs ?? [],
      outputs: options.outputs ?? [],
      position: this.workflow.nodes.length,
      status: 'pending',
      description: options.description,
    };

    this.workflow.nodes.push(node);
    
    // Auto-connect to previous node if linear
    if (this.workflow.nodes.length > 1) {
      const prevNode = this.workflow.nodes[this.workflow.nodes.length - 2];
      this.connect(prevNode.id, nodeId);
    }

    return nodeId;
  }

  /**
   * Connect two nodes
   */
  connect(fromId: string, toId: string, condition?: string): WorkflowBuilder {
    const edgeId = `edge_${this.workflow.edges.length + 1}`;
    
    this.workflow.edges.push({
      id: edgeId,
      from: fromId,
      to: toId,
      condition,
    });

    return this;
  }

  /**
   * Add file operation node (chainable)
   */
  fileOperation(operation: 'rename' | 'move' | 'copy' | 'delete' | 'organize' | 'batch-rename', params: Record<string, any>): WorkflowBuilder {
    this.addNode('file-operation', `File: ${operation}`, { operation, ...params });
    return this;
  }

  /**
   * Add document creation node (chainable)
   */
  createDocument(type: string, params: Record<string, any>): WorkflowBuilder {
    this.addNode('document-create', `Create: ${type}`, { type, ...params });
    return this;
  }

  /**
   * Add web step node (chainable)
   */
  webStep(action: string, params: Record<string, any>): WorkflowBuilder {
    this.addNode('web-step', `Web: ${action}`, { action, ...params });
    return this;
  }

  /**
   * Add user confirmation node (chainable)
   */
  userConfirm(message: string): WorkflowBuilder {
    this.addNode('user-confirm', 'Confirm', { message });
    return this;
  }

  /**
   * Add delay node (chainable)
   */
  delay(ms: number): WorkflowBuilder {
    this.addNode('delay', `Wait ${ms}ms`, { duration: ms });
    return this;
  }

  /**
   * Add log node (chainable)
   */
  log(message: string): WorkflowBuilder {
    this.addNode('log', 'Log', { message });
    return this;
  }

  /**
   * Add conditional branch
   */
  condition(expression: string, trueNodeId: string, falseNodeId: string): string {
    const conditionNodeId = this.addNode('condition', 'Condition', { expression });
    
    // Remove auto-created edge
    this.workflow.edges = this.workflow.edges.filter(
      e => !(e.from === this.workflow.nodes[this.workflow.nodes.length - 2]?.id && e.to === conditionNodeId)
    );

    this.connect(conditionNodeId, trueNodeId, 'true');
    this.connect(conditionNodeId, falseNodeId, 'false');
    
    return conditionNodeId;
  }

  /**
   * Set metadata
   */
  setMetadata(author?: string, tags?: string[]): WorkflowBuilder {
    this.workflow.author = author;
    this.workflow.tags = tags;
    return this;
  }

  /**
   * Build the workflow
   */
  build(): Workflow {
    this.workflow.updatedAt = Date.now();
    return { ...this.workflow };
  }

  /**
   * Build and validate
   */
  buildAndValidate(): { workflow: Workflow; validation: { valid: boolean; errors: string[] } } {
    const workflow = this.build();
    const graph = new WorkflowGraph(workflow);
    const validation = graph.validate();
    
    return { workflow, validation };
  }
}

// ===========================================================================
// PRESET WORKFLOWS
// ===========================================================================

export const PRESET_WORKFLOWS = {
  /**
   * Organize and document files
   */
  organizeAndDocument(): Workflow {
    return new WorkflowBuilder('Organize & Document', 'Organize files by type and create inventory')
      .addInput({ name: 'sourceFolder', type: 'folder', required: true, description: 'Folder to organize' })
      .addOutput({ name: 'inventory', type: 'file', description: 'File inventory CSV' })
      .fileOperation('organize', { by: 'type' })
      .createDocument('csv', { name: 'inventory', template: 'file-inventory' })
      .log('Organization complete')
      .build();
  },

  /**
   * Batch rename files
   */
  batchRename(): Workflow {
    return new WorkflowBuilder('Batch Rename', 'Rename multiple files with rules')
      .addInput({ name: 'files', type: 'selection', required: true, description: 'Files to rename' })
      .addInput({ name: 'prefix', type: 'text', required: false, description: 'Prefix to add' })
      .userConfirm('Preview rename changes?')
      .fileOperation('batch-rename', { useInputs: true })
      .log('Rename complete')
      .build();
  },

  /**
   * Download and archive
   */
  downloadAndArchive(): Workflow {
    return new WorkflowBuilder('Download & Archive', 'Download files from web and organize')
      .addInput({ name: 'url', type: 'url', required: true, description: 'URL to download' })
      .addInput({ name: 'destination', type: 'folder', required: true, description: 'Save location' })
      .webStep('download', { useInputs: true })
      .fileOperation('move', { toArchive: true })
      .createDocument('text', { name: 'download-log', template: 'task-report' })
      .build();
  },
};
