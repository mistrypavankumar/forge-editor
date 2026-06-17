type ClassValue = string | false | null | undefined;

/** Tiny classnames joiner — keeps JSX class lists readable without a dependency. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
