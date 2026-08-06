import { describe, expect, it, vi } from 'vitest';
import {
  observeMeetingParticipants,
  resolveConfirmedMeetingParticipant,
} from '../../../src/modules/meeting-notes/review/meetingParticipantIdentity.js';

describe('meetingParticipantIdentity', () => {
  it('stores generic ASR labels only as meeting-local observations', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const deps = { db: { query } } as any;

    await observeMeetingParticipants(deps, 'asset_legacy_1', [
      { rawLabel: '说话人 01', source: 'parseMeeting' },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO mn_meeting_participants');
    expect(sql).not.toContain('mn_people');
    expect(params.slice(0, 4)).toEqual([
      'asset_legacy_1',
      '说话人 01',
      '说话人 01',
      'generic_asr',
    ]);
  });

  it('does not observe labels that are clearly not people', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const deps = { db: { query } } as any;

    await observeMeetingParticipants(deps, 'meeting-1', [{ rawLabel: '第七部分' }]);

    expect(query).not.toHaveBeenCalled();
  });

  it('returns only an explicitly confirmed binding', async () => {
    const query = vi.fn(async () => ({
      rows: [{ normalized_label: '说话人1', person_id: 'a1b2c3d4-1111-4222-8333-123456789abc' }],
    }));
    const deps = { db: { query } } as any;

    await expect(resolveConfirmedMeetingParticipant(deps, 'asset_legacy_1', '说话人1')).resolves.toBe(
      'a1b2c3d4-1111-4222-8333-123456789abc',
    );
    expect(query.mock.calls[0][0]).toContain("status = 'confirmed'");
    expect(query.mock.calls[0][1]).toEqual(['asset_legacy_1']);
  });
});
