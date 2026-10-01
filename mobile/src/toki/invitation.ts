export type LinkObservation = {
  taskKey: string | null;
  connected: boolean;
  rssi?: number;
  minutes: 0 | 5 | 10;
  maintenance: boolean;
  manualDisconnect: boolean;
  now: number;
};
export type InvitationAction = { type: 'cancel' } | { type: 'schedule'; seconds: number } | null;

// RSSI is a noisy link measurement. This policy makes an invitation, not a claim
// about presence. The first good sample of the run is the relative reference.
export class InvitationPolicy {
  private taskKey: string | null = null;
  private baseline?: number;
  private weakSince?: number;
  private due?: number;
  private invited = false;
  private minutes = 0;

  observe(input: LinkObservation): InvitationAction {
    const { now } = input;
    if (this.due !== undefined && now >= this.due) this.invited = true;
    if (!input.taskKey || input.taskKey !== this.taskKey) {
      const cancel = this.due !== undefined;
      this.taskKey = input.taskKey; this.baseline = undefined; this.weakSince = undefined;
      this.due = undefined; this.invited = false;
      if (cancel) return { type: 'cancel' };
    }
    if (this.minutes !== input.minutes) {
      this.minutes = input.minutes; this.weakSince = undefined;
      if (this.due !== undefined) { this.due = undefined; return { type: 'cancel' }; }
    }
    if (!input.taskKey || !input.minutes || input.maintenance || input.manualDisconnect) {
      this.weakSince = undefined;
      if (this.due !== undefined) { this.due = undefined; return { type: 'cancel' }; }
      return null;
    }
    if (input.connected && input.rssi !== undefined && this.baseline === undefined) this.baseline = input.rssi;
    const weak = !input.connected || (input.rssi !== undefined && this.baseline !== undefined && input.rssi <= -75 && input.rssi <= this.baseline - 18);
    const recovered = input.connected && input.rssi !== undefined && this.baseline !== undefined && (input.rssi >= -70 || input.rssi >= this.baseline - 10);
    if (recovered) {
      this.weakSince = undefined;
      if (this.due !== undefined) { this.due = undefined; return { type: 'cancel' }; }
    }
    if (this.invited || this.due !== undefined) return null;
    if (!weak && this.due === undefined) this.weakSince = undefined;
    if (weak && this.weakSince === undefined) this.weakSince = now;
    // Thirty seconds of weakening filters short fades. A disconnect can schedule
    // immediately; its notification still has the full user-selected grace.
    if (this.weakSince !== undefined && (!input.connected || now - this.weakSince >= 30_000)) {
      this.due = this.weakSince + input.minutes * 60_000;
      return { type: 'schedule', seconds: Math.max(1, Math.ceil((this.due - now) / 1000)) };
    }
    return null;
  }
}
