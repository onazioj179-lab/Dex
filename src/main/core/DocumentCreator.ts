// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Document Creation System
// Phase 19: Structured & Safe document generation
// Generates documents from templates, data, or user inputs
// ===========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Logger } from '../utils/Logger';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

export type DocumentType = 'text' | 'markdown' | 'csv' | 'json' | 'html';

export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;
  content: string;
  variables: string[];
  description?: string;
  createdAt: number;
}

export interface DocumentRequest {
  templateId?: string;
  type: DocumentType;
  name: string;
  data?: Record<string, any>;
  sourceFiles?: string[];
  outputDir: string;
}

export interface DocumentResult {
  id: string;
  success: boolean;
  path?: string;
  error?: string;
  timestamp: number;
  type: DocumentType;
  size?: number;
}

export interface TableData {
  headers: string[];
  rows: (string | number | boolean)[][];
}

// ===========================================================================
// BUILT-IN TEMPLATES
// ===========================================================================

const BUILT_IN_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'blank-text',
    name: 'Blank Text',
    type: 'text',
    content: '',
    variables: [],
    description: 'Empty text document',
    createdAt: 0,
  },
  {
    id: 'blank-markdown',
    name: 'Blank Markdown',
    type: 'markdown',
    content: '# {{title}}\n\n{{content}}',
    variables: ['title', 'content'],
    description: 'Markdown document with title',
    createdAt: 0,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    type: 'markdown',
    content: `# Meeting Notes: {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}

## Agenda
{{agenda}}

## Discussion
{{discussion}}

## Action Items
{{actions}}

## Next Steps
{{nextSteps}}
`,
    variables: ['title', 'date', 'attendees', 'agenda', 'discussion', 'actions', 'nextSteps'],
    description: 'Structured meeting notes template',
    createdAt: 0,
  },
  {
    id: 'task-report',
    name: 'Task Report',
    type: 'markdown',
    content: `# Task Report: {{title}}

**Generated:** {{date}}

## Summary
{{summary}}

## Completed Tasks
{{completed}}

## Pending Tasks
{{pending}}

## Notes
{{notes}}
`,
    variables: ['title', 'date', 'summary', 'completed', 'pending', 'notes'],
    description: 'Task progress report',
    createdAt: 0,
  },
  {
    id: 'file-inventory',
    name: 'File Inventory',
    type: 'csv',
    content: 'Name,Type,Size,Modified\n{{rows}}',
    variables: ['rows'],
    description: 'CSV inventory of files',
    createdAt: 0,
  },
  {
    id: 'data-export',
    name: 'Data Export',
    type: 'json',
    content: '{{data}}',
    variables: ['data'],
    description: 'JSON data export',
    createdAt: 0,
  },
];

// ===========================================================================
// DOCUMENT CREATOR CLASS
// ===========================================================================

class DocumentCreatorClass {
  private templates: Map<string, DocumentTemplate> = new Map();
  private generatedDocuments: DocumentResult[] = [];

  constructor() {
    this.loadTemplates();
  }

  // -------------------------------------------------------------------------
  // TEMPLATE MANAGEMENT
  // -------------------------------------------------------------------------

  /**
   * Get all available templates
   */
  getTemplates(): DocumentTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): DocumentTemplate | null {
    return this.templates.get(id) ?? null;
  }

  /**
   * Add a custom template
   */
  addTemplate(template: Omit<DocumentTemplate, 'id' | 'createdAt'>): DocumentTemplate {
    const newTemplate: DocumentTemplate = {
      ...template,
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: Date.now(),
    };

    this.templates.set(newTemplate.id, newTemplate);
    this.saveTemplates();
    
    log.info(`[DocumentCreator] Added template: ${newTemplate.name}`);
    return newTemplate;
  }

  /**
   * Remove a custom template
   */
  removeTemplate(id: string): boolean {
    if (id.startsWith('custom_')) {
      const removed = this.templates.delete(id);
      if (removed) {
        this.saveTemplates();
        log.info(`[DocumentCreator] Removed template: ${id}`);
      }
      return removed;
    }
    log.warn(`[DocumentCreator] Cannot remove built-in template: ${id}`);
    return false;
  }

  // -------------------------------------------------------------------------
  // DOCUMENT CREATION
  // -------------------------------------------------------------------------

  /**
   * Create a document
   */
  createDocument(request: DocumentRequest): DocumentResult {
    const result: DocumentResult = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      success: false,
      timestamp: Date.now(),
      type: request.type,
    };

    // Validate output directory
    if (!fs.existsSync(request.outputDir)) {
      try {
        fs.mkdirSync(request.outputDir, { recursive: true });
      } catch (error) {
        result.error = 'Failed to create output directory';
        this.recordResult(result);
        return result;
      }
    }

    // Generate content
    let content: string;
    
    if (request.templateId) {
      const template = this.templates.get(request.templateId);
      if (!template) {
        result.error = 'Template not found';
        this.recordResult(result);
        return result;
      }
      content = this.processTemplate(template.content, request.data ?? {});
    } else {
      content = this.generateContent(request);
    }

    // Determine file extension
    const ext = this.getExtension(request.type);
    const fileName = this.sanitizeFileName(request.name) + ext;
    const outputPath = path.join(request.outputDir, fileName);

    // Check if file exists
    if (fs.existsSync(outputPath)) {
      result.error = 'File already exists - use a different name';
      this.recordResult(result);
      return result;
    }

    // Write file
    try {
      fs.writeFileSync(outputPath, content, 'utf-8');
      const stats = fs.statSync(outputPath);
      
      result.success = true;
      result.path = outputPath;
      result.size = stats.size;
      
      log.info(`[DocumentCreator] Created document: ${outputPath}`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Failed to write document';
      log.error('[DocumentCreator] Failed to create document:', error);
    }

    this.recordResult(result);
    return result;
  }

  /**
   * Create document from table data
   */
  createSpreadsheet(
    name: string,
    data: TableData,
    outputDir: string,
    type: 'csv' | 'json' = 'csv'
  ): DocumentResult {
    let content: string;

    if (type === 'csv') {
      const headerLine = data.headers.map(h => this.escapeCSV(h)).join(',');
      const rowLines = data.rows.map(row => 
        row.map(cell => this.escapeCSV(String(cell))).join(',')
      );
      content = [headerLine, ...rowLines].join('\n');
    } else {
      const objects = data.rows.map(row => {
        const obj: Record<string, any> = {};
        data.headers.forEach((header, i) => {
          obj[header] = row[i];
        });
        return obj;
      });
      content = JSON.stringify(objects, null, 2);
    }

    return this.createDocument({
      type,
      name,
      data: { content },
      outputDir,
    });
  }

  /**
   * Create report from multiple sources
   */
  createReport(
    name: string,
    sections: { title: string; content: string }[],
    outputDir: string
  ): DocumentResult {
    const date = new Date().toISOString().split('T')[0];
    let content = `# ${name}\n\n**Generated:** ${date}\n\n---\n\n`;

    for (const section of sections) {
      content += `## ${section.title}\n\n${section.content}\n\n`;
    }

    return this.createDocument({
      type: 'markdown',
      name,
      data: { content },
      outputDir,
    });
  }

  /**
   * Preview document content without saving
   */
  previewDocument(request: DocumentRequest): string {
    if (request.templateId) {
      const template = this.templates.get(request.templateId);
      if (!template) {
        return 'Error: Template not found';
      }
      return this.processTemplate(template.content, request.data ?? {});
    }
    return this.generateContent(request);
  }

  // -------------------------------------------------------------------------
  // HISTORY
  // -------------------------------------------------------------------------

  /**
   * Get generation history
   */
  getHistory(): DocumentResult[] {
    return [...this.generatedDocuments];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.generatedDocuments = [];
    log.info('[DocumentCreator] History cleared');
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private processTemplate(template: string, data: Record<string, any>): string {
    let result = template;
    
    for (const [key, value] of Object.entries(data)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value ?? ''));
    }
    
    // Remove any remaining placeholders
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    
    return result;
  }

  private generateContent(request: DocumentRequest): string {
    const data = request.data ?? {};
    
    switch (request.type) {
      case 'text':
        return data.content ?? '';
      
      case 'markdown':
        return data.content ?? `# ${request.name}\n\n`;
      
      case 'csv':
        return data.content ?? '';
      
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'html':
        return `<!DOCTYPE html>
<html>
<head>
  <title>${request.name}</title>
  <meta charset="utf-8">
</head>
<body>
  ${data.content ?? ''}
</body>
</html>`;
      
      default:
        return '';
    }
  }

  private getExtension(type: DocumentType): string {
    switch (type) {
      case 'text': return '.txt';
      case 'markdown': return '.md';
      case 'csv': return '.csv';
      case 'json': return '.json';
      case 'html': return '.html';
      default: return '.txt';
    }
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200);
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private recordResult(result: DocumentResult): void {
    this.generatedDocuments.push(result);
    
    // Keep last 50 results
    if (this.generatedDocuments.length > 50) {
      this.generatedDocuments = this.generatedDocuments.slice(-50);
    }
  }

  private loadTemplates(): void {
    // Load built-in templates
    for (const template of BUILT_IN_TEMPLATES) {
      this.templates.set(template.id, template);
    }

    // Load custom templates
    try {
      const templatesPath = path.join(app.getPath('userData'), 'dex-templates.json');
      if (fs.existsSync(templatesPath)) {
        const data = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
        for (const template of data.templates ?? []) {
          this.templates.set(template.id, template);
        }
        log.info(`[DocumentCreator] Loaded ${data.templates?.length ?? 0} custom templates`);
      }
    } catch (error) {
      log.error('[DocumentCreator] Failed to load templates:', error);
    }
  }

  private saveTemplates(): void {
    try {
      const customTemplates = Array.from(this.templates.values())
        .filter(t => t.id.startsWith('custom_'));
      
      const templatesPath = path.join(app.getPath('userData'), 'dex-templates.json');
      fs.writeFileSync(templatesPath, JSON.stringify({ templates: customTemplates }, null, 2), 'utf-8');
    } catch (error) {
      log.error('[DocumentCreator] Failed to save templates:', error);
    }
  }
}

// Singleton export
export const documentCreator = new DocumentCreatorClass();
