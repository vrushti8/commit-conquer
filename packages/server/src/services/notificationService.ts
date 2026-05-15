import { eventBus, EVENT } from '../../../core/event-bus';

export interface UserRankChangedNotificationPayload {
  user_id: string;
  email: string;
  old_rank: number;
  new_rank: number;
  triggered_by_user_id: string;
  triggered_by_username: string;
  overtaken_by_user_id?: string;
  overtaken_by_username?: string;
}

export class NotificationService {
  private static initialized = false;

  constructor() {
    if (NotificationService.initialized) return;
    eventBus.on(EVENT.USER_RANK_CHANGED, this.handleUserRankChanged.bind(this));
    NotificationService.initialized = true;
  }

  private async handleUserRankChanged(
    payload: UserRankChangedNotificationPayload,
  ): Promise<void> {
    if (!payload.email) return;

    const overtakenByText = payload.overtaken_by_username
      ? `You were overtaken by ${payload.overtaken_by_username}. `
      : '';

    const subject = `Leaderboard alert: your rank changed from ${payload.old_rank} to ${payload.new_rank}`;
    const body = `Hi,

Your leaderboard rank has dropped from ${payload.old_rank} to ${payload.new_rank}.
${overtakenByText}Keep contributing to regain your position.

Triggered by: ${payload.triggered_by_username}

Thanks,
The Commit Conquer team`;

    await this.sendEmail(payload.email, subject, body);
  }

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    // Placeholder implementation. Replace with a real email provider integration.
    console.log('[NotificationService] Sending email to:', to);
    console.log('[NotificationService] Subject:', subject);
    console.log('[NotificationService] Body:', body);
  }
}
