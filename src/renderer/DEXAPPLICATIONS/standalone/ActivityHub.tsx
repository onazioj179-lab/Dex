// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Activity: Kanban boards, the live activity feed and Learn in one app.
import React, { lazy } from 'react';
import { TabbedAppHost } from './TabbedAppHost';

const KanbanApp = lazy(() => import('./KanbanApp'));
const LiveActivityBrowser = lazy(() => import('./LiveActivityBrowser'));
const Learn = lazy(() => import('./Learn'));

const ActivityHub: React.FC = () => (
  <TabbedAppHost appId="activity" label="Activity" tabs={[
    { id: 'board', label: 'Board', render: () => <KanbanApp /> },
    { id: 'live', label: 'Live', render: () => <LiveActivityBrowser /> },
    { id: 'learn', label: 'Learn', render: () => <Learn /> },
  ]} />
);

export default ActivityHub;
