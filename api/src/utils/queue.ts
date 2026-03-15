// Queue wrapper - uses BullMQ if Redis available, falls back to in-memory
// MVP简化：直接使用in-memory queue，不依赖Redis

import { JobQueue, createWorker, closeQueueConnections } from './queue-simple.js';

export { JobQueue, createWorker, closeQueueConnections };
