// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus — merged with Task Manager.
 *
 * Nexus is now the full Task Manager surface, rendered with the premium
 * "Overview" concept (headline cards + radial system-load gauge, asset tiles,
 * the smooth live load chart, and the right-hand focus card with running-app
 * avatars). Everything the Task Manager does — live metrics, workspaces,
 * workflows, open apps, and the virtualized system-process table — is reached
 * here too. The single source of truth lives in `pages/TaskManager`; Nexus
 * renders it so both app entries stay in lockstep.
 */
import React, { lazy } from 'react';
import TaskManager from '../../pages/TaskManager';
import { TabbedAppHost } from './TabbedAppHost';

// UKI lives in Nexus (owner, 2026-11-26): the assistant beside the system it
// can see and act on, instead of a separate app.
const Uki = lazy(() => import('./Uki'));

const Nexus: React.FC = () => (
  <TabbedAppHost appId="nexus" label="Nexus" tabs={[
    { id: 'uki', label: 'UKI', render: () => <Uki /> },
    { id: 'system', label: 'System', render: () => <TaskManager /> },
  ]} />
);

export default Nexus;
