# DEX IPC Channel Map

Complete map of all IPC channels registered in the DEX main process
and invoked from the renderer process.

Generated during the codebase integrity audit.

---

## Channel Summary

| Category | Handle Count | On Count | Total |
|----------|-------------|----------|-------|
| Window Management | 4 | 0 | 4 |
| Resource Management | 4 | 0 | 4 |
| Settings | 3 | 0 | 3 |
| Actions | 1 | 0 | 1 |
| AI Hub | 18 | 0 | 18 |
| Agent Core | 15 | 0 | 15 |
| Privacy Guard | 22 | 0 | 22 |
| Home Automation | 40 | 0 | 40 |
| Computer Tasks | 45 | 0 | 45 |
| Analytics | 11 | 0 | 11 |
| Activity Feed | 5 | 0 | 5 |
| Activity History | 9 | 0 | 9 |
| App Launcher | 16 | 0 | 16 |
| Audio System | 25 | 0 | 25 |
| Text/Code Editor | 6 | 4 | 10 |
| Video Player | 4 | 2 | 6 |
| Accessibility | 3 | 5 | 8 |
| Adaptive Rendering | 7 | 3 | 10 |
| Automation | 18 | 0 | 18 |
| Scripting | 9 | 0 | 9 |
| Data Management | 12 | 0 | 12 |
| Connection | 13 | 0 | 13 |
| Health/Diagnostics | 8 | 0 | 8 |
| Stability | 1 | 4 | 5 |
| Performance | 0 | 1 | 1 |
| GPU/Thermal | 0 | 5 | 5 |
| Memory/Input | 0 | 4 | 4 |
| Native Core | 8 | 0 | 8 |
| Observability | 6 | 0 | 6 |
| CLI | 2 | 1 | 3 |
| Crash Recovery | 0 | 1 | 1 |
| Security/Auth | 0 | 4 | 4 |
| Game Performance | 0 | 2 | 2 |
| Motion/Rendering | 0 | 4 | 4 |
| IPC Efficiency | 0 | 2 | 2 |
| System Optimization | 0 | 2 | 2 |
| Renderer Logger | 1 | 0 | 1 |
| Unified Systems | 50+ | 0 | 50+ |
| Feature Suite | 38+ | 0 | 38+ |

**Total: 450+ unique channels**

---

## Window Management

| Channel | Type | Location |
|---------|------|----------|
| `window:minimize` | handle | main.ts |
| `window:maximize` | handle | main.ts |
| `window:close` | handle | main.ts |
| `window:hide` | handle | main.ts |

## Resource Management

| Channel | Type | Location |
|---------|------|----------|
| `resource:getSnapshot` | handle | main.ts |
| `resource:getPressure` | handle | main.ts |
| `resource:getThrottleLevel` | handle | main.ts |
| `resource:getBudgets` | handle | main.ts |

## Settings

| Channel | Type | Location |
|---------|------|----------|
| `settings:get` | handle | main.ts |
| `settings:save` | handle | main.ts |
| `settings:apply` | handle | main.ts |

## AI Hub

| Channel | Type | Location |
|---------|------|----------|
| `ai:getStatus` | handle | ai/AIHub.ts |
| `ai:setEnabled` | handle | ai/AIHub.ts |
| `ai:getProviders` | handle | ai/AIHub.ts |
| `ai:addProvider` | handle | ai/AIHub.ts |
| `ai:updateProvider` | handle | ai/AIHub.ts |
| `ai:removeProvider` | handle | ai/AIHub.ts |
| `ai:setActiveProvider` | handle | ai/AIHub.ts |
| `ai:testProvider` | handle | ai/AIHub.ts |
| `ai:send` | handle | ai/AIHub.ts |
| `ai:sendStream` | handle | ai/AIHub.ts |
| `ai:cancelStream` | handle | ai/AIHub.ts |
| `ai:getUsageLogs` | handle | ai/AIHub.ts |
| `ai:clearUsageLogs` | handle | ai/AIHub.ts |
| `ai:getUsageStats` | handle | ai/AIHub.ts |
| `ai:wipeAllKeys` | handle | ai/AIHub.ts |
| `ai:getContextSuggestions` | handle | ai/AIHub.ts |

## Agent Core

| Channel | Type | Location |
|---------|------|----------|
| `agent:send-message` | handle | agent/AgentCore.ts |
| `agent:get-conversation` | handle | agent/AgentCore.ts |
| `agent:get-conversations` | handle | agent/AgentCore.ts |
| `agent:clear-conversation` | handle | agent/AgentCore.ts |
| `agent:new-conversation` | handle | agent/AgentCore.ts |
| `agent:get-tools` | handle | agent/AgentCore.ts |
| `agent:execute-tool` | handle | agent/AgentCore.ts |
| `agent:get-config` | handle | agent/AgentCore.ts |
| `agent:update-config` | handle | agent/AgentCore.ts |
| `agent:get-stats` | handle | agent/AgentCore.ts |
| `agent:get-memory` | handle | agent/AgentCore.ts |
| `agent:learn-preference` | handle | agent/AgentCore.ts |
| `agent:get-suggestions` | handle | agent/AgentCore.ts |
| `agent:export-data` | handle | agent/AgentCore.ts |
| `agent:clear-all-data` | handle | agent/AgentCore.ts |

## Native Core (Rust Bridge)

| Channel | Type | Location |
|---------|------|----------|
| `native-core:available` | handle | main.ts |
| `native-core:physics-create` | handle | main.ts |
| `native-core:physics-set-target` | handle | main.ts |
| `native-core:physics-release` | handle | main.ts |
| `native-core:search-fuzzy` | handle | main.ts |
| `native-core:memory-pressure` | handle | main.ts |
| `native-core:platform-info` | handle | main.ts |
| `native-core:scheduler-cores` | handle | main.ts |

## Renderer Logger

| Channel | Type | Location |
|---------|------|----------|
| `log:renderer` | handle | main.ts |

## Stability and Performance (on listeners)

| Channel | Type | Location |
|---------|------|----------|
| `stability:idle` | on | SessionStabilityManager.ts |
| `stability:frameTime` | on | SessionStabilityManager.ts |
| `stability:latency` | on | SessionStabilityManager.ts |
| `stability:ping` | handle | SessionStabilityManager.ts |
| `enforce:metrics` | on | PerformanceEnforcer.ts |
| `gpu:renderStart` | on | ResourceGovernor.ts |
| `gpu:renderEnd` | on | ResourceGovernor.ts |
| `gpu:activityLevel` | on | ResourceGovernor.ts |
| `thermal:gpu-active` | on | ThermalPowerManager.ts |
| `thermal:report-cpu` | on | ThermalPowerManager.ts |
| `memory:report` | on | MemoryBudgetService.ts |
| `memory:recordActivity` | on | MemoryBudgetService.ts |
| `input:event` | on | InputLatencyController.ts |
| `input:latency` | on | InputLatencyController.ts |
| `motion:animationStart` | on | MotionController.ts |
| `motion:animationEnd` | on | MotionController.ts |
| `motion:prefersReduced` | on | MotionController.ts |
| `ipc-perf:ping` | on | IPCEfficiencyManager.ts |
| `ipc-perf:roundtrip` | on | IPCEfficiencyManager.ts |
| `user:activity` | on | SystemOptimizationWiring.ts |
| `optimization:reportGPU` | on | SystemOptimizationWiring.ts |

## Data Management

| Channel | Type | Location |
|---------|------|----------|
| `data:export` | handle | DataController.ts |
| `data:import` | handle | DataController.ts |
| `data:reset` | handle | DataController.ts |
| `data:stats` | handle | DataController.ts |
| `data:exportCollection` | handle | DataController.ts |
| `data:exportToFolder` | handle | DataController.ts |
| `data:importFromFolder` | handle | DataController.ts |
| `data:createBackup` | handle | DataController.ts |
| `data:listBackups` | handle | DataController.ts |
| `data:restoreBackup` | handle | DataController.ts |
| `data:openFolder` | handle | DataController.ts |
| `data:getLocations` | handle | DataController.ts |

## Connection Management

| Channel | Type | Location |
|---------|------|----------|
| `connection:getNetworkInfo` | handle | ConnectionController.ts |
| `connection:getPermissions` | handle | ConnectionController.ts |
| `connection:setPermissions` | handle | ConnectionController.ts |
| `connection:setNetworkingEnabled` | handle | ConnectionController.ts |
| `connection:getChannels` | handle | ConnectionController.ts |
| `connection:openChannel` | handle | ConnectionController.ts |
| `connection:closeChannel` | handle | ConnectionController.ts |
| `connection:isTypeAllowed` | handle | ConnectionController.ts |
| `connection:addTrustedDevice` | handle | ConnectionController.ts |
| `connection:removeTrustedDevice` | handle | ConnectionController.ts |
| `connection:isDeviceTrusted` | handle | ConnectionController.ts |
| `connection:testConnection` | handle | ConnectionController.ts |
| `connection:getLocalIPs` | handle | ConnectionController.ts |

---

## Security Notes

- All IPC channels are exposed through the preload bridge context isolation
- Dynamic channel invocations are validated against an allowlist of prefixes
- The IPCValidator runs input sanitization on all incoming IPC payloads
- Rate limiting is applied via the IPCRateLimiter service
- Path traversal and injection patterns are blocked in channel names

## Channel Naming Convention

Channels use colon-separated namespaces: `namespace:action`

Examples:
- `ai:send` - AI hub send message
- `home:get-devices` - Home automation device listing
- `native-core:search-fuzzy` - Rust native fuzzy search
- `stability:ping` - Stability heartbeat check
