// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Cross-App Intelligence
// Semantic understanding of app capabilities, cross-app workflows, tool access
// ===========================================================================

import { BrowserWindow } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';
import { successResponse, errorResponse } from '../dialog/UkiResponses';

// ---------------------------------------------------------------------------
// App Capability Registry
// ---------------------------------------------------------------------------

export interface AppTool {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  action: string;
  params?: string[];
}

export interface AppCapabilities {
  id: string;
  name: string;
  description: string;
  category: 'creative' | 'productivity' | 'utility' | 'system';
  tools: AppTool[];
  canReceive: string[];   // File types this app can open
  canProduce: string[];   // File types this app can export
  integrates: string[];   // Other apps this can work with
}

// Comprehensive app capability registry
const APP_REGISTRY: Record<string, AppCapabilities> = {
  axl: {
    id: 'axl',
    name: 'AXL',
    description: '3D CAD and modeling application with Blender-like features',
    category: 'creative',
    tools: [
      { id: 'axl:extrude', name: 'Extrude', description: 'Extrude faces along normals', keywords: ['extrude', 'push', 'extend', 'grow'], action: 'extrude', params: ['distance', 'direction'] },
      { id: 'axl:bevel', name: 'Bevel', description: 'Bevel edges with segments', keywords: ['bevel', 'round', 'chamfer', 'smooth edges'], action: 'bevel', params: ['width', 'segments'] },
      { id: 'axl:mirror', name: 'Mirror', description: 'Mirror geometry across axis', keywords: ['mirror', 'flip', 'reflect', 'symmetry'], action: 'mirror', params: ['axis'] },
      { id: 'axl:subdiv', name: 'Subdivision', description: 'Subdivide surface for smoothing', keywords: ['subdivide', 'smooth', 'catmull', 'subdivision'], action: 'subdivision', params: ['level'] },
      { id: 'axl:boolean', name: 'Boolean', description: 'Union, subtract, or intersect meshes', keywords: ['boolean', 'union', 'subtract', 'difference', 'intersect', 'cut'], action: 'boolean', params: ['operation', 'target'] },
      { id: 'axl:array', name: 'Array', description: 'Create copies in pattern', keywords: ['array', 'clone', 'duplicate', 'pattern', 'repeat'], action: 'array', params: ['count', 'offset'] },
      { id: 'axl:solidify', name: 'Solidify', description: 'Add thickness to surfaces', keywords: ['solidify', 'thickness', 'shell', 'offset'], action: 'solidify', params: ['thickness'] },
      { id: 'axl:decimate', name: 'Decimate', description: 'Reduce polygon count', keywords: ['decimate', 'reduce', 'simplify', 'optimize'], action: 'decimate', params: ['ratio'] },
      { id: 'axl:lattice', name: 'Lattice', description: 'Deform with lattice cage', keywords: ['lattice', 'deform', 'warp', 'cage'], action: 'lattice', params: ['resolution'] },
      { id: 'axl:sculpt', name: 'Sculpt Mode', description: 'Enter sculpting mode', keywords: ['sculpt', 'sculpting', 'clay', 'organic'], action: 'sculpt-mode' },
      { id: 'axl:render', name: 'Render', description: 'Render scene', keywords: ['render', 'generate', 'output', 'image'], action: 'render', params: ['format', 'quality'] },
      { id: 'axl:export', name: 'Export', description: 'Export 3D model', keywords: ['export', 'save as', 'output'], action: 'export', params: ['format'] },
    ],
    canReceive: ['.obj', '.fbx', '.gltf', '.glb', '.stl', '.3ds', '.dae'],
    canProduce: ['.obj', '.fbx', '.gltf', '.glb', '.stl', '.png', '.jpg'],
    integrates: ['prism', 'flux', 'forge'],
  },

  imosion: {
    id: 'imosion',
    name: 'Imosion',
    description: 'Digital audio workstation for music production',
    category: 'creative',
    tools: [
      { id: 'imosion:record', name: 'Record', description: 'Record audio', keywords: ['record', 'capture', 'mic', 'input'], action: 'record' },
      { id: 'imosion:add-track', name: 'Add Track', description: 'Add new track', keywords: ['add track', 'new track', 'create track', 'insert track'], action: 'add-track', params: ['type'] },
      { id: 'imosion:eq', name: 'EQ', description: 'Add equalizer', keywords: ['eq', 'equalizer', 'equalize', 'frequency'], action: 'add-plugin', params: ['type:eq'] },
      { id: 'imosion:compress', name: 'Compressor', description: 'Add dynamics compressor', keywords: ['compressor', 'compress', 'dynamics', 'limiter'], action: 'add-plugin', params: ['type:compressor'] },
      { id: 'imosion:reverb', name: 'Reverb', description: 'Add reverb effect', keywords: ['reverb', 'reverb', 'room', 'hall', 'space'], action: 'add-plugin', params: ['type:reverb'] },
      { id: 'imosion:delay', name: 'Delay', description: 'Add delay effect', keywords: ['delay', 'echo', 'repeat'], action: 'add-plugin', params: ['type:delay'] },
      { id: 'imosion:export', name: 'Export', description: 'Export audio/project', keywords: ['export', 'bounce', 'render', 'mixdown'], action: 'export', params: ['format'] },
      { id: 'imosion:tempo', name: 'Set Tempo', description: 'Set project tempo', keywords: ['tempo', 'bpm', 'speed', 'beats per minute'], action: 'set-tempo', params: ['bpm'] },
      { id: 'imosion:quantize', name: 'Quantize', description: 'Quantize to grid', keywords: ['quantize', 'snap', 'align', 'grid'], action: 'quantize' },
      { id: 'imosion:normalize', name: 'Normalize', description: 'Normalize audio levels', keywords: ['normalize', 'level', 'loudness'], action: 'normalize' },
    ],
    canReceive: ['.wav', '.mp3', '.aiff', '.flac', '.ogg', '.m4a', '.mid', '.midi'],
    canProduce: ['.wav', '.mp3', '.aiff', '.flac', '.ogg', '.m4a'],
    integrates: ['videoeditor', 'forge'],
  },

  videoeditor: {
    id: 'videoeditor',
    name: 'VINX',
    description: 'Professional video editing and post-production',
    category: 'creative',
    tools: [
      { id: 'vinx:cut', name: 'Cut', description: 'Cut clip at playhead', keywords: ['cut', 'split', 'slice', 'razor'], action: 'cut' },
      { id: 'vinx:trim', name: 'Trim', description: 'Trim clip edges', keywords: ['trim', 'shorten', 'crop'], action: 'trim' },
      { id: 'vinx:transition', name: 'Add Transition', description: 'Add transition between clips', keywords: ['transition', 'fade', 'dissolve', 'wipe'], action: 'add-transition', params: ['type'] },
      { id: 'vinx:color', name: 'Color Correct', description: 'Apply color correction', keywords: ['color', 'grade', 'correction', 'lut'], action: 'color-correct' },
      { id: 'vinx:audio-level', name: 'Audio Levels', description: 'Adjust audio levels', keywords: ['audio', 'volume', 'levels', 'gain'], action: 'audio-levels' },
      { id: 'vinx:stabilize', name: 'Stabilize', description: 'Stabilize shaky footage', keywords: ['stabilize', 'steady', 'smooth'], action: 'stabilize' },
      { id: 'vinx:export', name: 'Export', description: 'Export video', keywords: ['export', 'render', 'output'], action: 'export', params: ['format', 'codec'] },
      { id: 'vinx:speed', name: 'Speed', description: 'Change playback speed', keywords: ['speed', 'slow motion', 'fast', 'ramp'], action: 'speed', params: ['factor'] },
      { id: 'vinx:text', name: 'Add Text', description: 'Add text overlay', keywords: ['text', 'title', 'caption', 'subtitle'], action: 'add-text', params: ['content'] },
    ],
    canReceive: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.prores', '.mxf'],
    canProduce: ['.mp4', '.mov', '.avi', '.webm', '.gif'],
    integrates: ['imosion', 'prism', 'flux', 'forge'],
  },

  prism: {
    id: 'prism',
    name: 'PRISM',
    description: 'Image editing and digital painting',
    category: 'creative',
    tools: [
      { id: 'prism:brush', name: 'Brush', description: 'Paint with brush tool', keywords: ['brush', 'paint', 'draw'], action: 'select-brush' },
      { id: 'prism:crop', name: 'Crop', description: 'Crop image', keywords: ['crop', 'trim', 'cut'], action: 'crop' },
      { id: 'prism:resize', name: 'Resize', description: 'Resize image', keywords: ['resize', 'scale', 'dimensions'], action: 'resize', params: ['width', 'height'] },
      { id: 'prism:filter', name: 'Apply Filter', description: 'Apply image filter', keywords: ['filter', 'effect', 'blur', 'sharpen'], action: 'apply-filter', params: ['filter'] },
      { id: 'prism:adjust', name: 'Adjustments', description: 'Adjust brightness/contrast', keywords: ['adjust', 'brightness', 'contrast', 'saturation'], action: 'adjustments' },
      { id: 'prism:layer', name: 'Add Layer', description: 'Add new layer', keywords: ['layer', 'new layer', 'add layer'], action: 'add-layer' },
      { id: 'prism:mask', name: 'Create Mask', description: 'Create layer mask', keywords: ['mask', 'masking', 'hide', 'reveal'], action: 'create-mask' },
      { id: 'prism:export', name: 'Export', description: 'Export image', keywords: ['export', 'save', 'output'], action: 'export', params: ['format'] },
    ],
    canReceive: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.psd', '.tiff', '.bmp', '.raw'],
    canProduce: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.psd', '.tiff'],
    integrates: ['videoeditor', 'flux', 'axl'],
  },

  flux: {
    id: 'flux',
    name: 'FLUX',
    description: 'Motion graphics and compositing',
    category: 'creative',
    tools: [
      { id: 'flux:keyframe', name: 'Keyframe', description: 'Add keyframe', keywords: ['keyframe', 'animate', 'key'], action: 'add-keyframe' },
      { id: 'flux:effect', name: 'Add Effect', description: 'Add visual effect', keywords: ['effect', 'vfx', 'visual'], action: 'add-effect', params: ['effect'] },
      { id: 'flux:mask', name: 'Create Mask', description: 'Create animated mask', keywords: ['mask', 'rotoscope', 'matte'], action: 'create-mask' },
      { id: 'flux:track', name: 'Motion Track', description: 'Track motion in footage', keywords: ['track', 'motion tracking', 'stabilize'], action: 'motion-track' },
      { id: 'flux:render', name: 'Render', description: 'Render composition', keywords: ['render', 'export', 'output'], action: 'render', params: ['format'] },
      { id: 'flux:precomp', name: 'Pre-compose', description: 'Pre-compose layers', keywords: ['precomp', 'nest', 'pre-compose'], action: 'precompose' },
    ],
    canReceive: ['.aep', '.mp4', '.mov', '.png', '.jpg', '.psd', '.ai'],
    canProduce: ['.mp4', '.mov', '.gif', '.png'],
    integrates: ['videoeditor', 'prism', 'axl'],
  },

  forge: {
    id: 'forge',
    name: 'FORGE',
    description: 'Media encoder and format converter',
    category: 'creative',
    tools: [
      { id: 'forge:convert', name: 'Convert', description: 'Convert media format', keywords: ['convert', 'transcode', 'encode'], action: 'convert', params: ['format', 'codec'] },
      { id: 'forge:batch', name: 'Batch Process', description: 'Process multiple files', keywords: ['batch', 'multiple', 'bulk'], action: 'batch' },
      { id: 'forge:compress', name: 'Compress', description: 'Compress media file', keywords: ['compress', 'reduce', 'smaller'], action: 'compress', params: ['quality'] },
      { id: 'forge:queue', name: 'Queue', description: 'Add to render queue', keywords: ['queue', 'add', 'schedule'], action: 'queue' },
    ],
    canReceive: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wav', '.mp3', '.png', '.jpg'],
    canProduce: ['.mp4', '.mov', '.webm', '.gif', '.mp3', '.wav', '.png', '.jpg'],
    integrates: ['videoeditor', 'imosion', 'prism', 'flux'],
  },

  notes: {
    id: 'notes',
    name: 'Notes',
    description: 'Note-taking and documentation',
    category: 'productivity',
    tools: [
      { id: 'notes:new', name: 'New Note', description: 'Create new note', keywords: ['new note', 'create note', 'add note'], action: 'new' },
      { id: 'notes:search', name: 'Search', description: 'Search notes', keywords: ['search', 'find', 'lookup'], action: 'search', params: ['query'] },
      { id: 'notes:tag', name: 'Add Tag', description: 'Tag note', keywords: ['tag', 'label', 'categorize'], action: 'add-tag', params: ['tag'] },
      { id: 'notes:export', name: 'Export', description: 'Export note', keywords: ['export', 'save', 'download'], action: 'export', params: ['format'] },
    ],
    canReceive: ['.txt', '.md', '.rtf'],
    canProduce: ['.txt', '.md', '.pdf', '.html'],
    integrates: ['tasks', 'calendar'],
  },

  tasks: {
    id: 'tasks',
    name: 'Tasks',
    description: 'Task and project management',
    category: 'productivity',
    tools: [
      { id: 'tasks:new', name: 'New Task', description: 'Create new task', keywords: ['new task', 'add task', 'create task', 'todo'], action: 'new' },
      { id: 'tasks:complete', name: 'Complete', description: 'Mark task complete', keywords: ['complete', 'done', 'finish', 'check'], action: 'complete' },
      { id: 'tasks:priority', name: 'Set Priority', description: 'Set task priority', keywords: ['priority', 'urgent', 'important'], action: 'set-priority', params: ['level'] },
      { id: 'tasks:due', name: 'Set Due Date', description: 'Set due date', keywords: ['due', 'deadline', 'date'], action: 'set-due', params: ['date'] },
    ],
    canReceive: [],
    canProduce: ['.json', '.csv'],
    integrates: ['notes', 'calendar', 'workflows'],
  },

  files: {
    id: 'files',
    name: 'Files',
    description: 'File management',
    category: 'utility',
    tools: [
      { id: 'files:open', name: 'Open', description: 'Open file or folder', keywords: ['open', 'show', 'reveal'], action: 'open', params: ['path'] },
      { id: 'files:copy', name: 'Copy', description: 'Copy file', keywords: ['copy', 'duplicate'], action: 'copy' },
      { id: 'files:move', name: 'Move', description: 'Move file', keywords: ['move', 'relocate'], action: 'move', params: ['destination'] },
      { id: 'files:delete', name: 'Delete', description: 'Delete file', keywords: ['delete', 'remove', 'trash'], action: 'delete' },
      { id: 'files:rename', name: 'Rename', description: 'Rename file', keywords: ['rename', 'name'], action: 'rename', params: ['name'] },
      { id: 'files:search', name: 'Search', description: 'Search files', keywords: ['search', 'find', 'locate'], action: 'search', params: ['query'] },
    ],
    canReceive: ['*'],
    canProduce: [],
    integrates: ['*'],
  },

  gallery: {
    id: 'gallery',
    name: 'Gallery',
    description: 'Photo library and viewing',
    category: 'utility',
    tools: [
      { id: 'gallery:import', name: 'Import', description: 'Import photos', keywords: ['import', 'add', 'upload'], action: 'import' },
      { id: 'gallery:album', name: 'Create Album', description: 'Create photo album', keywords: ['album', 'collection', 'folder'], action: 'create-album', params: ['name'] },
      { id: 'gallery:edit', name: 'Edit', description: 'Edit photo', keywords: ['edit', 'adjust', 'enhance'], action: 'edit' },
      { id: 'gallery:share', name: 'Share', description: 'Share photos', keywords: ['share', 'send', 'export'], action: 'share' },
    ],
    canReceive: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.raw'],
    canProduce: ['.png', '.jpg', '.jpeg'],
    integrates: ['prism', 'files'],
  },
};

// ---------------------------------------------------------------------------
// Intent Routing
// ---------------------------------------------------------------------------

interface ToolMatch {
  app: AppCapabilities;
  tool: AppTool;
  confidence: number;
}

function findToolByKeywords(query: string): ToolMatch | null {
  const words = query.toLowerCase().split(/\s+/);
  let bestMatch: ToolMatch | null = null;
  let bestScore = 0;

  for (const [, app] of Object.entries(APP_REGISTRY)) {
    for (const tool of app.tools) {
      let score = 0;
      for (const keyword of tool.keywords) {
        const kw = keyword.toLowerCase();
        if (query.includes(kw)) {
          score += kw.split(/\s+/).length * 10;
        } else {
          for (const word of words) {
            if (kw.includes(word) || word.includes(kw)) {
              score += 5;
            }
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { app, tool, confidence: Math.min(score / 50, 1) };
      }
    }
  }

  return bestMatch;
}

function findAppForFileType(ext: string): AppCapabilities | null {
  for (const [, app] of Object.entries(APP_REGISTRY)) {
    if (app.canReceive.includes(ext) || app.canReceive.includes('*')) {
      return app;
    }
  }
  return null;
}

function suggestWorkflow(sourceApp: string, intent: string): string[] {
  const source = APP_REGISTRY[sourceApp];
  if (!source) return [];
  
  const workflow: string[] = [sourceApp];
  
  // Check integrations
  for (const targetId of source.integrates) {
    const target = APP_REGISTRY[targetId];
    if (target) {
      workflow.push(targetId);
    }
  }
  
  return workflow;
}

// ---------------------------------------------------------------------------
// Cross-App Command Handlers
// ---------------------------------------------------------------------------

export function handle(intent: UkiIntent, win: BrowserWindow): UkiResult {
  switch (intent.action) {
    case 'use-tool': {
      const toolQuery = (intent.entities.tool as string) || intent.raw;
      const match = findToolByKeywords(toolQuery);
      
      if (!match || match.confidence < 0.3) {
        return { success: false, response: errorResponse(`I couldn't find a tool matching "${toolQuery}". Try saying "help tools" to see what I can do.`) };
      }

      win.webContents.send('uki:launchApp', match.app.id);
      win.webContents.send('uki:cross-app', {
        action: 'execute-tool',
        appId: match.app.id,
        toolId: match.tool.id,
        toolAction: match.tool.action,
        params: intent.entities,
      });
      
      return {
        success: true,
        response: successResponse(`Using ${match.tool.name} in ${match.app.name}.`),
        openApp: match.app.id,
      };
    }

    case 'help-build': {
      const project = (intent.entities.project as string) || (intent.entities.what as string) || '';
      return provideBuildGuidance(project, win);
    }

    case 'suggest-app': {
      const task = (intent.entities.task as string) || intent.raw;
      return suggestAppForTask(task, win);
    }

    case 'list-tools': {
      const appId = intent.entities.appId as string;
      return listAppTools(appId, win);
    }

    case 'workflow': {
      const from = intent.entities.from as string;
      const to = intent.entities.to as string;
      return createWorkflow(from, to, win);
    }

    case 'open-with': {
      const file = intent.entities.file as string;
      const ext = file ? '.' + file.split('.').pop()?.toLowerCase() : '';
      const app = findAppForFileType(ext);
      
      if (!app) {
        return { success: false, response: errorResponse(`I don't know which app can open ${ext || 'that'} files.`) };
      }

      win.webContents.send('uki:launchApp', app.id);
      win.webContents.send('uki:cross-app', { action: 'open-file', appId: app.id, file });
      return { success: true, response: successResponse(`Opening ${file} in ${app.name}.`), openApp: app.id };
    }

    case 'capabilities': {
      const appId = intent.entities.appId as string;
      return describeCapabilities(appId);
    }

    default:
      return { success: false, response: errorResponse('I don\'t understand that cross-app command.') };
  }
}

function provideBuildGuidance(project: string, win: BrowserWindow): UkiResult {
  const projectLower = project.toLowerCase();
  
  // Identify project type and suggest workflow
  let suggestion = '';
  let apps: string[] = [];

  if (projectLower.includes('video') || projectLower.includes('film') || projectLower.includes('movie')) {
    apps = ['videoeditor', 'imosion', 'prism', 'flux', 'forge'];
    suggestion = `For ${project}, I'd suggest this workflow:
1. **VINX** for main video editing and assembly
2. **Imosion** for audio scoring and sound design
3. **PRISM** for still graphics and thumbnails
4. **FLUX** for motion graphics and titles
5. **FORGE** for final encoding and delivery

Would you like me to open any of these?`;
  } else if (projectLower.includes('music') || projectLower.includes('song') || projectLower.includes('audio')) {
    apps = ['imosion', 'forge'];
    suggestion = `For ${project}, I'd recommend:
1. **Imosion** for composing, recording, and mixing
2. **FORGE** for mastering and format conversion

Want me to start Imosion?`;
  } else if (projectLower.includes('3d') || projectLower.includes('model') || projectLower.includes('cad') || projectLower.includes('design')) {
    apps = ['axl', 'prism', 'forge'];
    suggestion = `For ${project}, here's my suggestion:
1. **AXL** for 3D modeling and CAD design
2. **PRISM** for textures and 2D assets
3. **FORGE** for rendering and export

Ready to start AXL?`;
  } else if (projectLower.includes('image') || projectLower.includes('photo') || projectLower.includes('graphic')) {
    apps = ['prism', 'gallery'];
    suggestion = `For ${project}:
1. **PRISM** for image editing and creation
2. **Gallery** for organization

Should I open PRISM?`;
  } else if (projectLower.includes('motion') || projectLower.includes('animation') || projectLower.includes('vfx')) {
    apps = ['flux', 'prism', 'videoeditor'];
    suggestion = `For ${project}:
1. **FLUX** for motion graphics and compositing
2. **PRISM** for still assets
3. **VINX** for final assembly

Open FLUX to get started?`;
  } else {
    return { success: false, response: 'Tell me more about what you\'re building, and I\'ll suggest the best apps and tools.' };
  }

  win.webContents.send('uki:cross-app', { action: 'suggest-workflow', apps, project });
  return { success: true, response: suggestion };
}

function suggestAppForTask(task: string, _win: BrowserWindow): UkiResult {
  const match = findToolByKeywords(task);
  
  if (match && match.confidence > 0.3) {
    return {
      success: true,
      response: `For "${task}", I'd suggest using **${match.tool.name}** in **${match.app.name}**. Say "use ${match.tool.name}" to get started.`,
    };
  }

  return { success: false, response: `I'm not sure which tool is best for "${task}". Can you describe it differently?` };
}

function listAppTools(appId: string, _win: BrowserWindow): UkiResult {
  const app = APP_REGISTRY[appId];
  
  if (!app) {
    // List all apps
    const appList = Object.values(APP_REGISTRY)
      .filter(a => a.category === 'creative')
      .map(a => `**${a.name}**: ${a.description}`)
      .join('\n');
    return { success: true, response: `Here are the creative apps:\n${appList}\n\nSay "list tools for [app]" to see specific tools.` };
  }

  const toolList = app.tools
    .map(t => `• **${t.name}**: ${t.description}`)
    .join('\n');
  
  return { success: true, response: `**${app.name}** tools:\n${toolList}` };
}

function createWorkflow(from: string, to: string, win: BrowserWindow): UkiResult {
  const sourceApp = APP_REGISTRY[from];
  const targetApp = APP_REGISTRY[to];

  if (!sourceApp || !targetApp) {
    return { success: false, response: errorResponse('I need valid app names for the workflow.') };
  }

  // Find common formats
  const commonFormats = sourceApp.canProduce.filter(f => targetApp.canReceive.includes(f));
  
  if (commonFormats.length === 0) {
    return { success: false, response: errorResponse(`${sourceApp.name} and ${targetApp.name} don't share compatible file formats directly.`) };
  }

  win.webContents.send('uki:cross-app', {
    action: 'create-workflow',
    source: from,
    target: to,
    formats: commonFormats,
  });

  return {
    success: true,
    response: `I can help you move work from **${sourceApp.name}** to **${targetApp.name}** using these formats: ${commonFormats.join(', ')}. Export from ${sourceApp.name}, then import in ${targetApp.name}.`,
  };
}

function describeCapabilities(appId: string): UkiResult {
  const app = APP_REGISTRY[appId];
  
  if (!app) {
    return { success: false, response: 'I don\'t recognize that app.' };
  }

  const desc = `**${app.name}** - ${app.description}

**Can open**: ${app.canReceive.join(', ') || 'N/A'}
**Can export**: ${app.canProduce.join(', ') || 'N/A'}
**Works with**: ${app.integrates.join(', ') || 'Standalone'}

**${app.tools.length} tools available**. Say "list tools for ${appId}" to see them.`;

  return { success: true, response: desc };
}

// ---------------------------------------------------------------------------
// Export utility functions for other domains
// ---------------------------------------------------------------------------

export function getAppRegistry(): Record<string, AppCapabilities> {
  return APP_REGISTRY;
}

export function getAppCapabilities(appId: string): AppCapabilities | null {
  return APP_REGISTRY[appId] || null;
}

export function findBestTool(query: string): ToolMatch | null {
  return findToolByKeywords(query);
}
