/** Who performs a team change: a staff member, or an operations script (which acts as an owner). */
export interface StaffActor {
  staffId: string;
  isOwner: boolean;
}

export const SCRIPT_ACTOR: StaffActor = { staffId: 'system:script', isOwner: true };
