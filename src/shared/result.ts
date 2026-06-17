export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = (error: string): Result<never> => ({ ok: false, error });

export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
