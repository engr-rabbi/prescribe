// Local stand-in for the deployed Apps Script web app: runs the REAL bundled Code.js against the
// in-memory Google emulator and exposes it at POST http://localhost:8787/exec (with CORS), so the
// whole front-end can be exercised end-to-end without a Google account.
//   npm run dev:google-emulator
import http from "node:http";
import path from "node:path";
import { GasHarness } from "./gas-emulator";

const root = process.cwd();
const port = Number(process.env.PORT ?? 8787);
const g = new GasHarness(path.join(root, "apps-script/dist/Code.js"), path.join(root, "public/data"));
g.prop("ADMIN_EMAIL", process.env.ADMIN_EMAIL ?? "admin@rx.local");
g.prop("ADMIN_PASSWORD", process.env.ADMIN_PASSWORD ?? "admin-password-123");
g.prop("SEED_BASE_URL", "https://seed.test/data");
if (process.env.SEED_DEMO !== "false") g.prop("SEED_DEMO", "true");
g.call("setup");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    // dev-only inspection endpoints (the emulator's "Google")
    if (req.url?.startsWith("/__debug/sheet")) {
      const name = new URL(req.url, "http://x").searchParams.get("name") ?? "";
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(g.sheet(name)));
      return;
    }
    if (req.url?.startsWith("/__debug/file")) {
      const id = new URL(req.url, "http://x").searchParams.get("id") ?? "";
      const f = g.emu.files.get(id);
      res.writeHead(f ? 200 : 404, { ...cors, "Content-Type": f?.mime ?? "text/plain" }).end(f?.bytes ?? "not found");
      return;
    }
    if (req.url?.startsWith("/__debug/drive")) {
      const path = (id: string): string => {
        const parts: string[] = [];
        let f = g.emu.folders.get(id);
        while (f && f.parent) {
          parts.unshift(f.name);
          f = g.emu.folders.get(f.parent);
        }
        return parts.join("/");
      };
      const files = [...g.emu.files.values()].map((f) => ({
        id: f.id, name: f.name, mime: f.mime, size: f.bytes.length, trashed: f.trashed,
        folder: path(f.parent), head: f.bytes.subarray(0, 8).toString("latin1"),
      }));
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(files));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const delay = Number(process.env.LATENCY_MS ?? 0);
      setTimeout(() => {
        const out = req.method === "POST" ? g.ctx.doPost({ postData: { contents: body } }) : g.ctx.doGet({});
        res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(out.getContent());
      }, delay);
    });
  })
  .listen(port, () => console.log(`Google emulator listening on http://localhost:${port}/exec`));

export { g };
