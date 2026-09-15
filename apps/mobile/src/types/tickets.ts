export type TicketPublicationOption = {
  _id: string;
  title: string;
  status: string;
  startsAt?: string;
  endsAt?: string;
  venueName?: string;
  qrConfig?: {
    validFrom?: string;
    validUntil?: string;
  };
};

export type TicketCheckInStatus =
  | 'valid'
  | 'accepted'
  | 'already_checked_in'
  | 'expired'
  | 'wrong_publication'
  | 'cancelled'
  | 'refunded'
  | 'transferred'
  | 'invalid'
  | 'error';

export type TicketCheckInTicket = {
  _id?: string;
  ticketCode?: string;
  attendeeName?: string;
  status?: string;
  ticketTypeName?: string;
  checkedInAt?: string;
};

export type TicketCheckInResponse = {
  result: TicketCheckInStatus;
  ticket?: TicketCheckInTicket;
};

export type TicketScanResult = {
  status: TicketCheckInStatus;
  ticket?: TicketCheckInTicket;
  message?: string;
};
