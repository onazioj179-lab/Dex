// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SpatialHash - O(1) spatial lookup for hit testing
 * 
 * Divides 2D space into grid cells for fast point/rect queries.
 * Used for window hit testing, canvas node detection, and collision checks.
 * 
 * Example usage:
 * ```ts
 * const hash = new SpatialHash<NodeId>(100); // 100px cells
 * hash.insert('node1', { x: 50, y: 50, width: 200, height: 100 });
 * const hits = hash.queryPoint(120, 80); // Returns ['node1']
 * ```
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

type CellKey = string;

export class SpatialHash<T> {
  private cellSize: number;
  private cells: Map<CellKey, Set<T>> = new Map();
  private itemBounds: Map<T, Rect> = new Map();
  private itemCells: Map<T, CellKey[]> = new Map();

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
  }

  /**
   * Get cell key for a point
   */
  private getCellKey(x: number, y: number): CellKey {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  /**
   * Get all cell keys that a rect overlaps
   */
  private getCellsForRect(rect: Rect): CellKey[] {
    const keys: CellKey[] = [];
    const minCx = Math.floor(rect.x / this.cellSize);
    const minCy = Math.floor(rect.y / this.cellSize);
    const maxCx = Math.floor((rect.x + rect.width) / this.cellSize);
    const maxCy = Math.floor((rect.y + rect.height) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        keys.push(`${cx},${cy}`);
      }
    }
    return keys;
  }

  /**
   * Insert an item with its bounding rect
   */
  insert(item: T, rect: Rect): void {
    // Remove if already exists
    if (this.itemBounds.has(item)) {
      this.remove(item);
    }

    const cellKeys = this.getCellsForRect(rect);
    this.itemBounds.set(item, { ...rect });
    this.itemCells.set(item, cellKeys);

    for (const key of cellKeys) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(item);
    }
  }

  /**
   * Update an item's position/size
   */
  update(item: T, rect: Rect): void {
    this.insert(item, rect);
  }

  /**
   * Remove an item
   */
  remove(item: T): boolean {
    const cellKeys = this.itemCells.get(item);
    if (!cellKeys) return false;

    for (const key of cellKeys) {
      const cell = this.cells.get(key);
      if (cell) {
        cell.delete(item);
        if (cell.size === 0) {
          this.cells.delete(key);
        }
      }
    }

    this.itemBounds.delete(item);
    this.itemCells.delete(item);
    return true;
  }

  /**
   * Query items at a specific point
   */
  queryPoint(x: number, y: number): T[] {
    const key = this.getCellKey(x, y);
    const cell = this.cells.get(key);
    if (!cell) return [];

    const results: T[] = [];
    for (const item of cell) {
      const bounds = this.itemBounds.get(item);
      if (bounds && this.pointInRect(x, y, bounds)) {
        results.push(item);
      }
    }
    return results;
  }

  /**
   * Query items that intersect with a rect
   */
  queryRect(rect: Rect): T[] {
    const cellKeys = this.getCellsForRect(rect);
    const candidates = new Set<T>();

    for (const key of cellKeys) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const item of cell) {
          candidates.add(item);
        }
      }
    }

    const results: T[] = [];
    for (const item of candidates) {
      const bounds = this.itemBounds.get(item);
      if (bounds && this.rectsIntersect(rect, bounds)) {
        results.push(item);
      }
    }
    return results;
  }

  /**
   * Query items near a point within radius
   */
  queryRadius(x: number, y: number, radius: number): T[] {
    const rect: Rect = {
      x: x - radius,
      y: y - radius,
      width: radius * 2,
      height: radius * 2,
    };

    const candidates = this.queryRect(rect);
    const radiusSq = radius * radius;

    return candidates.filter(item => {
      const bounds = this.itemBounds.get(item);
      if (!bounds) return false;
      
      // Distance to nearest point on rect
      const nearestX = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width));
      const nearestY = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height));
      const dx = x - nearestX;
      const dy = y - nearestY;
      return dx * dx + dy * dy <= radiusSq;
    });
  }

  /**
   * Find the topmost item at a point (by insertion order, last = top)
   */
  queryTopAt(x: number, y: number): T | null {
    const hits = this.queryPoint(x, y);
    return hits.length > 0 ? hits[hits.length - 1] : null;
  }

  /**
   * Get bounds for an item
   */
  getBounds(item: T): Rect | undefined {
    return this.itemBounds.get(item);
  }

  /**
   * Check if an item exists
   */
  has(item: T): boolean {
    return this.itemBounds.has(item);
  }

  /**
   * Get total item count
   */
  get size(): number {
    return this.itemBounds.size;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.cells.clear();
    this.itemBounds.clear();
    this.itemCells.clear();
  }

  /**
   * Get all items
   */
  items(): T[] {
    return Array.from(this.itemBounds.keys());
  }

  /**
   * Debug: get cell distribution stats
   */
  getStats(): { totalItems: number; totalCells: number; avgItemsPerCell: number } {
    let totalItemsInCells = 0;
    for (const cell of this.cells.values()) {
      totalItemsInCells += cell.size;
    }
    return {
      totalItems: this.itemBounds.size,
      totalCells: this.cells.size,
      avgItemsPerCell: this.cells.size > 0 ? totalItemsInCells / this.cells.size : 0,
    };
  }

  // Helper methods
  private pointInRect(x: number, y: number, rect: Rect): boolean {
    return x >= rect.x && x <= rect.x + rect.width &&
           y >= rect.y && y <= rect.y + rect.height;
  }

  private rectsIntersect(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }
}

/**
 * Factory for creating spatial hashes with different cell sizes
 */
export function createSpatialHash<T>(
  cellSize: number = 100,
  initialItems?: Array<{ id: T; rect: Rect }>
): SpatialHash<T> {
  const hash = new SpatialHash<T>(cellSize);
  if (initialItems) {
    for (const { id, rect } of initialItems) {
      hash.insert(id, rect);
    }
  }
  return hash;
}

/**
 * Optimized spatial hash for windows (uses z-index for topmost queries)
 */
export class WindowSpatialHash<T> extends SpatialHash<T> {
  private zIndexMap: Map<T, number> = new Map();

  insertWithZ(item: T, rect: Rect, zIndex: number): void {
    super.insert(item, rect);
    this.zIndexMap.set(item, zIndex);
  }

  updateZ(item: T, zIndex: number): void {
    this.zIndexMap.set(item, zIndex);
  }

  override remove(item: T): boolean {
    this.zIndexMap.delete(item);
    return super.remove(item);
  }

  /**
   * Query topmost item by z-index
   */
  queryTopByZ(x: number, y: number): T | null {
    const hits = this.queryPoint(x, y);
    if (hits.length === 0) return null;

    let topItem = hits[0];
    let topZ = this.zIndexMap.get(topItem) ?? 0;

    for (let i = 1; i < hits.length; i++) {
      const z = this.zIndexMap.get(hits[i]) ?? 0;
      if (z > topZ) {
        topZ = z;
        topItem = hits[i];
      }
    }
    return topItem;
  }

  override clear(): void {
    super.clear();
    this.zIndexMap.clear();
  }
}
