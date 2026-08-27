import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

// Serves the built @lumiframe/sdk IIFE bundle from the workspace package
// so this demo store integrates exactly like a real merchant would — one
// <script src="/sdk.js"> tag (see app/layout.tsx) — without needing a CDN.
// Requires `pnpm --filter @lumiframe/sdk build` to have run first (wired
// as predev/prebuild in package.json).
export async function GET() {
  const path = join(process.cwd(), "..", "..", "packages", "sdk", "dist", "index.global.js");
  try {
    const contents = await readFile(path, "utf8");
    return new NextResponse(contents, {
      headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(
      "console.error('Lumi Frame SDK not built — run: pnpm --filter @lumiframe/sdk build');",
      { status: 500, headers: { "Content-Type": "application/javascript; charset=utf-8" } }
    );
  }
}
