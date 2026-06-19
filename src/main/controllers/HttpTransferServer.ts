/**
 * DEX Platform - HTTP Transfer Server
 * Local network file sharing via HTTP server + QR code + web UI
 * Receivers scan QR or visit URL to download files; senders get accept/reject flow.
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

interface SharedFile {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  addedAt: number;
  downloadCount: number;
  expiresAt: number; // auto-expire after 30 min
}

interface PendingUpload {
  id: string;
  fileName: string;
  fileSize: number;
  senderIp: string;
  status: 'pending' | 'accepted' | 'rejected';
  resolveAccept?: (accept: boolean) => void;
}

// ===========================================================================
// QR CODE GENERATOR (minimal inline -- no external dependency)
// ===========================================================================

function generateQRCodeSVG(data: string, size: number = 200): string {
  // Simplified QR-like representation using a data URI approach
  // For production, would use a proper QR library. This generates a scannable-looking visual.
  const encoded = encodeURIComponent(data);
  // We'll return an SVG that displays the URL as text + a visual pattern
  // In practice, the renderer will use a canvas-based QR generator
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="white"/>
    <text x="${size/2}" y="${size/2}" text-anchor="middle" font-family="monospace" font-size="8" fill="black">${data}</text>
  </svg>`;
}

// QR code as a simple text-based data URL for the renderer to use with a proper QR library
function getQRData(url: string): string {
  return url; // The renderer will generate the actual QR image from this URL
}

// ===========================================================================
// MIME TYPE MAP
// ===========================================================================

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ===========================================================================
// WEB UI HTML (served inline to receivers)
// ===========================================================================

function generateWebUI(files: SharedFile[], hostName: string): string {
  const fileListHTML = files.map(f => `
    <div class="file-card">
      <div class="file-icon">${getFileLabel(f.name)}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-size">${formatFileSize(f.size)}</div>
      </div>
      <a href="/download/${f.id}" class="download-btn" download="${escapeHtml(f.name)}">Download</a>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DEX Transfer - ${escapeHtml(hostName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%); color: #e4e4e7; min-height: 100vh; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { text-align: center; padding: 30px 0; }
    .header h1 { font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header p { color: #71717a; margin-top: 8px; font-size: 14px; }
    .file-card { display: flex; align-items: center; gap: 14px; padding: 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; margin-bottom: 10px; backdrop-filter: blur(10px); }
    .file-icon { font-size: 28px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(59,130,246,0.1); border-radius: 8px; }
    .file-info { flex: 1; min-width: 0; }
    .file-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-size { color: #71717a; font-size: 12px; margin-top: 2px; }
    .download-btn { padding: 8px 18px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; white-space: nowrap; transition: all 0.2s; }
    .download-btn:hover { background: linear-gradient(135deg, #60a5fa, #3b82f6); box-shadow: 0 4px 16px rgba(59,130,246,0.4); }
    .upload-section { margin-top: 30px; padding: 24px; background: rgba(255,255,255,0.03); border: 2px dashed rgba(255,255,255,0.1); border-radius: 12px; text-align: center; }
    .upload-section h3 { margin-bottom: 12px; font-size: 16px; }
    .upload-btn { display: inline-block; padding: 10px 24px; background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.2s; }
    .upload-btn:hover { background: rgba(34,197,94,0.3); }
    .empty { text-align: center; padding: 60px 20px; color: #52525b; }
    .footer { text-align: center; padding: 20px; color: #3f3f46; font-size: 11px; }
    .status { display: inline-block; padding: 4px 10px; background: rgba(34,197,94,0.15); color: #22c55e; border-radius: 100px; font-size: 11px; font-weight: 600; margin-top: 8px; }
    @media (max-width: 480px) { body { padding: 12px; } .file-card { padding: 12px; gap: 10px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DEX Transfer</h1>
      <p>Shared by ${escapeHtml(hostName)}</p>
      <div class="status">Connected</div>
    </div>
    ${files.length === 0 ? '<div class="empty"><p>No files shared yet.</p></div>' : fileListHTML}
    <div class="upload-section">
      <h3>Send Files Back</h3>
      <p style="color:#71717a;font-size:13px;margin-bottom:14px">Select files to send to ${escapeHtml(hostName)}</p>
      <label class="upload-btn">
        Choose Files
        <input type="file" multiple style="display:none" onchange="uploadFiles(this.files)">
      </label>
      <div id="upload-status" style="margin-top:12px;font-size:12px;color:#71717a"></div>
    </div>
    <div class="footer">Files expire in 30 minutes</div>
  </div>
  <script>
    async function uploadFiles(files) {
      const status = document.getElementById('upload-status');
      for (const file of files) {
        status.textContent = 'Uploading ' + file.name + '...';
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/upload', { method: 'POST', body: formData });
          const json = await res.json();
          if (json.status === 'pending') {
            status.textContent = 'Waiting for ' + '${escapeHtml(hostName)}' + ' to accept...';
            const poll = setInterval(async () => {
              const check = await fetch('/upload-status/' + json.id);
              const result = await check.json();
              if (result.status === 'accepted') { clearInterval(poll); status.textContent = '\\u2713 ' + file.name + ' accepted!'; status.style.color = '#22c55e'; }
              else if (result.status === 'rejected') { clearInterval(poll); status.textContent = '\\u2717 ' + file.name + ' rejected'; status.style.color = '#ef4444'; }
            }, 1000);
          } else {
            status.textContent = json.message || 'Upload failed';
          }
        } catch (e) { status.textContent = 'Error: ' + e.message; }
      }
    }
  </script>
</body>
</html>`;
}

function getFileLabel(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) return '[IMG]';
  if (['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'].includes(ext)) return '[AUD]';
  if (['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext)) return '[VID]';
  if (['.pdf'].includes(ext)) return '[PDF]';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '[ZIP]';
  if (['.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) return '[DOC]';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return '[XLS]';
  return '[FILE]';
}

import { escapeHtml } from '../../shared/util/text';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

// ===========================================================================
// GET LOCAL IP
// ===========================================================================

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ===========================================================================
// HTTP TRANSFER SERVER CLASS
// ===========================================================================

class HttpTransferServer {
  private server: http.Server | null = null;
  private sharedFiles: Map<string, SharedFile> = new Map();
  private pendingUploads: Map<string, PendingUpload> = new Map();
  private port = 47633;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.registerHandlers();
    // Clean expired files every 5 minutes
    setInterval(() => this.cleanExpired(), 300000);
  }

  private registerHandlers(): void {
    // Start the HTTP server
    ipcMain.handle('http-transfer:start', async () => {
      return this.startServer();
    });

    // Stop the HTTP server
    ipcMain.handle('http-transfer:stop', async () => {
      return this.stopServer();
    });

    // Share files (add to the served file list)
    ipcMain.handle('http-transfer:share', async (_, filePaths: string[]) => {
      return this.shareFiles(filePaths);
    });

    // Remove a shared file
    ipcMain.handle('http-transfer:unshare', async (_, fileId: string) => {
      this.sharedFiles.delete(fileId);
      return { success: true };
    });

    // Get server info (URL, QR data, shared files)
    ipcMain.handle('http-transfer:info', async () => {
      return this.getServerInfo();
    });

    // Accept/reject an incoming upload
    ipcMain.handle('http-transfer:accept-upload', async (_, uploadId: string, accept: boolean) => {
      return this.resolveUpload(uploadId, accept);
    });

    // Get pending uploads
    ipcMain.handle('http-transfer:pending-uploads', async () => {
      return Array.from(this.pendingUploads.values())
        .filter(u => u.status === 'pending')
        .map(({ id, fileName, fileSize, senderIp, status }) => ({ id, fileName, fileSize, senderIp, status }));
    });

    // Share files via file picker dialog
    ipcMain.handle('http-transfer:pick-and-share', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select files to share',
      });
      if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Cancelled' };
      return this.shareFiles(result.filePaths);
    });
  }

  private async startServer(): Promise<{ success: boolean; url?: string; qrData?: string; error?: string }> {
    if (this.server) {
      return { success: true, url: this.getURL(), qrData: getQRData(this.getURL()) };
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        log.error('[HttpTransfer] Server error:', err);
        if (err.code === 'EADDRINUSE') {
          this.port++;
          this.server?.listen(this.port);
        } else {
          resolve({ success: false, error: err.message });
        }
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        const url = this.getURL();
        log.info(`[HttpTransfer] Server running at ${url}`);
        resolve({ success: true, url, qrData: getQRData(url) });
      });
    });
  }

  private stopServer(): { success: boolean } {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.sharedFiles.clear();
      log.info('[HttpTransfer] Server stopped');
    }
    return { success: true };
  }

  private getURL(): string {
    return `http://${getLocalIP()}:${this.port}`;
  }

  private getServerInfo() {
    const isRunning = this.server !== null;
    return {
      isRunning,
      url: isRunning ? this.getURL() : null,
      qrData: isRunning ? getQRData(this.getURL()) : null,
      localIP: getLocalIP(),
      port: this.port,
      sharedFiles: Array.from(this.sharedFiles.values()).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        downloadCount: f.downloadCount,
        addedAt: f.addedAt,
      })),
      hostname: os.hostname(),
    };
  }

  private async shareFiles(filePaths: string[]): Promise<{ success: boolean; fileIds: string[] }> {
    const fileIds: string[] = [];
    
    for (const filePath of filePaths) {
      try {
        const stat = await fsp.stat(filePath);
        const id = crypto.randomBytes(8).toString('hex');
        const file: SharedFile = {
          id,
          name: path.basename(filePath),
          path: filePath,
          size: stat.size,
          mimeType: getMimeType(filePath),
          addedAt: Date.now(),
          downloadCount: 0,
          expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        };
        this.sharedFiles.set(id, file);
        fileIds.push(id);
      } catch (err) {
        log.warn(`[HttpTransfer] Could not share file ${filePath}:`, err);
      }
    }

    // Notify renderer of updated file list
    this.notifyRenderer('http-transfer:files-updated', this.getServerInfo());

    // Auto-start server if not running
    if (!this.server && fileIds.length > 0) {
      await this.startServer();
    }

    return { success: true, fileIds };
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    
    // CORS headers for mobile browsers
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:47633');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = url.pathname;

    if (pathname === '/' && req.method === 'GET') {
      // Serve the web UI
      const files = Array.from(this.sharedFiles.values()).filter(f => f.expiresAt > Date.now());
      const html = generateWebUI(files, os.hostname());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (pathname.startsWith('/download/') && req.method === 'GET') {
      const fileId = pathname.split('/')[2];
      const file = this.sharedFiles.get(fileId);
      
      if (!file || file.expiresAt < Date.now()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found or expired' }));
        return;
      }

      // Stream the file
      try {
        const stat = fs.statSync(file.path);
        res.writeHead(200, {
          'Content-Type': file.mimeType,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
        });
        const stream = fs.createReadStream(file.path);
        stream.pipe(res);
        file.downloadCount++;
        
        // Notify renderer
        this.notifyRenderer('http-transfer:download', { fileId: file.id, fileName: file.name, senderIp: req.socket.remoteAddress });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File read error' }));
      }
      return;
    }

    if (pathname === '/upload' && req.method === 'POST') {
      this.handleUpload(req, res);
      return;
    }

    if (pathname.startsWith('/upload-status/') && req.method === 'GET') {
      const uploadId = pathname.split('/')[2];
      const upload = this.pendingUploads.get(uploadId);
      if (!upload) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upload not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: upload.status }));
      return;
    }

    // API: list shared files as JSON
    if (pathname === '/api/files' && req.method === 'GET') {
      const files = Array.from(this.sharedFiles.values())
        .filter(f => f.expiresAt > Date.now())
        .map(f => ({ id: f.id, name: f.name, size: f.size, mimeType: f.mimeType }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private handleUpload(req: http.IncomingMessage, res: http.ServerResponse): void {
    const contentType = req.headers['content-type'] || '';
    
    // Parse multipart boundary
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid multipart request' }));
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB limit
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_UPLOAD_SIZE) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File too large (500MB limit)' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      
      // Simple multipart parser: extract filename and file data
      const bodyStr = body.toString('binary');
      const filenameMatch = bodyStr.match(/filename="([^"]+)"/);
      // Sanitize filename: strip path components to prevent directory traversal
      const rawName = filenameMatch ? filenameMatch[1] : `upload-${Date.now()}`;
      const fileName = path.basename(rawName).replace(/[<>:"|?*\x00-\x1f]/g, '_') || `upload-${Date.now()}`;
      
      // Find the file data between the headers and the boundary
      const headerEnd = bodyStr.indexOf('\r\n\r\n');
      const boundaryEnd = bodyStr.lastIndexOf(`--${boundary}`);
      if (headerEnd === -1 || boundaryEnd === -1) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed upload' }));
        return;
      }
      
      const fileData = body.slice(headerEnd + 4, boundaryEnd - 2); // -2 for trailing \r\n
      
      // Create pending upload and ask the user
      const uploadId = crypto.randomBytes(8).toString('hex');
      const pending: PendingUpload = {
        id: uploadId,
        fileName,
        fileSize: fileData.length,
        senderIp: req.socket.remoteAddress || 'unknown',
        status: 'pending',
      };

      // Create a promise that resolves when user accepts/rejects
      const acceptPromise = new Promise<boolean>((resolve) => {
        pending.resolveAccept = resolve;
        // Auto-reject after 60 seconds
        setTimeout(() => {
          if (pending.status === 'pending') {
            pending.status = 'rejected';
            resolve(false);
          }
        }, 60000);
      });

      this.pendingUploads.set(uploadId, pending);

      // Notify the renderer for accept/reject UI
      this.notifyRenderer('http-transfer:upload-request', {
        id: uploadId,
        fileName,
        fileSize: fileData.length,
        senderIp: pending.senderIp,
      });

      // Respond immediately with pending status
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'pending', id: uploadId }));

      // Handle the accept/reject asynchronously
      acceptPromise.then(async (accepted) => {
        if (accepted) {
          try {
            const downloadsDir = app.getPath('downloads');
            const savePath = path.join(downloadsDir, fileName);
            await fsp.writeFile(savePath, fileData);
            log.info(`[HttpTransfer] Accepted upload: ${fileName} -> ${savePath}`);
            this.notifyRenderer('http-transfer:upload-complete', { id: uploadId, fileName, savePath });
          } catch (err) {
            log.error('[HttpTransfer] Failed to save upload:', err);
          }
        } else {
          log.info(`[HttpTransfer] Rejected upload: ${fileName}`);
        }
      });
    });
  }

  private resolveUpload(uploadId: string, accept: boolean): { success: boolean } {
    const upload = this.pendingUploads.get(uploadId);
    if (!upload || upload.status !== 'pending') return { success: false };
    
    upload.status = accept ? 'accepted' : 'rejected';
    upload.resolveAccept?.(accept);
    return { success: true };
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [id, file] of this.sharedFiles) {
      if (file.expiresAt < now) {
        this.sharedFiles.delete(id);
      }
    }
    for (const [id, upload] of this.pendingUploads) {
      if (upload.status !== 'pending') {
        this.pendingUploads.delete(id);
      }
    }
  }

  private notifyRenderer(channel: string, data: any): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send(channel, data);
        }
      });
    } catch (err) { log.warn('[HttpTransfer] Broadcast failed:', err); }
  }
}

export const httpTransferServer = new HttpTransferServer();
