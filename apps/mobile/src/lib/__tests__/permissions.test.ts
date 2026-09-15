import { Permission, Role } from '@mym/shared';
import { canValidateTickets } from '../permissions';
import type { SessionUser } from '../../types/user';

const staff = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  _id: 'staff-1',
  username: 'puerta1',
  firstName: 'Ana',
  lastName: 'Pérez',
  roles: [Role.STAFF],
  ...overrides
});

describe('mobile ticket scanner permission', () => {
  it('keeps the scanner hidden from regular staff', () => {
    expect(canValidateTickets(staff())).toBe(false);
  });

  it('shows the scanner when tickets.validate is granted explicitly', () => {
    expect(canValidateTickets(staff({ permissionOverrides: [Permission.TICKETS_VALIDATE] }))).toBe(true);
  });

  it('honors denied overrides even for roles that normally validate tickets', () => {
    expect(canValidateTickets(staff({
      roles: [Role.SALON_MANAGER],
      permissionDeniedOverrides: [Permission.TICKETS_VALIDATE]
    }))).toBe(false);
  });
});
