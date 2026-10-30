export const config = {
  matcher: ['/api/:path*', '/socket.io/:path*'],
};

export default async function middleware(request) {
  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    return new Response(
      JSON.stringify({ success: false, message: 'Backend URL not configured' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const url = new URL(request.url);
  const destination = new URL(url.pathname + url.search, backendUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const forwardHeaders = new Headers();
    const allowed = ['content-type', 'accept', 'accept-language', 'origin', 'referer', 'user-agent', 'cookie'];
    for (const key of allowed) {
      const value = request.headers.get(key);
      if (value) forwardHeaders.set(key, value);
    }
    const response = await fetch(destination, {
      method: request.method,
      headers: forwardHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      signal: controller.signal,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('x-powered-by');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Backend unreachable' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}