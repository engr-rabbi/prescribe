// Where the static seed / catalogue files come from. Defaults to fetch() against
// the site's own /data folder; tests can swap in a filesystem loader.

import { withBase } from "@/lib/base-path";

export interface DataSource {
  json<T = unknown>(file: string): Promise<T>;
  text(file: string): Promise<string>;
}

async function get(file: string): Promise<Response> {
  const res = await fetch(withBase(`/data/${file}`), { cache: "force-cache" });
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
  return res;
}

let source: DataSource = {
  json: async (file) => (await get(file)).json(),
  text: async (file) => (await get(file)).text(),
};

export function setDataSource(s: DataSource) {
  source = s;
}

export function dataSource(): DataSource {
  return source;
}
