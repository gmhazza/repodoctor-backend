import { EventEmitter } from 'events';

export class ProgressTracker extends EventEmitter {
  /**
   * @param {number} total
   */
  constructor(total = 0) {
    super();
    this.total = total;
    this.queued = total;
    this.processing = 0;
    this.completed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  setTotal(total) {
    this.total = total;
    this.queued = total - (this.completed + this.failed + this.skipped + this.processing);
    this.emitProgress();
  }

  startFile(filePath) {
    if (this.queued > 0) this.queued--;
    this.processing++;
    this.emit('fileStarted', { file: filePath, snapshot: this.getSnapshot() });
    this.emitProgress();
  }

  completeFile(filePath, problemsCount = 0) {
    if (this.processing > 0) this.processing--;
    this.completed++;
    this.emit('fileCompleted', { file: filePath, problemsCount, snapshot: this.getSnapshot() });
    this.emitProgress();
  }

  failFile(filePath, error) {
    if (this.processing > 0) this.processing--;
    this.failed++;
    this.emit('fileFailed', { file: filePath, error, snapshot: this.getSnapshot() });
    this.emitProgress();
  }

  skipFile(filePath, reason) {
    if (this.queued > 0) this.queued--;
    this.skipped++;
    this.emit('fileSkipped', { file: filePath, reason, snapshot: this.getSnapshot() });
    this.emitProgress();
  }

  emitProgress() {
    this.emit('progress', this.getSnapshot());
  }

  getSnapshot() {
    return {
      total: this.total,
      queued: Math.max(0, this.queued),
      processing: this.processing,
      completed: this.completed,
      failed: this.failed,
      skipped: this.skipped,
    };
  }
}
