// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Workflow Controller
// Phase 20: IPC handlers for workflow management and execution
// ===========================================================================

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { Logger } from '../utils/Logger';
import { 
  workflowEngine, 
  ExecutionOptions 
} from '../core/WorkflowEngine';
import { 
  Workflow, 
  WorkflowBuilder,
  WorkflowGraph,
  PRESET_WORKFLOWS 
} from '../core/WorkflowGraph';
import { taskQueue, TaskChainBuilder } from '../core/TaskQueue';
import { documentCreator, DocumentRequest, DocumentTemplate } from '../core/DocumentCreator';
import { externalConnectors, ConnectorConfig } from '../core/ExternalConnectors';
import { IPCCrypto } from '../security/IPCCrypto';

const log = new Logger();
import { browserBridge } from '../core/BrowserBridge';

// ===========================================================================
// WORKFLOW CONTROLLER
// ===========================================================================

class WorkflowControllerClass {
  private initialized = false;

  /**
   * Initialize IPC handlers
   */
  initialize(): void {
    if (this.initialized) return;

    // -------------------------------------------------------------------------
    // WORKFLOW MANAGEMENT
    // -------------------------------------------------------------------------

    ipcMain.handle('workflow:getAll', async () => {
      return workflowEngine.getWorkflows();
    });

    ipcMain.handle('workflow:get', async (_, workflowId: string) => {
      return workflowEngine.getWorkflow(workflowId);
    });

    ipcMain.handle('workflow:save', async (_, workflow: Workflow) => {
      workflowEngine.saveWorkflow(workflow);
      return true;
    });

    ipcMain.handle('workflow:delete', async (_, workflowId: string) => {
      return workflowEngine.deleteWorkflow(workflowId);
    });

    ipcMain.handle('workflow:duplicate', async (_, workflowId: string, newName?: string) => {
      return workflowEngine.duplicateWorkflow(workflowId, newName);
    });

    ipcMain.handle('workflow:validate', async (_, workflow: Workflow) => {
      const graph = new WorkflowGraph(workflow);
      return graph.validate();
    });

    ipcMain.handle('workflow:getPresets', async () => {
      return {
        organizeAndDocument: PRESET_WORKFLOWS.organizeAndDocument(),
        batchRename: PRESET_WORKFLOWS.batchRename(),
        downloadAndArchive: PRESET_WORKFLOWS.downloadAndArchive(),
      };
    });

    // -------------------------------------------------------------------------
    // WORKFLOW EXECUTION
    // -------------------------------------------------------------------------

    ipcMain.handle('workflow:execute', async (event, workflowId: string, inputs: Record<string, any>, options?: ExecutionOptions) => {
      const workflow = workflowEngine.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Safety gate: require explicit opt-in for non-dry-run execution
      if (!options?.dryRun) {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
          const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Execute', 'Preview Only', 'Cancel'],
            defaultId: 1,
            cancelId: 2,
            title: 'Workflow Execution',
            message: `Execute workflow "${workflow.name}"?`,
            detail: `This workflow has ${workflow.nodes?.length || 0} steps. Choose "Preview Only" to see what will happen without making changes.`,
          });
          if (response === 2) return { cancelled: true };
          if (response === 1) return workflowEngine.execute(workflow, inputs, { ...options, dryRun: true });
        }
      }

      return workflowEngine.execute(workflow, inputs, options);
    });

    ipcMain.handle('workflow:executeNew', async (_, workflow: Workflow, inputs: Record<string, any>, options?: ExecutionOptions) => {
      return workflowEngine.execute(workflow, inputs, options);
    });

    ipcMain.handle('workflow:pause', async () => {
      workflowEngine.pause();
      return true;
    });

    ipcMain.handle('workflow:resume', async () => {
      workflowEngine.resume();
      return true;
    });

    ipcMain.handle('workflow:abort', async () => {
      workflowEngine.abort();
      return true;
    });

    ipcMain.handle('workflow:getActive', async () => {
      return workflowEngine.getActiveExecution();
    });

    ipcMain.handle('workflow:getHistory', async () => {
      return workflowEngine.getExecutionHistory();
    });

    ipcMain.handle('workflow:getExecution', async (_, executionId: string) => {
      return workflowEngine.getExecution(executionId);
    });

    ipcMain.handle('workflow:runScript', async (_, script: string) => {
      if (!script || typeof script !== 'string') {
        return { output: '', exitCode: 1, error: 'No script provided' };
      }
      // Security: Block dangerous commands
      const blocked = /rm\s+-rf|del\s+\/[sfq]|format\s+[a-z]:|mkfs|dd\s+if=|shutdown|reboot|reg\s+delete|net\s+user|netsh|powershell\s+-e|iex\s*\(|invoke-expression|wget|curl.*\|.*sh|chmod\s+[0-7]{3,4}\s+\/|chown.*\/|sudo/i;
      if (blocked.test(script)) {
        return { output: '', exitCode: 1, error: 'Blocked: script contains a restricted command' };
      }
      // Security: Limit script length to prevent abuse
      if (script.length > 2000) {
        return { output: '', exitCode: 1, error: 'Script too long (max 2000 chars)' };
      }
      return new Promise<{ output: string; exitCode: number; error?: string }>((resolve) => {
        const shell = process.platform === 'win32' ? 'powershell' : '/bin/sh';
        const args = process.platform === 'win32' ? ['-NoProfile', '-NoLogo', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script] : ['-c', script];
        const { execFile } = require('child_process');
        execFile(shell, args, { timeout: 30000, maxBuffer: 1024 * 512, windowsHide: true }, (err: any, stdout: string, stderr: string) => {
          if (err) {
            resolve({ output: stderr || err.message, exitCode: err.code || 1, error: err.message });
          } else {
            resolve({ output: stdout, exitCode: 0 });
          }
        });
      });
    });

    // -------------------------------------------------------------------------
    // TASK QUEUE
    // -------------------------------------------------------------------------

    ipcMain.handle('tasks:add', async (_, task: { type: string; name: string; params: Record<string, any>; priority?: string }) => {
      return taskQueue.addTask({
        type: task.type,
        name: task.name,
        params: task.params,
        priority: (task.priority as 'low' | 'normal' | 'high') ?? 'normal',
      });
    });

    ipcMain.handle('tasks:remove', async (_, taskId: string) => {
      return taskQueue.removeTask(taskId);
    });

    ipcMain.handle('tasks:reorder', async (_, taskId: string, newIndex: number) => {
      return taskQueue.reorderTask(taskId, newIndex);
    });

    ipcMain.handle('tasks:getAll', async () => {
      return taskQueue.getTasks();
    });

    ipcMain.handle('tasks:getStatus', async () => {
      return taskQueue.getStatus();
    });

    ipcMain.handle('tasks:start', async () => {
      await taskQueue.start();
      return true;
    });

    ipcMain.handle('tasks:pause', async () => {
      taskQueue.pause();
      return true;
    });

    ipcMain.handle('tasks:resume', async () => {
      await taskQueue.resume();
      return true;
    });

    ipcMain.handle('tasks:stop', async () => {
      taskQueue.stop();
      return true;
    });

    ipcMain.handle('tasks:cancelCurrent', async () => {
      return taskQueue.cancelCurrent();
    });

    ipcMain.handle('tasks:clearCompleted', async () => {
      return taskQueue.clearCompleted();
    });

    ipcMain.handle('tasks:getTypes', async () => {
      return taskQueue.getAvailableTypes();
    });

    // -------------------------------------------------------------------------
    // DOCUMENT CREATION
    // -------------------------------------------------------------------------

    ipcMain.handle('documents:getTemplates', async () => {
      return documentCreator.getTemplates();
    });

    ipcMain.handle('documents:getTemplate', async (_, templateId: string) => {
      return documentCreator.getTemplate(templateId);
    });

    ipcMain.handle('documents:addTemplate', async (_, template: Omit<DocumentTemplate, 'id' | 'createdAt'>) => {
      return documentCreator.addTemplate(template);
    });

    ipcMain.handle('documents:removeTemplate', async (_, templateId: string) => {
      return documentCreator.removeTemplate(templateId);
    });

    ipcMain.handle('documents:create', async (_, request: DocumentRequest) => {
      return documentCreator.createDocument(request);
    });

    ipcMain.handle('documents:preview', async (_, request: DocumentRequest) => {
      return documentCreator.previewDocument(request);
    });

    ipcMain.handle('documents:getHistory', async () => {
      return documentCreator.getHistory();
    });

    ipcMain.handle('documents:selectOutputDir', async () => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) return null;

      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select output directory',
      });

      return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0];
    });

    // -------------------------------------------------------------------------
    // EXTERNAL CONNECTORS
    // -------------------------------------------------------------------------

    ipcMain.handle('connectors:add', async (_, config: Omit<ConnectorConfig, 'id' | 'createdAt'>) => {
      return externalConnectors.addConnector(config);
    });

    ipcMain.handle('connectors:addWithDialog', async () => {
      const window = BrowserWindow.getFocusedWindow();
      if (!window) return null;

      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Select external folder to connect',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return externalConnectors.addConnector({
        name: result.filePaths[0].split(/[\\/]/).pop() ?? 'External',
        type: 'local-folder',
        path: result.filePaths[0],
        accessLevel: 'read-only',
        enabled: true,
      });
    });

    ipcMain.handle('connectors:remove', async (_, connectorId: string) => {
      return externalConnectors.removeConnector(connectorId);
    });

    ipcMain.handle('connectors:update', async (_, connectorId: string, updates: Partial<ConnectorConfig>) => {
      return externalConnectors.updateConnector(connectorId, updates);
    });

    ipcMain.handle('connectors:getAll', async () => {
      return externalConnectors.getConnectors();
    });

    ipcMain.handle('connectors:get', async (_, connectorId: string) => {
      return externalConnectors.getConnectorInfo(connectorId);
    });

    ipcMain.handle('connectors:listFiles', async (_, connectorId: string, subPath?: string) => {
      return externalConnectors.listFiles(connectorId, subPath);
    });

    ipcMain.handle('connectors:readFile', async (_, connectorId: string, relativePath: string) => {
      const content = externalConnectors.readFile(connectorId, relativePath);
      return content?.toString('base64') ?? null;
    });

    ipcMain.handle('connectors:writeFile', async (_, connectorId: string, relativePath: string, content: string) => {
      return externalConnectors.writeFile(connectorId, relativePath, Buffer.from(content, 'base64'));
    });

    ipcMain.handle('connectors:copyToLocal', async (_, connectorId: string, relativePath: string, localPath: string) => {
      return externalConnectors.copyToLocal(connectorId, relativePath, localPath);
    });

    ipcMain.handle('connectors:getLog', async () => {
      return externalConnectors.getOperationLog();
    });

    // -------------------------------------------------------------------------
    // BROWSER BRIDGE
    // -------------------------------------------------------------------------

    ipcMain.handle('browser:startServer', async () => {
      return browserBridge.startServer();
    });

    ipcMain.handle('browser:stopServer', async () => {
      browserBridge.stopServer();
      return true;
    });

    ipcMain.handle('browser:startPairing', async () => {
      return browserBridge.startPairing();
    });

    ipcMain.handle('browser:cancelPairing', async () => {
      browserBridge.cancelPairing();
      return true;
    });

    ipcMain.handle('browser:disconnect', async () => {
      browserBridge.disconnect();
      return true;
    });

    ipcMain.handle('browser:getStatus', async () => {
      return browserBridge.getStatus();
    });

    ipcMain.handle('browser:navigate', async (_, url: string) => {
      return browserBridge.navigate(url);
    });

    ipcMain.handle('browser:readPage', async () => {
      return browserBridge.readPage();
    });

    ipcMain.handle('browser:fillField', async (_, selector: string, sealed: any) => {
      const value = IPCCrypto.open(sealed);
      return browserBridge.fillField(selector, value);
    });

    ipcMain.handle('browser:click', async (_, selector: string) => {
      return browserBridge.click(selector);
    });

    ipcMain.handle('browser:download', async (_, url: string, filename?: string) => {
      return browserBridge.download(url, filename);
    });

    ipcMain.handle('browser:getPendingActions', async () => {
      return browserBridge.getPendingActions();
    });

    ipcMain.handle('browser:getActionHistory', async () => {
      return browserBridge.getActionHistory();
    });

    ipcMain.handle('browser:cancelAction', async (_, actionId: string) => {
      return browserBridge.cancelAction(actionId);
    });

    // -------------------------------------------------------------------------
    // WORKFLOW BUILDER HELPERS
    // -------------------------------------------------------------------------

    ipcMain.handle('workflow:createNew', async (_, name: string, description?: string) => {
      const builder = new WorkflowBuilder(name, description);
      return builder.build();
    });

    this.initialized = true;
    log.info('[WorkflowController] Initialized');
  }

  /**
   * Setup event forwarding to renderer
   */
  setupEventForwarding(window: BrowserWindow): void {
    // Forward workflow events
    workflowEngine.on('executionStarted', (execution) => {
      window.webContents.send('workflow:executionStarted', execution);
    });

    workflowEngine.on('executionCompleted', (execution) => {
      window.webContents.send('workflow:executionCompleted', execution);
    });

    workflowEngine.on('executionPaused', (execution) => {
      window.webContents.send('workflow:executionPaused', execution);
    });

    workflowEngine.on('executionResumed', (execution) => {
      window.webContents.send('workflow:executionResumed', execution);
    });

    workflowEngine.on('executionAborted', (execution) => {
      window.webContents.send('workflow:executionAborted', execution);
    });

    workflowEngine.on('nodeStarted', (data) => {
      window.webContents.send('workflow:nodeStarted', data);
    });

    workflowEngine.on('nodeCompleted', (data) => {
      window.webContents.send('workflow:nodeCompleted', data);
    });

    workflowEngine.on('nodeProgress', (data) => {
      window.webContents.send('workflow:nodeProgress', data);
    });

    workflowEngine.on('confirmationRequired', (data) => {
      window.webContents.send('workflow:confirmationRequired', data);
    });

    // Forward task queue events
    taskQueue.on('taskAdded', (task) => {
      window.webContents.send('tasks:added', task);
    });

    taskQueue.on('taskStarted', (task) => {
      window.webContents.send('tasks:started', task);
    });

    taskQueue.on('taskCompleted', (task) => {
      window.webContents.send('tasks:completed', task);
    });

    taskQueue.on('taskFailed', (task) => {
      window.webContents.send('tasks:failed', task);
    });

    taskQueue.on('taskProgress', (task) => {
      window.webContents.send('tasks:progress', task);
    });

    // Forward browser bridge events
    browserBridge.on('connected', (connection) => {
      window.webContents.send('browser:connected', connection);
    });

    browserBridge.on('disconnected', () => {
      window.webContents.send('browser:disconnected');
    });

    browserBridge.on('pairingStarted', (pairing) => {
      window.webContents.send('browser:pairingStarted', pairing);
    });

    browserBridge.on('actionCompleted', (action) => {
      window.webContents.send('browser:actionCompleted', action);
    });

    log.info('[WorkflowController] Event forwarding setup complete');
  }
}

// Singleton export
export const workflowController = new WorkflowControllerClass();
