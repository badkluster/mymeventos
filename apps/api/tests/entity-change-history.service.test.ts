import { describe, expect, it } from 'vitest';
import { buildEntityChangeHistory, changeHistoryActor } from '../src/modules/audit/entity-change-history.service';

describe('entity change history', () => {
  it('returns only the public identity needed by the backoffice', () => {
    expect(changeHistoryActor({
      _id: '507f1f77bcf86cd799439011',
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
      passwordHash: 'secret'
    })).toEqual({ id: '507f1f77bcf86cd799439011', name: 'Ana Pérez' });
  });

  it('builds the summary and ignores malformed audit rows', () => {
    const history = buildEntityChangeHistory({
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      updatedAt: new Date('2026-09-11T15:30:00.000Z'),
      createdBy: { _id: 'creator', fullName: 'María López' },
      updatedBy: { _id: 'editor', username: 'j.sosa' }
    }, [
      {
        _id: 'audit-1',
        action: 'CUSTOMER_UPDATE',
        createdAt: new Date('2026-09-11T15:30:00.000Z'),
        actorUserId: { _id: 'editor', firstName: 'Juan', lastName: 'Sosa' },
        ip: '127.0.0.1',
        userAgent: 'private'
      } as never,
      { _id: 'audit-2', action: '', createdAt: new Date() }
    ]);

    expect(history).toEqual({
      createdAt: '2026-09-10T12:00:00.000Z',
      updatedAt: '2026-09-11T15:30:00.000Z',
      createdBy: { id: 'creator', name: 'María López' },
      updatedBy: { id: 'editor', name: 'j.sosa' },
      items: [{
        id: 'audit-1',
        action: 'CUSTOMER_UPDATE',
        createdAt: '2026-09-11T15:30:00.000Z',
        actor: { id: 'editor', name: 'Juan Sosa' }
      }]
    });
    expect(JSON.stringify(history)).not.toContain('127.0.0.1');
    expect(JSON.stringify(history)).not.toContain('private');
  });
});
