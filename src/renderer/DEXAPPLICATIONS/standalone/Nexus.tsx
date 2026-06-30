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
import React from 'react';
import TaskManager from '../../pages/TaskManager';

const Nexus: React.FC = () => <TaskManager />;

export default Nexus;
