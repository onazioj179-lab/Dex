// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Documentation Site Generator
// Static site generation for user guides and API docs
// =============================================================================

import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface DocConfig {
  title: string;
  description: string;
  version: string;
  baseUrl: string;
  outputDir: string;
  sourceDir: string;
  theme: DocTheme;
  navigation: NavItem[];
  footer: FooterConfig;
  search: SearchConfig;
  analytics?: AnalyticsConfig;
}

export interface DocTheme {
  name: string;
  primaryColor: string;
  accentColor: string;
  darkMode: boolean;
  logo: string;
  favicon: string;
  customCss?: string;
}

export interface NavItem {
  title: string;
  path?: string;
  children?: NavItem[];
  external?: boolean;
  icon?: string;
}

export interface FooterConfig {
  copyright: string;
  links: Array<{ title: string; url: string }>;
  social: Array<{ platform: string; url: string; icon: string }>;
}

export interface SearchConfig {
  enabled: boolean;
  provider: 'local' | 'algolia';
  algoliaAppId?: string;
  algoliaApiKey?: string;
  algoliaIndexName?: string;
}

export interface AnalyticsConfig {
  provider: 'google' | 'plausible' | 'umami';
  trackingId: string;
}

export interface DocPage {
  title: string;
  slug: string;
  content: string;
  category: string;
  order: number;
  lastUpdated: Date;
  contributors: string[];
  tags: string[];
  toc: TocItem[];
}

export interface TocItem {
  level: number;
  title: string;
  anchor: string;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_DOC_CONFIG: DocConfig = {
  title: 'DEX Documentation',
  description: 'Complete guide to DEX - Personal Control Hub for Desktop Automation',
  version: '3.6.0',
  baseUrl: 'https://docs.dex-app.com',
  outputDir: './docs-site/dist',
  sourceDir: './docs-site/content',
  theme: {
    name: 'dex-docs',
    primaryColor: '#2563EB',
    accentColor: '#8B5CF6',
    darkMode: true,
    logo: '/images/logo.svg',
    favicon: '/favicon.ico'
  },
  navigation: [
    {
      title: 'Getting Started',
      children: [
        { title: 'Introduction', path: '/introduction' },
        { title: 'Installation', path: '/installation' },
        { title: 'Quick Start', path: '/quick-start' },
        { title: 'System Requirements', path: '/requirements' }
      ]
    },
    {
      title: 'Creative Apps',
      children: [
        { title: 'PRISM - Image Editor', path: '/apps/prism' },
        { title: 'VINX - Video Editor', path: '/apps/vinx' },
        { title: 'IMOSION - Audio', path: '/apps/imosion' },
        { title: 'FLUX - Animation', path: '/apps/flux' },
        { title: 'AXL - CAD', path: '/apps/axl' },
        { title: 'FORGE - Web Dev', path: '/apps/forge' }
      ]
    },
    {
      title: 'Productivity',
      children: [
        { title: 'Notes', path: '/apps/notes' },
        { title: 'Browser', path: '/apps/browser' },
        { title: 'Files', path: '/apps/files' },
        { title: 'System Tools', path: '/apps/system' }
      ]
    },
    {
      title: 'Automation',
      children: [
        { title: 'Workflows', path: '/automation/workflows' },
        { title: 'Actions', path: '/automation/actions' },
        { title: 'Triggers', path: '/automation/triggers' },
        { title: 'Scripting', path: '/automation/scripting' }
      ]
    },
    {
      title: 'Customization',
      children: [
        { title: 'Themes', path: '/customization/themes' },
        { title: 'Keyboard Shortcuts', path: '/customization/shortcuts' },
        { title: 'Plugins', path: '/customization/plugins' },
        { title: 'Settings', path: '/customization/settings' }
      ]
    },
    {
      title: 'API Reference',
      children: [
        { title: 'Overview', path: '/api/overview' },
        { title: 'Main Process', path: '/api/main' },
        { title: 'Renderer', path: '/api/renderer' },
        { title: 'Plugin API', path: '/api/plugins' }
      ]
    },
    {
      title: 'Resources',
      children: [
        { title: 'Changelog', path: '/changelog' },
        { title: 'FAQ', path: '/faq' },
        { title: 'Troubleshooting', path: '/troubleshooting' },
        { title: 'Contributing', path: '/contributing' }
      ]
    }
  ],
  footer: {
    copyright: 'Copyright 2026 Onazi Treasure OJ. All rights reserved.',
    links: [
      { title: 'Privacy Policy', url: '/privacy' },
      { title: 'Terms of Service', url: '/terms' },
      { title: 'License', url: '/license' }
    ],
    social: [
      { platform: 'GitHub', url: 'https://github.com/onazioj/dex', icon: 'github' },
      { platform: 'Twitter', url: 'https://twitter.com/dexapp', icon: 'twitter' },
      { platform: 'Discord', url: 'https://discord.gg/dex', icon: 'discord' }
    ]
  },
  search: {
    enabled: true,
    provider: 'local'
  }
};

// =============================================================================
// DOCUMENTATION GENERATOR
// =============================================================================

export class DocGenerator {
  private config: DocConfig;
  private pages: Map<string, DocPage> = new Map();
  
  constructor(config?: Partial<DocConfig>) {
    this.config = { ...DEFAULT_DOC_CONFIG, ...config };
  }
  
  // ==========================================================================
  // PAGE MANAGEMENT
  // ==========================================================================
  
  addPage(page: DocPage): void {
    this.pages.set(page.slug, page);
  }
  
  getPage(slug: string): DocPage | undefined {
    return this.pages.get(slug);
  }
  
  getPages(): DocPage[] {
    return Array.from(this.pages.values());
  }
  
  getPagesByCategory(category: string): DocPage[] {
    return this.getPages()
      .filter(p => p.category === category)
      .sort((a, b) => a.order - b.order);
  }
  
  // ==========================================================================
  // PARSING
  // ==========================================================================
  
  parseMarkdown(content: string): { html: string; toc: TocItem[] } {
    const toc: TocItem[] = [];
    let html = content;
    
    // Parse headings for TOC
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const title = match[2];
      const anchor = this.slugify(title);
      
      toc.push({ level, title, anchor });
    }
    
    // Convert markdown to HTML (simplified)
    html = html
      // Headings
      .replace(/^######\s+(.+)$/gm, '<h6 id="$1">$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5 id="$1">$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4 id="$1">$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3 id="$1">$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2 id="$1">$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1 id="$1">$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Inline code
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p>');
    
    return { html: `<p>${html}</p>`, toc };
  }
  
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }
  
  // ==========================================================================
  // GENERATION
  // ==========================================================================
  
  async build(): Promise<void> {
    console.log('Building documentation site...');
    
    // Generate pages
    for (const page of this.pages.values()) {
      await this.generatePage(page);
    }
    
    // Generate index
    await this.generateIndex();
    
    // Generate search index
    if (this.config.search.enabled) {
      await this.generateSearchIndex();
    }
    
    // Generate sitemap
    await this.generateSitemap();
    
    console.log('Documentation build complete!');
  }
  
  private async generatePage(page: DocPage): Promise<void> {
    const { html, toc } = this.parseMarkdown(page.content);
    
    const pageHtml = this.renderTemplate('page', {
      ...page,
      content: html,
      toc,
      config: this.config
    });
    
    // In production, write to file
    console.log(`Generated: ${page.slug}`);
  }
  
  private async generateIndex(): Promise<void> {
    const indexHtml = this.renderTemplate('index', {
      config: this.config,
      pages: this.getPages()
    });
    
    console.log('Generated: index.html');
  }
  
  private async generateSearchIndex(): Promise<void> {
    const searchIndex = this.getPages().map(page => ({
      slug: page.slug,
      title: page.title,
      content: page.content.substring(0, 500),
      category: page.category,
      tags: page.tags
    }));
    
    console.log('Generated: search-index.json');
  }
  
  private async generateSitemap(): Promise<void> {
    const urls = this.getPages().map(page => ({
      loc: `${this.config.baseUrl}${page.slug}`,
      lastmod: page.lastUpdated.toISOString().split('T')[0],
      changefreq: 'weekly',
      priority: page.slug === '/introduction' ? 1.0 : 0.8
    }));
    
    console.log('Generated: sitemap.xml');
  }
  
  private renderTemplate(template: string, data: Record<string, unknown>): string {
    // Simplified template rendering
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title || this.config.title}</title>
  <meta name="description" content="${this.config.description}">
  <link rel="icon" href="${this.config.theme.favicon}">
  <style>
    :root {
      --primary: ${this.config.theme.primaryColor};
      --accent: ${this.config.theme.accentColor};
    }
  </style>
</head>
<body>
  <nav></nav>
  <main>${template === 'page' ? data.content : ''}</main>
  <footer>
    <p>${this.config.footer.copyright}</p>
  </footer>
</body>
</html>`;
  }
  
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  
  getConfig(): DocConfig {
    return { ...this.config };
  }
  
  updateConfig(updates: Partial<DocConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// =============================================================================
// CONTENT TEMPLATES
// =============================================================================

export const DOC_TEMPLATES = {
  introduction: `# Introduction

Welcome to DEX - your Personal Control Hub for Desktop Automation.

## What is DEX?

DEX is a powerful desktop application that combines creative tools, productivity apps, and system management into one unified experience.

## Key Features

- **Creative Suite**: Professional image, video, audio, and animation editing
- **Productivity Tools**: Notes, browser, file manager, and more
- **Automation**: Create workflows to automate repetitive tasks
- **System Control**: Monitor and manage system resources
- **Customization**: Themes, shortcuts, and plugins

## Getting Help

- Check the [FAQ](/faq) for common questions
- Visit [Troubleshooting](/troubleshooting) for solutions
- Join our [Discord](https://discord.gg/dex) community
`,

  installation: `# Installation

## System Requirements

- **Windows**: Windows 10 version 1903 or later (x64)
- **macOS**: macOS 10.15 Catalina or later
- **Linux**: Ubuntu 20.04+, Fedora 34+, or equivalent

## Download

Download the latest version from [dex-app.com/download](https://dex-app.com/download).

## Windows Installation

1. Download \`DEX-3.6.0-win-x64.exe\`
2. Run the installer
3. Follow the installation wizard
4. Launch DEX from the Start Menu

## macOS Installation

1. Download \`DEX-3.6.0-mac.dmg\`
2. Open the DMG file
3. Drag DEX to Applications
4. Launch DEX from Applications

## Linux Installation

### Debian/Ubuntu
\`\`\`bash
sudo dpkg -i DEX-3.6.0.deb
\`\`\`

### Fedora/RHEL
\`\`\`bash
sudo rpm -i DEX-3.6.0.rpm
\`\`\`

### AppImage
\`\`\`bash
chmod +x DEX-3.6.0.AppImage
./DEX-3.6.0.AppImage
\`\`\`
`,

  quickStart: `# Quick Start

Get up and running with DEX in 5 minutes.

## First Launch

When you first open DEX, you'll see the Dashboard. This is your command center.

## Explore the Apps

Click on any app tile to open it:

- **PRISM**: Edit images
- **VINX**: Edit videos
- **Notes**: Take notes
- **Files**: Manage files

## Create Your First Workflow

1. Go to **Automation** > **Workflows**
2. Click **New Workflow**
3. Add actions by dragging from the sidebar
4. Connect actions together
5. Click **Save**

## Customize Your Experience

- Press \`Ctrl+,\` (Windows) or \`Cmd+,\` (Mac) for Settings
- Choose a theme under Appearance
- Set up keyboard shortcuts
`
};

// =============================================================================
// EXPORTS
// =============================================================================

export const createDocGenerator = (config?: Partial<DocConfig>) => new DocGenerator(config);

export default { DocGenerator, createDocGenerator, DEFAULT_DOC_CONFIG, DOC_TEMPLATES };
