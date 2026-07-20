import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

// Next's built-in /public static-file serving only picks up files that
// existed in public/uploads at server *startup* — anything users upload
// while the process is running 404s until the next restart. This route
// handler reads straight from disk on every request instead, so uploaded
// campaign covers, maps, and avatars show up immediately.
const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = path.join(UPLOADS_ROOT, ...segments);

  // Resolved path must stay under UPLOADS_ROOT — blocks ../ traversal.
  if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) {
    return new NextResponse(null, { status: 400 });
  }

  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new NextResponse(null, { status: 404 });

    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
