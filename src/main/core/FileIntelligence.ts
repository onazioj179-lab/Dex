// ═══════════════════════════════════════════════════════════════════════════
// DEX - File Intelligence Core
// Phase 38: Deep File Intelligence, Media Understanding
// Local-first, permission-based, secure file analysis
// ═══════════════════════════════════════════════════════════════════════════

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FileMetadata {
  id: string;
  path: string;
  name: string;
  extension: string;
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  type: FileType;
  category: FileCategory;
  mimeType: string;
  isHidden: boolean;
  isSystem: boolean;
  hash?: string;
  analyzed: boolean;
  analyzedAt?: Date;
}

export interface MediaMetadata extends FileMetadata {
  duration?: number;      // seconds
  width?: number;         // pixels
  height?: number;        // pixels
  codec?: string;
  bitrate?: number;
  sampleRate?: number;    // audio
  channels?: number;      // audio
  frameRate?: number;     // video
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  thumbnail?: string;     // base64 or path to cached thumbnail
}

export interface DocumentMetadata extends FileMetadata {
  pageCount?: number;
  wordCount?: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  language?: string;
}

export type FileType = 
  | 'document' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'archive' 
  | 'code' 
  | 'data' 
  | 'executable' 
  | 'font' 
  | 'other';

export type FileCategory = 
  | 'work' 
  | 'personal' 
  | 'media' 
  | 'development' 
  | 'system' 
  | 'temp' 
  | 'download' 
  | 'unknown';

export interface FileGroup {
  id: string;
  name: string;
  type: 'type' | 'date' | 'project' | 'size' | 'custom';
  files: string[];  // file IDs
  count: number;
  totalSize: number;
}

export interface WatchedDirectory {
  path: string;
  recursive: boolean;
  enabled: boolean;
  lastScan: Date;
  fileCount: number;
}

export interface OrganizationSuggestion {
  id: string;
  type: 'move' | 'rename' | 'group' | 'archive' | 'cleanup';
  description: string;
  files: string[];
  targetPath?: string;
  confidence: number;  // 0-1
  approved: boolean;
  applied: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Type Detection
// ─────────────────────────────────────────────────────────────────────────────

const FILE_TYPE_MAP: Record<string, FileType> = {
  // Documents
  '.pdf': 'document', '.doc': 'document', '.docx': 'document',
  '.txt': 'document', '.rtf': 'document', '.odt': 'document',
  '.xls': 'document', '.xlsx': 'document', '.csv': 'document',
  '.ppt': 'document', '.pptx': 'document', '.odp': 'document',
  '.md': 'document', '.epub': 'document', '.mobi': 'document',
  
  // Images
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
  '.gif': 'image', '.bmp': 'image', '.svg': 'image',
  '.webp': 'image', '.ico': 'image', '.tiff': 'image',
  '.raw': 'image', '.psd': 'image', '.ai': 'image',
  '.heic': 'image', '.heif': 'image', '.avif': 'image',
  
  // Video
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video',
  '.mov': 'video', '.wmv': 'video', '.flv': 'video',
  '.webm': 'video', '.m4v': 'video', '.mpeg': 'video',
  '.3gp': 'video', '.ogv': 'video',
  
  // Audio
  '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio',
  '.aac': 'audio', '.ogg': 'audio', '.wma': 'audio',
  '.m4a': 'audio', '.opus': 'audio', '.aiff': 'audio',
  
  // Archives
  '.zip': 'archive', '.rar': 'archive', '.7z': 'archive',
  '.tar': 'archive', '.gz': 'archive', '.bz2': 'archive',
  '.xz': 'archive', '.iso': 'archive',
  
  // Code
  '.js': 'code', '.ts': 'code', '.jsx': 'code', '.tsx': 'code',
  '.py': 'code', '.java': 'code', '.c': 'code', '.cpp': 'code',
  '.h': 'code', '.cs': 'code', '.go': 'code', '.rs': 'code',
  '.rb': 'code', '.php': 'code', '.swift': 'code', '.kt': 'code',
  '.html': 'code', '.css': 'code', '.scss': 'code', '.less': 'code',
  '.json': 'code', '.xml': 'code', '.yaml': 'code', '.yml': 'code',
  '.sql': 'code', '.sh': 'code', '.bash': 'code', '.ps1': 'code',
  
  // Data
  '.db': 'data', '.sqlite': 'data', '.mdb': 'data',
  '.log': 'data', '.dat': 'data', '.bak': 'data',
  
  // Executables
  '.exe': 'executable', '.msi': 'executable', '.app': 'executable',
  '.dmg': 'executable', '.deb': 'executable', '.rpm': 'executable',
  '.apk': 'executable', '.bat': 'executable', '.cmd': 'executable',
  
  // Fonts
  '.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
};

const MIME_TYPE_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

// Patterns to detect clutter
const CLUTTER_PATTERNS = [
  /^~\$/,                    // Office temp files
  /\.tmp$/i,                 // Temp files
  /\.bak$/i,                 // Backup files
  /\.swp$/i,                 // Vim swap
  /^\.DS_Store$/,            // macOS
  /^Thumbs\.db$/i,           // Windows
  /^desktop\.ini$/i,         // Windows
  /^\._/,                    // macOS resource forks
  /^\.git$/,                 // Git folder
  /^node_modules$/,          // Node modules
  /^__pycache__$/,           // Python cache
  /\.pyc$/,                  // Python compiled
  /^\.vscode$/,              // VS Code settings
  /^\.idea$/,                // JetBrains settings
];

// ─────────────────────────────────────────────────────────────────────────────
// File Intelligence Service
// ─────────────────────────────────────────────────────────────────────────────

export class FileIntelligenceService extends EventEmitter {
  private static instance: FileIntelligenceService;
  
  private fileIndex: Map<string, FileMetadata> = new Map();
  private watchedDirs: Map<string, WatchedDirectory> = new Map();
  private suggestions: Map<string, OrganizationSuggestion> = new Map();
  private analysisQueue: string[] = [];
  private isAnalyzing = false;
  private cacheDir: string;
  private indexPath: string;
  
  // Security: Only these base paths are allowed
  private allowedPaths: Set<string> = new Set();
  
  private constructor() {
    super();
    this.cacheDir = path.join(app.getPath('userData'), 'file-intelligence');
    this.indexPath = path.join(this.cacheDir, 'index.json');
    this.ensureCacheDir();
    this.loadIndex();
  }
  
  static getInstance(): FileIntelligenceService {
    if (!FileIntelligenceService.instance) {
      FileIntelligenceService.instance = new FileIntelligenceService();
    }
    return FileIntelligenceService.instance;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Security: Path Authorization
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Authorize a path for file intelligence operations
   * User must explicitly grant access to directories
   */
  authorizePath(dirPath: string): boolean {
    const normalized = path.normalize(dirPath);
    
    // Security check: Don't allow system directories
    const forbidden = [
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      '/System',
      '/usr',
      '/bin',
      '/sbin',
      '/etc',
    ];
    
    for (const dir of forbidden) {
      if (normalized.toLowerCase().startsWith(dir.toLowerCase())) {
        console.warn(`[FileIntelligence] Blocked access to system directory: ${dirPath}`);
        return false;
      }
    }
    
    this.allowedPaths.add(normalized);
    this.emit('pathAuthorized', normalized);
    return true;
  }
  
  revokePath(dirPath: string): void {
    const normalized = path.normalize(dirPath);
    this.allowedPaths.delete(normalized);
    this.watchedDirs.delete(normalized);
    this.emit('pathRevoked', normalized);
  }
  
  isPathAuthorized(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    for (const allowed of this.allowedPaths) {
      if (normalized.startsWith(allowed)) {
        return true;
      }
    }
    return false;
  }
  
  getAuthorizedPaths(): string[] {
    return Array.from(this.allowedPaths);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // File Analysis
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Analyze a single file and extract metadata
   */
  async analyzeFile(filePath: string, deep = false): Promise<FileMetadata | null> {
    if (!this.isPathAuthorized(filePath)) {
      console.warn(`[FileIntelligence] Unauthorized path: ${filePath}`);
      return null;
    }
    
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) return null;
      
      const ext = path.extname(filePath).toLowerCase();
      const name = path.basename(filePath);
      
      const metadata: FileMetadata = {
        id: this.generateFileId(filePath),
        path: filePath,
        name,
        extension: ext,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        type: FILE_TYPE_MAP[ext] || 'other',
        category: this.categorizeFile(filePath, ext),
        mimeType: MIME_TYPE_MAP[ext] || 'application/octet-stream',
        isHidden: name.startsWith('.'),
        isSystem: this.isSystemFile(filePath),
        analyzed: true,
        analyzedAt: new Date(),
      };
      
      // Deep analysis: compute hash for duplicate detection
      if (deep && stats.size < 100 * 1024 * 1024) { // Only for files < 100MB
        metadata.hash = await this.computeFileHash(filePath);
      }
      
      this.fileIndex.set(metadata.id, metadata);
      this.emit('fileAnalyzed', metadata);
      
      return metadata;
    } catch (error) {
      console.error(`[FileIntelligence] Error analyzing ${filePath}:`, error);
      return null;
    }
  }
  
  /**
   * Scan a directory and analyze all files
   */
  async scanDirectory(
    dirPath: string, 
    options: { recursive?: boolean; maxFiles?: number } = {}
  ): Promise<FileMetadata[]> {
    const { recursive = true, maxFiles = 10000 } = options;
    
    if (!this.isPathAuthorized(dirPath)) {
      console.warn(`[FileIntelligence] Unauthorized path: ${dirPath}`);
      return [];
    }
    
    const results: FileMetadata[] = [];
    let count = 0;
    
    const scan = async (dir: string, depth: number) => {
      if (count >= maxFiles) return;
      if (!recursive && depth > 0) return;
      
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (count >= maxFiles) break;
          
          const fullPath = path.join(dir, entry.name);
          
          // Skip clutter
          if (this.isClutter(entry.name)) continue;
          
          if (entry.isFile()) {
            const metadata = await this.analyzeFile(fullPath);
            if (metadata) {
              results.push(metadata);
              count++;
            }
          } else if (entry.isDirectory() && recursive) {
            await scan(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Permission denied or other error - skip silently
      }
    };
    
    this.emit('scanStarted', dirPath);
    await scan(dirPath, 0);
    this.emit('scanCompleted', { path: dirPath, count: results.length });
    
    // Update watched directory info
    this.watchedDirs.set(dirPath, {
      path: dirPath,
      recursive,
      enabled: true,
      lastScan: new Date(),
      fileCount: results.length,
    });
    
    await this.saveIndex();
    
    return results;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // File Grouping & Organization
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Group files by type
   */
  groupByType(): FileGroup[] {
    const groups: Map<FileType, FileGroup> = new Map();
    
    for (const [id, file] of this.fileIndex) {
      let group = groups.get(file.type);
      if (!group) {
        group = {
          id: `type-${file.type}`,
          name: this.getTypeDisplayName(file.type),
          type: 'type',
          files: [],
          count: 0,
          totalSize: 0,
        };
        groups.set(file.type, group);
      }
      group.files.push(id);
      group.count++;
      group.totalSize += file.size;
    }
    
    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count);
  }
  
  /**
   * Group files by date (day, week, month)
   */
  groupByDate(granularity: 'day' | 'week' | 'month' = 'month'): FileGroup[] {
    const groups: Map<string, FileGroup> = new Map();
    
    for (const [id, file] of this.fileIndex) {
      const date = file.modified;
      let key: string;
      let name: string;
      
      if (granularity === 'day') {
        key = date.toISOString().split('T')[0];
        name = date.toLocaleDateString();
      } else if (granularity === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        name = `Week of ${weekStart.toLocaleDateString()}`;
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        name = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      }
      
      let group = groups.get(key);
      if (!group) {
        group = {
          id: `date-${key}`,
          name,
          type: 'date',
          files: [],
          count: 0,
          totalSize: 0,
        };
        groups.set(key, group);
      }
      group.files.push(id);
      group.count++;
      group.totalSize += file.size;
    }
    
    return Array.from(groups.values())
      .sort((a, b) => b.id.localeCompare(a.id)); // Most recent first
  }
  
  /**
   * Find potential duplicates by hash
   */
  findDuplicates(): Map<string, FileMetadata[]> {
    const hashMap: Map<string, FileMetadata[]> = new Map();
    
    for (const [, file] of this.fileIndex) {
      if (!file.hash) continue;
      
      const existing = hashMap.get(file.hash) || [];
      existing.push(file);
      hashMap.set(file.hash, existing);
    }
    
    // Filter to only groups with duplicates
    const duplicates = new Map<string, FileMetadata[]>();
    for (const [hash, files] of hashMap) {
      if (files.length > 1) {
        duplicates.set(hash, files);
      }
    }
    
    return duplicates;
  }
  
  /**
   * Generate organization suggestions
   */
  generateSuggestions(): OrganizationSuggestion[] {
    const suggestions: OrganizationSuggestion[] = [];
    
    // Suggestion 1: Group downloads by type
    const downloads = Array.from(this.fileIndex.values())
      .filter(f => f.category === 'download');
    
    if (downloads.length > 10) {
      const byType = new Map<FileType, FileMetadata[]>();
      for (const file of downloads) {
        const existing = byType.get(file.type) || [];
        existing.push(file);
        byType.set(file.type, existing);
      }
      
      for (const [type, files] of byType) {
        if (files.length >= 5) {
          suggestions.push({
            id: `organize-downloads-${type}`,
            type: 'group',
            description: `Group ${files.length} ${type} files from Downloads into a dedicated folder`,
            files: files.map(f => f.id),
            confidence: 0.7,
            approved: false,
            applied: false,
          });
        }
      }
    }
    
    // Suggestion 2: Clean up duplicates
    const duplicates = this.findDuplicates();
    if (duplicates.size > 0) {
      for (const [, files] of duplicates) {
        const totalWasted = files.slice(1).reduce((sum, f) => sum + f.size, 0);
        if (totalWasted > 1024 * 1024) { // > 1MB wasted
          suggestions.push({
            id: `cleanup-duplicates-${files[0].hash}`,
            type: 'cleanup',
            description: `Remove ${files.length - 1} duplicate files (save ${this.formatSize(totalWasted)})`,
            files: files.slice(1).map(f => f.id),
            confidence: 0.9,
            approved: false,
            applied: false,
          });
        }
      }
    }
    
    // Suggestion 3: Archive old files
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const oldFiles = Array.from(this.fileIndex.values())
      .filter(f => f.modified < oneYearAgo && f.size > 10 * 1024 * 1024); // >10MB and >1 year old
    
    if (oldFiles.length >= 3) {
      const totalSize = oldFiles.reduce((sum, f) => sum + f.size, 0);
      suggestions.push({
        id: 'archive-old-large',
        type: 'archive',
        description: `Archive ${oldFiles.length} large files not accessed in over a year (${this.formatSize(totalSize)})`,
        files: oldFiles.map(f => f.id),
        confidence: 0.6,
        approved: false,
        applied: false,
      });
    }
    
    // Store suggestions
    for (const s of suggestions) {
      this.suggestions.set(s.id, s);
    }
    
    this.emit('suggestionsGenerated', suggestions);
    return suggestions;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Query & Retrieval
  // ─────────────────────────────────────────────────────────────────────────
  
  getFile(id: string): FileMetadata | undefined {
    return this.fileIndex.get(id);
  }
  
  getFileByPath(filePath: string): FileMetadata | undefined {
    const id = this.generateFileId(filePath);
    return this.fileIndex.get(id);
  }
  
  getAllFiles(): FileMetadata[] {
    return Array.from(this.fileIndex.values());
  }
  
  getFilesByType(type: FileType): FileMetadata[] {
    return Array.from(this.fileIndex.values())
      .filter(f => f.type === type);
  }
  
  getFilesByCategory(category: FileCategory): FileMetadata[] {
    return Array.from(this.fileIndex.values())
      .filter(f => f.category === category);
  }
  
  searchFiles(query: string): FileMetadata[] {
    const lower = query.toLowerCase();
    return Array.from(this.fileIndex.values())
      .filter(f => 
        f.name.toLowerCase().includes(lower) ||
        f.path.toLowerCase().includes(lower)
      )
      .sort((a, b) => {
        // Prioritize name matches over path matches
        const aName = a.name.toLowerCase().includes(lower);
        const bName = b.name.toLowerCase().includes(lower);
        if (aName && !bName) return -1;
        if (!aName && bName) return 1;
        return b.modified.getTime() - a.modified.getTime();
      });
  }
  
  getRecentFiles(limit = 20): FileMetadata[] {
    return Array.from(this.fileIndex.values())
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .slice(0, limit);
  }
  
  getLargestFiles(limit = 20): FileMetadata[] {
    return Array.from(this.fileIndex.values())
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────────────────
  
  getStatistics() {
    const files = Array.from(this.fileIndex.values());
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    const byType: Record<string, { count: number; size: number }> = {};
    const byCategory: Record<string, { count: number; size: number }> = {};
    
    for (const file of files) {
      if (!byType[file.type]) {
        byType[file.type] = { count: 0, size: 0 };
      }
      byType[file.type].count++;
      byType[file.type].size += file.size;
      
      if (!byCategory[file.category]) {
        byCategory[file.category] = { count: 0, size: 0 };
      }
      byCategory[file.category].count++;
      byCategory[file.category].size += file.size;
    }
    
    return {
      totalFiles: files.length,
      totalSize,
      totalSizeFormatted: this.formatSize(totalSize),
      byType,
      byCategory,
      watchedDirectories: this.watchedDirs.size,
      authorizedPaths: this.allowedPaths.size,
      pendingSuggestions: Array.from(this.suggestions.values())
        .filter(s => !s.approved && !s.applied).length,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────
  
  private generateFileId(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex').slice(0, 16);
  }
  
  private async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  private categorizeFile(filePath: string, ext: string): FileCategory {
    const lower = filePath.toLowerCase();
    
    if (lower.includes('downloads') || lower.includes('download')) return 'download';
    if (lower.includes('temp') || lower.includes('tmp')) return 'temp';
    if (lower.includes('documents') || lower.includes('docs')) return 'work';
    if (lower.includes('pictures') || lower.includes('photos') || lower.includes('images')) return 'media';
    if (lower.includes('videos') || lower.includes('movies')) return 'media';
    if (lower.includes('music') || lower.includes('audio')) return 'media';
    if (lower.includes('desktop')) return 'personal';
    if (lower.includes('projects') || lower.includes('code') || lower.includes('dev')) return 'development';
    if (lower.includes('system') || lower.includes('windows') || lower.includes('program')) return 'system';
    
    const type = FILE_TYPE_MAP[ext];
    if (type === 'code') return 'development';
    if (type === 'image' || type === 'video' || type === 'audio') return 'media';
    if (type === 'document') return 'work';
    
    return 'unknown';
  }
  
  private isSystemFile(filePath: string): boolean {
    const systemPaths = ['Windows', 'System32', 'Program Files', '/usr', '/bin', '/etc'];
    return systemPaths.some(p => filePath.includes(p));
  }
  
  private isClutter(name: string): boolean {
    return CLUTTER_PATTERNS.some(pattern => pattern.test(name));
  }
  
  private getTypeDisplayName(type: FileType): string {
    const names: Record<FileType, string> = {
      document: 'Documents',
      image: 'Images',
      video: 'Videos',
      audio: 'Audio',
      archive: 'Archives',
      code: 'Code',
      data: 'Data Files',
      executable: 'Programs',
      font: 'Fonts',
      other: 'Other',
    };
    return names[type];
  }
  
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let size = bytes;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────────────────
  
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }
  
  private async loadIndex(): Promise<void> {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = await fs.promises.readFile(this.indexPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        // Restore file index
        for (const [id, file] of Object.entries(parsed.files || {})) {
          const f = file as FileMetadata;
          f.created = new Date(f.created);
          f.modified = new Date(f.modified);
          f.accessed = new Date(f.accessed);
          if (f.analyzedAt) f.analyzedAt = new Date(f.analyzedAt);
          this.fileIndex.set(id, f);
        }
        
        // Restore watched directories
        for (const [path, dir] of Object.entries(parsed.watchedDirs || {})) {
          const d = dir as WatchedDirectory;
          d.lastScan = new Date(d.lastScan);
          this.watchedDirs.set(path, d);
        }
        
        // Restore authorized paths
        for (const p of parsed.allowedPaths || []) {
          this.allowedPaths.add(p);
        }
        
        console.log(`[FileIntelligence] Loaded ${this.fileIndex.size} files from index`);
      }
    } catch (error) {
      console.error('[FileIntelligence] Error loading index:', error);
    }
  }
  
  private async saveIndex(): Promise<void> {
    try {
      const data = {
        version: 1,
        savedAt: new Date().toISOString(),
        files: Object.fromEntries(this.fileIndex),
        watchedDirs: Object.fromEntries(this.watchedDirs),
        allowedPaths: Array.from(this.allowedPaths),
      };
      
      await fs.promises.writeFile(
        this.indexPath, 
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[FileIntelligence] Error saving index:', error);
    }
  }
  
  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    this.fileIndex.clear();
    this.watchedDirs.clear();
    this.suggestions.clear();
    this.allowedPaths.clear();
    
    try {
      if (fs.existsSync(this.indexPath)) {
        await fs.promises.unlink(this.indexPath);
      }
    } catch (error) {
      console.error('[FileIntelligence] Error clearing cache:', error);
    }
    
    this.emit('cacheCleared');
  }
}

// Export singleton
export const fileIntelligence = FileIntelligenceService.getInstance();
export default fileIntelligence;
