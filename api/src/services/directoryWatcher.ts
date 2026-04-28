// Directory Watcher Service
// Monitors bound directories and auto-imports files to asset library

import { watch, FSWatcher } from 'fs';
import { join, basename, extname, relative } from 'path';
import { readdir, stat, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { query } from '../db/connection.js';
import { AssetService } from './asset.js';

interface DirectoryBinding {
  id: string;
  name: string;
  path: string;
  theme_id: string | null;
  auto_import: boolean;
  include_subdirs: boolean;
  file_patterns: string[];
  is_active: boolean;
}

interface TrackedFile {
  id: string;
  binding_id: string;
  file_path: string;
  file_hash: string;
  asset_id: string | null;
  file_size: number;
  modified_at: Date;
}

export class DirectoryWatcherService {
  private watchers: Map<string, FSWatcher> = new Map();
  private assetService: AssetService;
  private scanInterval: NodeJS.Timeout | null = null;
  private loadingBindings = false;
  private importChains: Map<string, Promise<void>> = new Map();
  private readonly maxFilesPerScan: number;

  constructor() {
    this.assetService = new AssetService();
    this.maxFilesPerScan = Math.max(
      1,
      parseInt(process.env.DIRECTORY_WATCHER_MAX_FILES_PER_SCAN || '200', 10)
    );
  }

  // Initialize service - load all active bindings and start watching
  async initialize(): Promise<void> {
    console.log('[DirectoryWatcher] Initializing...');

    // Start periodic scan for new bindings
    this.scanInterval = setInterval(() => {
      this.loadAndWatchBindings();
    }, 60000); // Scan every minute

    // Initial load
    await this.loadAndWatchBindings();

    console.log('[DirectoryWatcher] Initialized');
  }

  // Stop all watchers
  async stop(): Promise<void> {
    console.log('[DirectoryWatcher] Stopping...');

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    for (const [id, watcher] of this.watchers) {
      watcher.close();
      console.log(`[DirectoryWatcher] Stopped watching: ${id}`);
    }
    this.watchers.clear();

    console.log('[DirectoryWatcher] Stopped');
  }

  // Load active bindings and set up watchers
  private async loadAndWatchBindings(): Promise<void> {
    if (this.loadingBindings) {
      return;
    }
    this.loadingBindings = true;
    try {
      const result = await query(
        `SELECT * FROM asset_directory_bindings WHERE is_active = true`
      );
      const bindings: DirectoryBinding[] = result.rows;

      // Stop watchers for removed bindings
      for (const [id, watcher] of this.watchers) {
        if (!bindings.find(b => b.id === id)) {
          watcher.close();
          this.watchers.delete(id);
          console.log(`[DirectoryWatcher] Removed binding: ${id}`);
        }
      }

      // Start watchers for new bindings
      for (const binding of bindings) {
        if (!this.watchers.has(binding.id)) {
          await this.startWatching(binding);
        }
      }
    } catch (error) {
      console.error('[DirectoryWatcher] Failed to load bindings:', error);
    } finally {
      this.loadingBindings = false;
    }
  }

  // Start watching a directory
  private async startWatching(binding: DirectoryBinding): Promise<void> {
    try {
      // Initial scan
      await this.scanDirectory(binding);

      // Set up watcher
      const watcher = watch(
        binding.path,
        { recursive: binding.include_subdirs },
        async (eventType, filename) => {
          if (!filename) return;

          const filePath = join(binding.path, filename);

          // Check if file matches patterns
          if (!this.matchesPattern(filename, binding.file_patterns)) {
            return;
          }

          if (eventType === 'rename') {
            // File added or removed
            try {
              const stats = await stat(filePath);
              if (stats.isFile()) {
                this.enqueueImport(binding.id, async () => { await this.importFile(binding, filePath, stats); });
              }
            } catch {
              // File was removed
              this.enqueueImport(binding.id, () => this.removeTrackedFile(binding.id, filePath));
            }
          } else if (eventType === 'change') {
            // File modified
            try {
              const stats = await stat(filePath);
              if (stats.isFile()) {
                this.enqueueImport(binding.id, async () => { await this.importFile(binding, filePath, stats); });
              }
            } catch {
              // File no longer exists
            }
          }
        }
      );

      this.watchers.set(binding.id, watcher);
      console.log(`[DirectoryWatcher] Started watching: ${binding.path}`);
    } catch (error) {
      console.error(`[DirectoryWatcher] Failed to watch ${binding.path}:`, error);
    }
  }

  // Scan entire directory for files
  private async scanDirectory(binding: DirectoryBinding): Promise<void> {
    if (!binding.auto_import) return;

    try {
      const files = await this.getFilesInDirectory(binding.path, binding.include_subdirs);
      const limitedFiles = files.slice(0, this.maxFilesPerScan);
      if (files.length > this.maxFilesPerScan) {
        console.warn(
          `[DirectoryWatcher] Scan limited for ${binding.name}: processing ${this.maxFilesPerScan}/${files.length} files this round`
        );
      }

      for (const filePath of limitedFiles) {
        try {
          const stats = await stat(filePath);
          if (stats.isFile() && this.matchesPattern(filePath, binding.file_patterns)) {
            await this.enqueueImport(binding.id, async () => { await this.importFile(binding, filePath, stats); });
          }
        } catch (error) {
          console.error(`[DirectoryWatcher] Error processing ${filePath}:`, error);
        }
      }

      // Update last scan time
      await query(
        `UPDATE asset_directory_bindings SET last_scan_at = NOW() WHERE id = $1`,
        [binding.id]
      );
    } catch (error) {
      console.error(`[DirectoryWatcher] Failed to scan ${binding.path}:`, error);
    }
  }

  // Get all files in directory
  private async getFilesInDirectory(dir: string, recursive: boolean): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          const subFiles = await this.getFilesInDirectory(fullPath, recursive);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[DirectoryWatcher] Error reading directory ${dir}:`, error);
    }

    return files;
  }

  // Check if file matches any of the patterns
  private matchesPattern(filePath: string, patterns: string[]): boolean {
    const ext = extname(filePath).toLowerCase();
    return patterns.some(pattern => {
      // Support glob patterns like *.pdf
      if (pattern.startsWith('*')) {
        return ext === pattern.substring(1).toLowerCase();
      }
      return filePath.toLowerCase().endsWith(pattern.toLowerCase());
    });
  }

  // Import a file to asset library; returns the imported asset id, or null if unchanged/failed
  private async importFile(
    binding: DirectoryBinding,
    filePath: string,
    stats: { size: number; mtime: Date }
  ): Promise<string | null> {
    try {
      // Check if file is already tracked and unchanged
      const existing = await this.getTrackedFile(binding.id, filePath);
      const fileHash = await this.computeFileHash(filePath);

      if (existing && existing.file_hash === fileHash) {
        return null; // File unchanged
      }

      // Read file
      const buffer = await readFile(filePath);
      const filename = basename(filePath);
      const mimetype = this.getMimeType(filename);

      // Import to asset library
      const asset = await this.assetService.upload({
        buffer,
        filename,
        mimetype,
        title: filename.replace(/\.[^/.]+$/, ''),
        source: `目录绑定: ${binding.name}`,
        tags: [],
      });

      // Update asset with theme if specified
      if (binding.theme_id) {
        await this.assetService.update(asset.id, { theme_id: binding.theme_id });
      }

      // Track the file
      await this.trackFile(binding.id, filePath, fileHash, asset.id, stats.size, stats.mtime);

      // Update import count
      await query(
        `UPDATE asset_directory_bindings SET total_imported = total_imported + 1 WHERE id = $1`,
        [binding.id]
      );

      console.log(`[DirectoryWatcher] Imported: ${filePath} -> ${asset.id}`);
      return asset.id;
    } catch (error) {
      console.error(`[DirectoryWatcher] Failed to import ${filePath}:`, error);
      return null;
    }
  }

  // Compute file hash for change detection
  private async computeFileHash(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  // Get tracked file info
  private async getTrackedFile(bindingId: string, filePath: string): Promise<TrackedFile | null> {
    const result = await query(
      `SELECT * FROM asset_tracked_files WHERE binding_id = $1 AND file_path = $2`,
      [bindingId, filePath]
    );
    return result.rows[0] || null;
  }

  // Track a file
  private async trackFile(
    bindingId: string,
    filePath: string,
    fileHash: string,
    assetId: string,
    fileSize: number,
    modifiedAt: Date
  ): Promise<void> {
    await query(
      `INSERT INTO asset_tracked_files (binding_id, file_path, file_hash, asset_id, file_size, modified_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (binding_id, file_path)
       DO UPDATE SET file_hash = $3, asset_id = $4, file_size = $5, modified_at = $6`,
      [bindingId, filePath, fileHash, assetId, fileSize, modifiedAt]
    );
  }

  // Remove tracked file when deleted
  private async removeTrackedFile(bindingId: string, filePath: string): Promise<void> {
    await query(
      `DELETE FROM asset_tracked_files WHERE binding_id = $1 AND file_path = $2`,
      [bindingId, filePath]
    );
    console.log(`[DirectoryWatcher] Removed tracking: ${filePath}`);
  }

  // Serialize file import/remove operations per binding to avoid DB spikes
  private async enqueueImport(bindingId: string, task: () => Promise<void>): Promise<void> {
    const prev = this.importChains.get(bindingId) || Promise.resolve();
    const next = prev
      .catch(() => {
        // keep chain alive
      })
      .then(task)
      .catch((error) => {
        console.error(`[DirectoryWatcher] Task failed for binding ${bindingId}:`, error);
      });
    this.importChains.set(bindingId, next);
    await next;
  }

  // Get MIME type from filename
  private getMimeType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Manual trigger for scanning a binding
  // options.sinceMtime — ISO date or 'last_scan' keyword; only files with mtime >= cutoff are processed
  // options.dryRun — preview mode: count matches without importing
  async triggerScan(
    bindingId: string,
    options: { sinceMtime?: string; dryRun?: boolean } = {}
  ): Promise<{
    scanned: number;
    added: number;
    imported: number;
    errors: number;
    filtered: number;
    unchanged: number;
    skipped: number;
    addedAssetIds: string[];
    dryRun: boolean;
    sinceMtime?: string | null;
  }> {
    const result = await query(
      `SELECT * FROM asset_directory_bindings WHERE id = $1`,
      [bindingId]
    );

    if (result.rows.length === 0) {
      throw new Error('Binding not found');
    }

    const binding: DirectoryBinding & { last_scan_at?: Date | null } = result.rows[0];
    const dryRun = options.dryRun === true;

    // Resolve cutoff: 'last_scan' → binding.last_scan_at; otherwise parse ISO string
    let cutoff: Date | null = null;
    if (options.sinceMtime === 'last_scan') {
      cutoff = binding.last_scan_at ? new Date(binding.last_scan_at) : null;
    } else if (typeof options.sinceMtime === 'string' && options.sinceMtime.length > 0) {
      const parsed = new Date(options.sinceMtime);
      if (!Number.isNaN(parsed.getTime())) cutoff = parsed;
    }

    // Reset counters for this scan
    let scanned = 0;
    let imported = 0;
    let errors = 0;
    let filtered = 0;
    let unchanged = 0;
    const addedAssetIds: string[] = [];

    try {
      const files = await this.getFilesInDirectory(binding.path, binding.include_subdirs);
      scanned = files.length;

      for (const filePath of files) {
        try {
          const stats = await stat(filePath);
          if (!stats.isFile() || !this.matchesPattern(filePath, binding.file_patterns)) {
            filtered++;
            continue;
          }
          // mtime filter: skip files older than cutoff
          if (cutoff && stats.mtime < cutoff) {
            filtered++;
            continue;
          }

          const existing = await this.getTrackedFile(binding.id, filePath);
          const fileHash = await this.computeFileHash(filePath);

          if (!existing || existing.file_hash !== fileHash) {
            if (dryRun) {
              imported++; // count what would be imported
            } else {
              const newId = await this.importFile(binding, filePath, stats);
              if (newId) {
                imported++;
                addedAssetIds.push(newId);
              }
            }
          } else {
            unchanged++;
          }
        } catch (error) {
          errors++;
          console.error(`[DirectoryWatcher] Error processing ${filePath}:`, error);
        }
      }

      // Update last scan time only for real scans (not dryRun)
      if (!dryRun) {
        await query(
          `UPDATE asset_directory_bindings SET last_scan_at = NOW() WHERE id = $1`,
          [bindingId]
        );
      }
    } catch (error) {
      console.error(`[DirectoryWatcher] Failed to scan ${binding.path}:`, error);
      throw error;
    }

    const skipped = Math.max(scanned - imported - errors, 0);
    return {
      scanned,
      added: imported,
      imported,
      errors,
      filtered,
      unchanged,
      skipped,
      addedAssetIds,
      dryRun,
      sinceMtime: cutoff ? cutoff.toISOString() : null,
    };
  }
}

// Singleton instance
let directoryWatcherService: DirectoryWatcherService | null = null;

export function getDirectoryWatcherService(): DirectoryWatcherService {
  if (!directoryWatcherService) {
    directoryWatcherService = new DirectoryWatcherService();
  }
  return directoryWatcherService;
}
