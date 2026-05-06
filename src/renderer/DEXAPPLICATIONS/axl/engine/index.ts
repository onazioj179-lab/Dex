// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
export { AXLRenderer } from './Renderer';
export type { RenderState } from './Renderer';
export { ConstraintSolver } from './ConstraintSolver';
export type { SolverResult, SolverOptions } from './ConstraintSolver';
export { InputHandler } from './InputHandler';
export type { InputCallbacks, InputState } from './InputHandler';
export { runSimulation } from './Simulation';
export type { SimulationType, SimulationConfig, PartStressResult } from './Simulation';
export { buildFeatureChain, featureToMesh, extrude, revolve, booleanOp, extractProfile,
  createBoxMesh, createCylinderMesh, createSphereMesh, computeVolume, computeSurfaceArea } from './SolidKernel';
export type { SolidMesh, ProfilePoint } from './SolidKernel';
export { createModifier, getModifierName, getModifierIcon, addModifier, removeModifier,
  moveModifier, updateModifier, duplicateModifier, toggleModifier, collapseModifier,
  applyModifierStack, MODIFIER_CATEGORIES } from './Modifiers';
