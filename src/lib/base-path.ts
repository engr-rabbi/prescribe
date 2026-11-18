// GitHub Pages serves project sites from /<repo-name>/. The build injects that
// prefix through NEXT_PUBLIC_BASE_PATH (see next.config.ts); user-land code that
// builds URLs by hand (static data files, favicon…) must go through withBase().

export const BASE_PATH: string = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function withBase(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
