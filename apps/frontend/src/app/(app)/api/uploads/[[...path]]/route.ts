import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync, realpathSync } from 'fs';
import { resolve, sep } from 'path';
// @ts-ignore
import mime from 'mime';
async function* nodeStreamToIterator(stream: any) {
  for await (const chunk of stream) {
    yield chunk;
  }
}
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(new Uint8Array(value));
      }
    },
  });
}
export const GET = async (
  request: NextRequest,
  context: {
    params: Promise<{
      path?: string[];
    }>;
  }
) => {
  const { path } = await context.params;
  const base = resolve(process.env.UPLOAD_DIRECTORY!);
  const filePath = resolve(base, (path ?? []).join('/'));
  // Confine reads to UPLOAD_DIRECTORY. resolve() collapses any `..` segments
  // (including URL-decoded ones), so this blocks every path-traversal variant.
  if (filePath !== base && !filePath.startsWith(base + sep)) {
    return new NextResponse('Not found', { status: 404 });
  }
  // Authorize bytes and thumbnails before checking file existence. No static
  // public cache, and no symlink can escape the private upload directory.
  const headers = new Headers();
  for (const name of ['cookie', 'auth', 'authorization', 'showorg']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let fileStats;
  let canonical: string;
  try {
    const backend =
      process.env.NEXT_PUBLIC_OVERRIDE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL;
    const response = await fetch(
      `${backend}/agency/media-access?path=${encodeURIComponent(
        (path ?? []).map(encodeURIComponent).join('/')
      )}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) return new NextResponse('Not found', { status: 404 });
    canonical = realpathSync(filePath);
    const canonicalBase = realpathSync(base);
    if (!canonical.startsWith(canonicalBase + sep))
      return new NextResponse('Not found', { status: 404 });
    fileStats = statSync(canonical);
    if (!fileStats.isFile())
      return new NextResponse('Not found', { status: 404 });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const contentType = mime.getType(filePath) || 'application/octet-stream';

  // Honor ranged requests: providers that push video in chunks (TikTok,
  // YouTube, LinkedIn, X) fetch byte windows with a Range header and reject
  // anything but a 206, so ignoring Range breaks their uploads.
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') || '');
  const start = range ? Number(range[1]) : 0;
  const end =
    range && range[2]
      ? Math.min(Number(range[2]), fileStats.size - 1)
      : fileStats.size - 1;

  if (range && (start >= fileStats.size || start > end)) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileStats.size}` },
    });
  }

  const response = createReadStream(canonical, range ? { start, end } : {});
  const iterator = nodeStreamToIterator(response);
  const webStream = iteratorToStream(iterator);
  return new Response(webStream, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': contentType,
      // Set the appropriate content-type header
      'Content-Length': (end - start + 1).toString(),
      // Set the content-length header
      'Last-Modified': fileStats.mtime.toUTCString(),
      // Set the last-modified header
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization, auth, showorg',
      'Accept-Ranges': 'bytes',
      ...(range
        ? { 'Content-Range': `bytes ${start}-${end}/${fileStats.size}` }
        : {}),
    },
  });
};
