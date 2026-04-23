// Meeting Notes · Ingest — 采集渠道 public exports
//
// 本层吸收自:
//   - api/src/routes/meetingNotes.ts
//   - api/src/services/meetingNoteChannel.ts
//   - api/src/services/meetingNoteScheduler.ts
//   - api/src/services/meetingClassifier.ts

export {
  MeetingNoteChannelService,
  type MeetingNoteAdapter,
  type MeetingNoteChannelDeps,
  type ListSourceFilters,
  type CreateSourceInput,
  type UpdateSourceInput,
} from './meetingNoteChannelService.js';

export {
  MeetingNoteScheduler,
  getMeetingNoteScheduler,
  resetMeetingNoteSchedulerForTests,
  type SkippedSource,
} from './meetingNoteScheduler.js';

export {
  classifyMeeting,
  type ClassificationResult,
} from './meetingClassifier.js';

export {
  meetingNotesRoutes,
  type MeetingNotesRouteOptions,
} from './routes.js';
