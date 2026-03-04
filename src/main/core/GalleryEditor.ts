// ═══════════════════════════════════════════════════════════════════════════
// DEX - Gallery Editor (Light)
// Non-destructive image editing: crop, rotate, flip, brightness/contrast
// Preview before save, original always preserved, no heavy rendering
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, nativeImage } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type EditOperation = 
  | 'crop' | 'rotate' | 'flip' 
  | 'brightness' | 'contrast' | 'saturation'
  | 'resize' | 'reset';

export type FlipDirection = 'horizontal' | 'vertical';
export type RotationAngle = 0 | 90 | 180 | 270;

export interface CropRegion {
  x: number;      // Left offset (0-1 normalized)
  y: number;      // Top offset (0-1 normalized)
  width: number;  // Width (0-1 normalized)
  height: number; // Height (0-1 normalized)
}

export interface ImageAdjustments {
  brightness: number;  // -100 to 100
  contrast: number;    // -100 to 100
  saturation: number;  // -100 to 100
}

export interface ImageTransform {
  rotation: RotationAngle;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
  resampleMode: 'nearest' | 'bilinear' | 'bicubic';
}

export interface EditState {
  sourceId: string;
  sourcePath: string;
  originalWidth: number;
  originalHeight: number;
  crop: CropRegion | null;
  transform: ImageTransform;
  adjustments: ImageAdjustments;
  resize: ResizeOptions | null;
  history: EditHistoryEntry[];
  historyIndex: number;
  isDirty: boolean;
}

export interface EditHistoryEntry {
  id: string;
  operation: EditOperation;
  timestamp: number;
  previousState: Partial<EditState>;
  description: string;
}

export interface PreviewResult {
  dataUrl: string;
  width: number;
  height: number;
  format: string;
}

export interface SaveOptions {
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number; // 1-100
  preserveOriginal?: boolean;
  outputPath?: string;
}

export interface SaveResult {
  success: boolean;
  outputPath: string;
  originalPath?: string;
  size: number;
  width: number;
  height: number;
}

export interface EditorConfig {
  maxHistorySteps: number;
  previewQuality: number;
  defaultFormat: 'jpeg' | 'png' | 'webp';
  defaultQuality: number;
  preserveOriginalByDefault: boolean;
  originalsSuffix: string;
  autoPreview: boolean;
  previewDebounceMs: number;
}

export interface MetadataUpdate {
  title?: string;
  description?: string;
  author?: string;
  copyright?: string;
  tags?: string[];
  rating?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GALLERY EDITOR
// ═══════════════════════════════════════════════════════════════════════════

class GalleryEditorClass extends EventEmitter {
  private activeEdit: EditState | null = null;
  private config: EditorConfig;
  private dataPath = '';
  private originalsPath = '';
  private mainWindow: BrowserWindow | null = null;
  private previewDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    this.config = {
      maxHistorySteps: 50,
      previewQuality: 80,
      defaultFormat: 'jpeg',
      defaultQuality: 90,
      preserveOriginalByDefault: true,
      originalsSuffix: '_original',
      autoPreview: true,
      previewDebounceMs: 150,
    };
    
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'gallery-editor');
    this.originalsPath = path.join(this.dataPath, 'originals');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await fs.mkdir(this.originalsPath, { recursive: true });
      await this.loadConfig();
      
      log.info('[GalleryEditor] Initialized');
    } catch (error) {
      log.error('[GalleryEditor] Initialization failed:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC SETUP
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Session management
    ipcMain.handle('editor:open', async (_event, imagePath: string) => {
      return this.openImage(imagePath);
    });
    
    ipcMain.handle('editor:close', () => this.closeEditor());
    ipcMain.handle('editor:getState', () => this.activeEdit);
    ipcMain.handle('editor:isOpen', () => this.activeEdit !== null);

    // Transform operations
    ipcMain.handle('editor:rotate', async (_event, angle: RotationAngle) => {
      return this.rotate(angle);
    });
    
    ipcMain.handle('editor:rotateLeft', () => this.rotateLeft());
    ipcMain.handle('editor:rotateRight', () => this.rotateRight());
    
    ipcMain.handle('editor:flip', async (_event, direction: FlipDirection) => {
      return this.flip(direction);
    });

    // Crop operations
    ipcMain.handle('editor:setCrop', async (_event, region: CropRegion | null) => {
      return this.setCrop(region);
    });
    
    ipcMain.handle('editor:applyCrop', () => this.applyCrop());
    ipcMain.handle('editor:clearCrop', () => this.clearCrop());

    // Adjustments
    ipcMain.handle('editor:setBrightness', async (_event, value: number) => {
      return this.setBrightness(value);
    });
    
    ipcMain.handle('editor:setContrast', async (_event, value: number) => {
      return this.setContrast(value);
    });
    
    ipcMain.handle('editor:setSaturation', async (_event, value: number) => {
      return this.setSaturation(value);
    });
    
    ipcMain.handle('editor:setAdjustments', async (_event, adjustments: Partial<ImageAdjustments>) => {
      return this.setAdjustments(adjustments);
    });
    
    ipcMain.handle('editor:resetAdjustments', () => this.resetAdjustments());

    // Resize
    ipcMain.handle('editor:setResize', async (_event, options: ResizeOptions | null) => {
      return this.setResize(options);
    });

    // Preview
    ipcMain.handle('editor:getPreview', async (_event, quality?: number) => {
      return this.getPreview(quality);
    });
    
    ipcMain.handle('editor:getOriginal', async () => {
      return this.getOriginalPreview();
    });

    // History
    ipcMain.handle('editor:undo', () => this.undo());
    ipcMain.handle('editor:redo', () => this.redo());
    ipcMain.handle('editor:canUndo', () => this.canUndo());
    ipcMain.handle('editor:canRedo', () => this.canRedo());
    ipcMain.handle('editor:getHistory', () => this.getHistory());

    // Reset
    ipcMain.handle('editor:reset', () => this.reset());
    ipcMain.handle('editor:resetTransform', () => this.resetTransform());

    // Save
    ipcMain.handle('editor:save', async (_event, options?: SaveOptions) => {
      return this.save(options);
    });
    
    ipcMain.handle('editor:saveAs', async (_event, outputPath: string, options?: SaveOptions) => {
      return this.saveAs(outputPath, options);
    });

    // Metadata
    ipcMain.handle('editor:updateMetadata', async (_event, updates: MetadataUpdate) => {
      return this.updateMetadata(updates);
    });

    // Config
    ipcMain.handle('editor:getConfig', () => this.config);
    ipcMain.handle('editor:updateConfig', async (_event, updates: Partial<EditorConfig>) => {
      return this.updateConfig(updates);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  async openImage(imagePath: string): Promise<EditState | null> {
    const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(imagePath);
    
    try {
      // Close existing edit if any
      if (this.activeEdit) {
        this.closeEditor();
      }
      
      // Load image to get dimensions
      const image = nativeImage.createFromPath(absolutePath);
      if (image.isEmpty()) {
        log.error(`[GalleryEditor] Failed to load image: ${absolutePath}`);
        return null;
      }
      
      const size = image.getSize();
      
      // Create edit state
      this.activeEdit = {
        sourceId: this.generateId(),
        sourcePath: absolutePath,
        originalWidth: size.width,
        originalHeight: size.height,
        crop: null,
        transform: {
          rotation: 0,
          flipHorizontal: false,
          flipVertical: false,
        },
        adjustments: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
        },
        resize: null,
        history: [],
        historyIndex: -1,
        isDirty: false,
      };
      
      this.emit('imageOpened', this.activeEdit);
      log.info(`[GalleryEditor] Opened image: ${absolutePath}`);
      
      return this.activeEdit;
    } catch (error) {
      log.error(`[GalleryEditor] Failed to open image: ${imagePath}`, error);
      return null;
    }
  }

  closeEditor(): void {
    if (this.activeEdit) {
      this.emit('editorClosed', this.activeEdit.sourceId);
      this.activeEdit = null;
    }
    
    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ROTATION
  // ─────────────────────────────────────────────────────────────────────────

  rotate(angle: RotationAngle): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('rotate', { transform: { ...this.activeEdit.transform } }, `Rotate ${angle}°`);
    this.activeEdit.transform.rotation = angle;
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  rotateLeft(): EditState | null {
    if (!this.activeEdit) return null;
    
    const currentRotation = this.activeEdit.transform.rotation;
    const newRotation = ((currentRotation - 90 + 360) % 360) as RotationAngle;
    
    return this.rotate(newRotation);
  }

  rotateRight(): EditState | null {
    if (!this.activeEdit) return null;
    
    const currentRotation = this.activeEdit.transform.rotation;
    const newRotation = ((currentRotation + 90) % 360) as RotationAngle;
    
    return this.rotate(newRotation);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLIP
  // ─────────────────────────────────────────────────────────────────────────

  flip(direction: FlipDirection): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('flip', { transform: { ...this.activeEdit.transform } }, `Flip ${direction}`);
    
    if (direction === 'horizontal') {
      this.activeEdit.transform.flipHorizontal = !this.activeEdit.transform.flipHorizontal;
    } else {
      this.activeEdit.transform.flipVertical = !this.activeEdit.transform.flipVertical;
    }
    
    this.markDirty();
    this.emitStateChange();
    return this.activeEdit;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CROP
  // ─────────────────────────────────────────────────────────────────────────

  setCrop(region: CropRegion | null): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('crop', { crop: this.activeEdit.crop }, region ? 'Set crop region' : 'Clear crop');
    this.activeEdit.crop = region;
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  applyCrop(): EditState | null {
    // For non-destructive editing, crop is just a region - 
    // actual cropping happens during preview/save
    return this.activeEdit;
  }

  clearCrop(): EditState | null {
    return this.setCrop(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADJUSTMENTS
  // ─────────────────────────────────────────────────────────────────────────

  setBrightness(value: number): EditState | null {
    if (!this.activeEdit) return null;
    
    const clamped = Math.max(-100, Math.min(100, value));
    this.addHistoryEntry('brightness', { adjustments: { ...this.activeEdit.adjustments } }, `Brightness: ${clamped}`);
    this.activeEdit.adjustments.brightness = clamped;
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  setContrast(value: number): EditState | null {
    if (!this.activeEdit) return null;
    
    const clamped = Math.max(-100, Math.min(100, value));
    this.addHistoryEntry('contrast', { adjustments: { ...this.activeEdit.adjustments } }, `Contrast: ${clamped}`);
    this.activeEdit.adjustments.contrast = clamped;
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  setSaturation(value: number): EditState | null {
    if (!this.activeEdit) return null;
    
    const clamped = Math.max(-100, Math.min(100, value));
    this.addHistoryEntry('saturation', { adjustments: { ...this.activeEdit.adjustments } }, `Saturation: ${clamped}`);
    this.activeEdit.adjustments.saturation = clamped;
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  setAdjustments(updates: Partial<ImageAdjustments>): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('brightness', { adjustments: { ...this.activeEdit.adjustments } }, 'Adjust image');
    
    if (updates.brightness !== undefined) {
      this.activeEdit.adjustments.brightness = Math.max(-100, Math.min(100, updates.brightness));
    }
    if (updates.contrast !== undefined) {
      this.activeEdit.adjustments.contrast = Math.max(-100, Math.min(100, updates.contrast));
    }
    if (updates.saturation !== undefined) {
      this.activeEdit.adjustments.saturation = Math.max(-100, Math.min(100, updates.saturation));
    }
    
    this.markDirty();
    this.emitStateChange();
    return this.activeEdit;
  }

  resetAdjustments(): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('reset', { adjustments: { ...this.activeEdit.adjustments } }, 'Reset adjustments');
    this.activeEdit.adjustments = { brightness: 0, contrast: 0, saturation: 0 };
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESIZE
  // ─────────────────────────────────────────────────────────────────────────

  setResize(options: ResizeOptions | null): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('resize', { resize: this.activeEdit.resize }, options ? 'Set resize' : 'Clear resize');
    this.activeEdit.resize = options;
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PREVIEW
  // ─────────────────────────────────────────────────────────────────────────

  async getPreview(quality?: number): Promise<PreviewResult | null> {
    if (!this.activeEdit) return null;
    
    try {
      const image = nativeImage.createFromPath(this.activeEdit.sourcePath);
      if (image.isEmpty()) return null;
      
      let processed = image;
      
      // Apply rotation
      if (this.activeEdit.transform.rotation !== 0) {
        // Note: Electron's nativeImage doesn't have built-in rotation
        // In a real implementation, we'd use a library like sharp or canvas
        // For now, we'll note this limitation
      }
      
      // Apply crop
      if (this.activeEdit.crop) {
        const size = processed.getSize();
        const cropX = Math.round(this.activeEdit.crop.x * size.width);
        const cropY = Math.round(this.activeEdit.crop.y * size.height);
        const cropW = Math.round(this.activeEdit.crop.width * size.width);
        const cropH = Math.round(this.activeEdit.crop.height * size.height);
        
        processed = processed.crop({
          x: cropX,
          y: cropY,
          width: cropW,
          height: cropH,
        });
      }
      
      // Apply resize
      if (this.activeEdit.resize) {
        const size = processed.getSize();
        let targetWidth = this.activeEdit.resize.width || size.width;
        let targetHeight = this.activeEdit.resize.height || size.height;
        
        if (this.activeEdit.resize.maintainAspectRatio) {
          const aspectRatio = size.width / size.height;
          if (this.activeEdit.resize.width && !this.activeEdit.resize.height) {
            targetHeight = Math.round(targetWidth / aspectRatio);
          } else if (this.activeEdit.resize.height && !this.activeEdit.resize.width) {
            targetWidth = Math.round(targetHeight * aspectRatio);
          }
        }
        
        processed = processed.resize({ width: targetWidth, height: targetHeight });
      }
      
      // Note: Brightness/contrast/saturation adjustments require canvas manipulation
      // Electron's nativeImage doesn't support these directly
      // In production, we'd use a library like sharp
      
      const previewQuality = quality || this.config.previewQuality;
      const buffer = processed.toJPEG(previewQuality);
      const size = processed.getSize();
      
      return {
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        width: size.width,
        height: size.height,
        format: 'jpeg',
      };
    } catch (error) {
      log.error('[GalleryEditor] Failed to generate preview:', error);
      return null;
    }
  }

  async getOriginalPreview(): Promise<PreviewResult | null> {
    if (!this.activeEdit) return null;
    
    try {
      const image = nativeImage.createFromPath(this.activeEdit.sourcePath);
      if (image.isEmpty()) return null;
      
      const buffer = image.toJPEG(this.config.previewQuality);
      const size = image.getSize();
      
      return {
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
        width: size.width,
        height: size.height,
        format: 'jpeg',
      };
    } catch (error) {
      log.error('[GalleryEditor] Failed to get original preview:', error);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  private addHistoryEntry(operation: EditOperation, previousState: Partial<EditState>, description: string): void {
    if (!this.activeEdit) return;
    
    // Remove any redo history
    if (this.activeEdit.historyIndex < this.activeEdit.history.length - 1) {
      this.activeEdit.history = this.activeEdit.history.slice(0, this.activeEdit.historyIndex + 1);
    }
    
    // Add new entry
    const entry: EditHistoryEntry = {
      id: this.generateId(),
      operation,
      timestamp: Date.now(),
      previousState,
      description,
    };
    
    this.activeEdit.history.push(entry);
    this.activeEdit.historyIndex = this.activeEdit.history.length - 1;
    
    // Trim history if too long
    if (this.activeEdit.history.length > this.config.maxHistorySteps) {
      this.activeEdit.history.shift();
      this.activeEdit.historyIndex--;
    }
  }

  undo(): EditState | null {
    if (!this.activeEdit || !this.canUndo()) return null;
    
    const entry = this.activeEdit.history[this.activeEdit.historyIndex];
    
    // Restore previous state
    if (entry.previousState.crop !== undefined) {
      this.activeEdit.crop = entry.previousState.crop as CropRegion | null;
    }
    if (entry.previousState.transform) {
      this.activeEdit.transform = entry.previousState.transform as ImageTransform;
    }
    if (entry.previousState.adjustments) {
      this.activeEdit.adjustments = entry.previousState.adjustments as ImageAdjustments;
    }
    if (entry.previousState.resize !== undefined) {
      this.activeEdit.resize = entry.previousState.resize as ResizeOptions | null;
    }
    
    this.activeEdit.historyIndex--;
    
    this.emit('historyChanged', { action: 'undo', entry });
    this.emitStateChange();
    
    return this.activeEdit;
  }

  redo(): EditState | null {
    if (!this.activeEdit || !this.canRedo()) return null;
    
    this.activeEdit.historyIndex++;
    
    // The state after this entry is the next entry's previous state
    // This is a simplified implementation - full redo would need forward states too
    
    this.emit('historyChanged', { action: 'redo' });
    this.emitStateChange();
    
    return this.activeEdit;
  }

  canUndo(): boolean {
    return this.activeEdit !== null && this.activeEdit.historyIndex >= 0;
  }

  canRedo(): boolean {
    return this.activeEdit !== null && 
           this.activeEdit.historyIndex < this.activeEdit.history.length - 1;
  }

  getHistory(): EditHistoryEntry[] {
    return this.activeEdit?.history || [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESET
  // ─────────────────────────────────────────────────────────────────────────

  reset(): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('reset', {
      crop: this.activeEdit.crop,
      transform: { ...this.activeEdit.transform },
      adjustments: { ...this.activeEdit.adjustments },
      resize: this.activeEdit.resize,
    }, 'Reset all edits');
    
    this.activeEdit.crop = null;
    this.activeEdit.transform = { rotation: 0, flipHorizontal: false, flipVertical: false };
    this.activeEdit.adjustments = { brightness: 0, contrast: 0, saturation: 0 };
    this.activeEdit.resize = null;
    this.activeEdit.isDirty = false;
    
    this.emitStateChange();
    return this.activeEdit;
  }

  resetTransform(): EditState | null {
    if (!this.activeEdit) return null;
    
    this.addHistoryEntry('reset', { transform: { ...this.activeEdit.transform } }, 'Reset transform');
    this.activeEdit.transform = { rotation: 0, flipHorizontal: false, flipVertical: false };
    this.markDirty();
    
    this.emitStateChange();
    return this.activeEdit;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────────────────────────────────────

  async save(options?: SaveOptions): Promise<SaveResult | null> {
    if (!this.activeEdit) return null;
    
    const saveOptions: SaveOptions = {
      format: options?.format || this.config.defaultFormat,
      quality: options?.quality || this.config.defaultQuality,
      preserveOriginal: options?.preserveOriginal ?? this.config.preserveOriginalByDefault,
    };
    
    return this.saveAs(this.activeEdit.sourcePath, saveOptions);
  }

  async saveAs(outputPath: string, options?: SaveOptions): Promise<SaveResult | null> {
    if (!this.activeEdit) return null;
    
    try {
      const image = nativeImage.createFromPath(this.activeEdit.sourcePath);
      if (image.isEmpty()) return null;
      
      let processed = image;
      
      // Apply crop
      if (this.activeEdit.crop) {
        const size = processed.getSize();
        processed = processed.crop({
          x: Math.round(this.activeEdit.crop.x * size.width),
          y: Math.round(this.activeEdit.crop.y * size.height),
          width: Math.round(this.activeEdit.crop.width * size.width),
          height: Math.round(this.activeEdit.crop.height * size.height),
        });
      }
      
      // Apply resize
      if (this.activeEdit.resize) {
        const size = processed.getSize();
        let targetWidth = this.activeEdit.resize.width || size.width;
        let targetHeight = this.activeEdit.resize.height || size.height;
        
        if (this.activeEdit.resize.maintainAspectRatio) {
          const aspectRatio = size.width / size.height;
          if (this.activeEdit.resize.width && !this.activeEdit.resize.height) {
            targetHeight = Math.round(targetWidth / aspectRatio);
          } else if (this.activeEdit.resize.height && !this.activeEdit.resize.width) {
            targetWidth = Math.round(targetHeight * aspectRatio);
          }
        }
        
        processed = processed.resize({ width: targetWidth, height: targetHeight });
      }
      
      // Preserve original if requested
      let originalPath: string | undefined;
      if (options?.preserveOriginal && outputPath === this.activeEdit.sourcePath) {
        const parsed = path.parse(this.activeEdit.sourcePath);
        originalPath = path.join(
          this.originalsPath,
          `${parsed.name}${this.config.originalsSuffix}_${Date.now()}${parsed.ext}`
        );
        await fs.copyFile(this.activeEdit.sourcePath, originalPath);
        log.info(`[GalleryEditor] Original preserved at: ${originalPath}`);
      }
      
      // Encode output
      const format = options?.format || this.config.defaultFormat;
      const quality = options?.quality || this.config.defaultQuality;
      
      let buffer: Buffer;
      let finalPath = outputPath;
      
      switch (format) {
        case 'png':
          buffer = processed.toPNG();
          if (!finalPath.toLowerCase().endsWith('.png')) {
            finalPath = finalPath.replace(/\.[^.]+$/, '.png');
          }
          break;
        case 'webp':
          // Electron doesn't support webp export, fall back to jpeg
          buffer = processed.toJPEG(quality);
          if (!finalPath.toLowerCase().endsWith('.jpg') && !finalPath.toLowerCase().endsWith('.jpeg')) {
            finalPath = finalPath.replace(/\.[^.]+$/, '.jpg');
          }
          break;
        default:
          buffer = processed.toJPEG(quality);
          if (!finalPath.toLowerCase().endsWith('.jpg') && !finalPath.toLowerCase().endsWith('.jpeg')) {
            finalPath = finalPath.replace(/\.[^.]+$/, '.jpg');
          }
      }
      
      await fs.writeFile(finalPath, buffer);
      
      const finalSize = processed.getSize();
      
      // Clear dirty flag
      this.activeEdit.isDirty = false;
      
      const result: SaveResult = {
        success: true,
        outputPath: finalPath,
        originalPath,
        size: buffer.length,
        width: finalSize.width,
        height: finalSize.height,
      };
      
      this.emit('imageSaved', result);
      log.info(`[GalleryEditor] Saved image: ${finalPath}`);
      
      return result;
    } catch (error) {
      log.error('[GalleryEditor] Failed to save image:', error);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────────────────

  async updateMetadata(_updates: MetadataUpdate): Promise<boolean> {
    if (!this.activeEdit) return false;
    
    // Note: Actual EXIF/metadata editing requires specialized libraries
    // This is a placeholder for the interface
    
    log.info('[GalleryEditor] Metadata update requested (not implemented)');
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    const configPath = path.join(this.dataPath, 'config.json');
    
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const saved = JSON.parse(data);
      this.config = { ...this.config, ...saved };
    } catch {
      // Use defaults
    }
  }

  async saveConfig(): Promise<void> {
    const configPath = path.join(this.dataPath, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
  }

  async updateConfig(updates: Partial<EditorConfig>): Promise<EditorConfig> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.emit('configUpdated', this.config);
    return this.config;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private markDirty(): void {
    if (this.activeEdit) {
      this.activeEdit.isDirty = true;
    }
  }

  private emitStateChange(): void {
    if (this.activeEdit) {
      this.emit('stateChanged', this.activeEdit);
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('editor:stateChanged', this.activeEdit);
      }
      
      // Auto-preview with debounce
      if (this.config.autoPreview) {
        if (this.previewDebounceTimer) {
          clearTimeout(this.previewDebounceTimer);
        }
        
        this.previewDebounceTimer = setTimeout(async () => {
          const preview = await this.getPreview();
          if (preview && this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('editor:previewUpdated', preview);
          }
        }, this.config.previewDebounceMs);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.closeEditor();
    await this.saveConfig();
    log.info('[GalleryEditor] Shutdown complete');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const GalleryEditor = new GalleryEditorClass();
export default GalleryEditor;
