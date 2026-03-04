// ═══════════════════════════════════════════════════════════════════════════
// DEX - Code Controller
// Phase 62: IPC handlers for Universal Code Editor
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

const log = new Logger();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface CodeFile {
  id: string;
  name: string;
  path: string;
  language: string;
  content?: string;
  size: number;
  modified: number;
  created: number;
}

interface CodeFolder {
  id: string;
  name: string;
  path: string;
  files: number;
}

// Language detection by extension
const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.R': 'r',
  '.sql': 'sql',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.ps1': 'powershell',
  '.lua': 'lua',
  '.vim': 'vim',
  '.dockerfile': 'dockerfile',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
};

// Code file extensions
const CODE_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

// ═══════════════════════════════════════════════════════════════════════════
// CODE CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

class CodeControllerClass {
  private initialized = false;
  private recentFiles: string[] = [];
  private folders: CodeFolder[] = [];
  private maxRecent = 20;

  constructor() {
    this.loadState();
    this.registerHandlers();
  }

  /**
   * Load persisted state
   */
  private loadState(): void {
    try {
      const statePath = path.join(app.getPath('userData'), 'code-editor-state.json');
      if (fs.existsSync(statePath)) {
        const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        this.recentFiles = data.recentFiles || [];
        this.folders = data.folders || [];
      }
    } catch (err) {
      log.warn('Failed to load code editor state:', err);
    }
  }

  /**
   * Save persisted state
   */
  private saveState(): void {
    try {
      const statePath = path.join(app.getPath('userData'), 'code-editor-state.json');
      fs.writeFileSync(statePath, JSON.stringify({
        recentFiles: this.recentFiles,
        folders: this.folders,
      }, null, 2));
    } catch (err) {
      log.warn('Failed to save code editor state:', err);
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    // Special case for Dockerfile (no extension)
    if (path.basename(filePath).toLowerCase() === 'dockerfile') {
      return 'dockerfile';
    }
    
    return LANGUAGE_MAP[ext] || 'plaintext';
  }

  /**
   * Check if file is a code file
   */
  private isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    
    return CODE_EXTENSIONS.has(ext) || 
           basename === 'dockerfile' ||
           basename === 'makefile' ||
           basename === '.gitignore' ||
           basename === '.env';
  }

  /**
   * Get file info
   */
  private getFileInfo(filePath: string): CodeFile | null {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return null;

      return {
        id: Buffer.from(filePath).toString('base64'),
        name: path.basename(filePath),
        path: filePath,
        language: this.detectLanguage(filePath),
        size: stat.size,
        modified: stat.mtimeMs,
        created: stat.birthtimeMs,
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Register IPC handlers
   */
  private registerHandlers(): void {
    if (this.initialized) return;

    // ─────────────────────────────────────────────────────────────────────────
    // FILE LISTING
    // ─────────────────────────────────────────────────────────────────────────

    ipcMain.handle('code:getFiles', async (_, folderPath?: string): Promise<CodeFile[]> => {
      try {
        // If no folder specified, return files from all tracked folders
        if (!folderPath) {
          const allFiles: CodeFile[] = [];
          for (const folder of this.folders) {
            const files = await this.getFilesInFolder(folder.path);
            allFiles.push(...files);
          }
          return allFiles;
        }

        return await this.getFilesInFolder(folderPath);
      } catch (err) {
        log.error('code:getFiles failed:', err);
        return [];
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // FILE OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    ipcMain.handle('code:readFile', async (_, fileId: string): Promise<CodeFile | null> => {
      try {
        const filePath = Buffer.from(fileId, 'base64').toString('utf-8');
        
        if (!fs.existsSync(filePath)) {
          log.warn('File not found:', filePath);
          return null;
        }

        const info = this.getFileInfo(filePath);
        if (!info) return null;

        // Read content
        const content = fs.readFileSync(filePath, 'utf-8');
        return { ...info, content };
      } catch (err) {
        log.error('code:readFile failed:', err);
        return null;
      }
    });

    ipcMain.handle('code:saveFile', async (_, file: { id: string; content: string; path?: string }): Promise<boolean> => {
      try {
        let filePath: string;

        if (file.path) {
          filePath = file.path;
        } else if (file.id) {
          filePath = Buffer.from(file.id, 'base64').toString('utf-8');
        } else {
          log.error('code:saveFile - no path or id provided');
          return false;
        }

        fs.writeFileSync(filePath, file.content, 'utf-8');
        log.info('File saved:', filePath);
        
        // Add to recent
        this.addToRecentInternal(filePath);
        
        return true;
      } catch (err) {
        log.error('code:saveFile failed:', err);
        return false;
      }
    });

    ipcMain.handle('code:deleteFile', async (_, fileId: string): Promise<boolean> => {
      try {
        const filePath = Buffer.from(fileId, 'base64').toString('utf-8');
        
        if (!fs.existsSync(filePath)) {
          return false;
        }

        fs.unlinkSync(filePath);
        log.info('File deleted:', filePath);
        
        // Remove from recent
        this.recentFiles = this.recentFiles.filter(f => f !== filePath);
        this.saveState();
        
        return true;
      } catch (err) {
        log.error('code:deleteFile failed:', err);
        return false;
      }
    });

    ipcMain.handle('code:createFile', async (_, language: string): Promise<CodeFile | null> => {
      try {
        const window = BrowserWindow.getFocusedWindow();
        if (!window) return null;

        // Get extension for language
        const ext = Object.entries(LANGUAGE_MAP).find(([_, lang]) => lang === language)?.[0] || '.txt';
        
        const result = await dialog.showSaveDialog(window, {
          title: 'Create New File',
          defaultPath: `untitled${ext}`,
          filters: [
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePath) {
          return null;
        }

        // Create empty file
        fs.writeFileSync(result.filePath, '', 'utf-8');
        
        const info = this.getFileInfo(result.filePath);
        if (info) {
          this.addToRecentInternal(result.filePath);
        }
        
        return info ? { ...info, content: '' } : null;
      } catch (err) {
        log.error('code:createFile failed:', err);
        return null;
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // FOLDER OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    ipcMain.handle('code:getFolders', async (): Promise<CodeFolder[]> => {
      return this.folders;
    });

    ipcMain.handle('code:createFolder', async (_, folderPath?: string): Promise<CodeFolder | null> => {
      try {
        const window = BrowserWindow.getFocusedWindow();
        if (!window && !folderPath) return null;

        let targetPath = folderPath;

        if (!targetPath) {
          const result = await dialog.showOpenDialog(window!, {
            title: 'Select Folder to Add',
            properties: ['openDirectory'],
          });

          if (result.canceled || result.filePaths.length === 0) {
            return null;
          }

          targetPath = result.filePaths[0];
        }

        // Check if already tracked
        if (this.folders.some(f => f.path === targetPath)) {
          log.info('Folder already tracked:', targetPath);
          return this.folders.find(f => f.path === targetPath) || null;
        }

        // Count files
        const files = await this.getFilesInFolder(targetPath);

        const folder: CodeFolder = {
          id: Buffer.from(targetPath).toString('base64'),
          name: path.basename(targetPath),
          path: targetPath,
          files: files.length,
        };

        this.folders.push(folder);
        this.saveState();

        log.info('Folder added:', targetPath);
        return folder;
      } catch (err) {
        log.error('code:createFolder failed:', err);
        return null;
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEARCH
    // ─────────────────────────────────────────────────────────────────────────

    ipcMain.handle('code:searchFiles', async (_, query: string): Promise<CodeFile[]> => {
      try {
        if (!query || query.length < 2) return [];

        const results: CodeFile[] = [];
        const lowerQuery = query.toLowerCase();

        for (const folder of this.folders) {
          const files = await this.getFilesInFolder(folder.path);
          
          for (const file of files) {
            // Search in filename
            if (file.name.toLowerCase().includes(lowerQuery)) {
              results.push(file);
              continue;
            }

            // Search in content (for small files only, < 1MB)
            if (file.size < 1024 * 1024) {
              try {
                const content = fs.readFileSync(file.path, 'utf-8');
                if (content.toLowerCase().includes(lowerQuery)) {
                  results.push(file);
                }
              } catch {
                // Skip files that can't be read
              }
            }
          }
        }

        return results.slice(0, 50); // Limit results
      } catch (err) {
        log.error('code:searchFiles failed:', err);
        return [];
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // RECENT FILES
    // ─────────────────────────────────────────────────────────────────────────

    ipcMain.handle('code:getRecent', async (): Promise<CodeFile[]> => {
      const recent: CodeFile[] = [];
      
      for (const filePath of this.recentFiles) {
        if (fs.existsSync(filePath)) {
          const info = this.getFileInfo(filePath);
          if (info) {
            recent.push(info);
          }
        }
      }

      return recent;
    });

    ipcMain.handle('code:addToRecent', async (_, fileId: string): Promise<void> => {
      try {
        const filePath = Buffer.from(fileId, 'base64').toString('utf-8');
        this.addToRecentInternal(filePath);
      } catch (err) {
        log.warn('code:addToRecent failed:', err);
      }
    });

    this.initialized = true;
    log.info('CodeController initialized');
  }

  /**
   * Get all code files in a folder recursively
   */
  private async getFilesInFolder(folderPath: string, maxDepth = 5): Promise<CodeFile[]> {
    const files: CodeFile[] = [];

    const scanDir = (dir: string, depth: number): void => {
      if (depth > maxDepth) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Skip hidden and common non-code directories
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' ||
              entry.name === '__pycache__' ||
              entry.name === 'dist' ||
              entry.name === 'build' ||
              entry.name === '.git') {
            continue;
          }

          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && this.isCodeFile(fullPath)) {
            const info = this.getFileInfo(fullPath);
            if (info) {
              files.push(info);
            }
          }
        }
      } catch (err) {
        // Skip directories we can't read
      }
    };

    scanDir(folderPath, 0);
    return files;
  }

  /**
   * Add file to recent list
   */
  private addToRecentInternal(filePath: string): void {
    // Remove if already exists
    this.recentFiles = this.recentFiles.filter(f => f !== filePath);
    
    // Add to front
    this.recentFiles.unshift(filePath);
    
    // Trim to max
    if (this.recentFiles.length > this.maxRecent) {
      this.recentFiles = this.recentFiles.slice(0, this.maxRecent);
    }
    
    this.saveState();
  }
}

// Export singleton
export const codeController = new CodeControllerClass();
