/**
 * packages/server/src/services/userService.ts
 */

import { AppError } from '../middleware/errorHandler';
import { isValidEmail } from '../utils/validators';
import { hashString, generateToken } from '../utils/crypto';
import { eventBus, EVENT } from '../../../core/event-bus';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  totalPoints: number;
  createdAt: Date;
}

export type PublicUser = Omit<User, 'passwordHash'>;

function toPublic(user: User): PublicUser {
  const { passwordHash, ...rest } = user;
  return rest;
}

// Module-level in-memory store — shared across instances so
// LeaderboardService can read the same data without DI wiring.
let store: User[] = [];
let idCounter = 0;

export class UserService {
  /** Test helper — resets the store to a known state. */
  _reset(data: User[]): void {
    store = data;
    idCounter = data.length;
  }

  async findAll(): Promise<PublicUser[]> {
    return store.map(toPublic);
  }

  async findById(id: string): Promise<PublicUser> {
    const user = store.find((u) => u.id === id);
    if (!user) throw new AppError(`User ${id} not found`, 404);
    return toPublic(user);
  }

  async register(data: {
    username: string;
    email: string;
    password?: string;
  }): Promise<PublicUser> {
    if (!data.username || !data.username.trim()) {
      throw new AppError('Username is required', 400);
    }
    if (!isValidEmail(data.email)) {
      throw new AppError('Invalid email format', 400);
    }
    if (store.some((u) => u.email === data.email)) {
      throw new AppError('Email already in use', 409);
    }
    if (store.some((u) => u.username === data.username)) {
      throw new AppError('Username already in use', 409);
    }

    const user: User = {
      id: `user-${++idCounter}`,
      username: data.username,
      email: data.email,
      passwordHash: hashString(data.password ?? ''),
      totalPoints: 0,
      createdAt: new Date(),
    };

    store.push(user);
    return toPublic(user);
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: PublicUser; token: string }> {
    const user = store.find((u) => u.email === email);
    if (!user || user.passwordHash !== hashString(password)) {
      throw new AppError('Invalid email or password', 401);
    }
    return { user: toPublic(user), token: generateToken(user.id) };
  }

  private buildRankSnapshot(users: User[]) {
    const sorted = [...users].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const map = new Map<string, {
      rank: number;
      totalPoints: number;
      username: string;
    }>();

    sorted.forEach((user, index) => {
      map.set(user.id, {
        rank: index + 1,
        totalPoints: user.totalPoints,
        username: user.username,
      });
    });

    return { sorted, map };
  }

  async addPoints(id: string, points: number): Promise<PublicUser> {
    const user = store.find((u) => u.id === id);
    if (!user) throw new AppError(`User ${id} not found`, 404);

    const beforeSnapshot = this.buildRankSnapshot(store);
    user.totalPoints += points;
    const afterSnapshot = this.buildRankSnapshot(store);
    const triggerUser = afterSnapshot.sorted.find((u) => u.id === id)!;

    for (const [userId, afterInfo] of afterSnapshot.map.entries()) {
      const beforeInfo = beforeSnapshot.map.get(userId);
      if (!beforeInfo) continue;
      if (afterInfo.rank <= beforeInfo.rank) continue;

      const overtakenBy = afterSnapshot.sorted[afterInfo.rank - 2];
      const overtakenUser = store.find((u) => u.id === userId)!;

      await eventBus.emit(EVENT.USER_RANK_CHANGED, {
        user_id: userId,
        email: overtakenUser.email,
        old_rank: beforeInfo.rank,
        new_rank: afterInfo.rank,
        triggered_by_user_id: triggerUser.id,
        triggered_by_username: triggerUser.username,
        overtaken_by_user_id: overtakenBy?.id,
        overtaken_by_username: overtakenBy?.username,
      });
    }

    return toPublic(user);
  }
}