/** A realistic TypeScript service seeded into the editor so the workspace
 *  looks alive before a real folder is opened. */
export const SAMPLE_FILE_PATH = '/forge/src/services/user-service.ts';
export const SAMPLE_FILE_NAME = 'user-service.ts';

export const SAMPLE_CODE = `import { z } from 'zod';
import { db } from '../lib/db';
import type { User, NewUser } from '../types/user';

const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.date(),
});

export class UserService {
  async findById(id: string): Promise<User | null> {
    const row = await db.users.findFirst({ where: { id } });
    if (!row) return null;
    return userSchema.parse(row);
  }

  async create(input: NewUser): Promise<User> {
    const existing = await db.users.findFirst({ where: { email: input.email } });
    if (existing) {
      throw new Error('Email already in use');
    }
    const created = await db.users.insert(input);
    return userSchema.parse(created);
  }

  async list(limit = 20): Promise<User[]> {
    const rows = await db.users.findMany({ take: limit });
    return rows.map((r) => userSchema.parse(r));
  }
}

export const userService = new UserService();
`;
