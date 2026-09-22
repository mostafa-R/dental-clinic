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
    const response = await fetch(destination, {
      method: request.method,
      headers: request.headers,
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
