/* eslint-disable @typescript-eslint/no-explicit-any */
export async function executeHttpRequest(config: any, input: any) {
  const url = config.url;
  const method = config.method || 'GET';
  const headers = config.headers || {};
  let body = config.body;

  if (!url) throw new Error('HTTP Request URL is required');

  // Basic security: block obvious internal SSRF attempts if possible,
  // though fully blocking SSRF requires a proper network proxy or IP filter.
  if (url.includes('169.254.169.254') || url.includes('localhost') || url.includes('127.0.0.1')) {
    throw new Error('Blocked SSRF attempt');
  }

  // Replace placeholders in body with input if needed, or just use input directly.
  if (method !== 'GET' && method !== 'HEAD' && !body && input) {
    body = typeof input === 'string' ? input : JSON.stringify(input);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // Basic timeout using AbortController
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const resText = await res.text();
      let resData = resText;
      try { resData = JSON.parse(resText); } catch { /* ignore */ }

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${resText.substring(0, 100)}`);
      }

      return { status: res.status, data: resData };
    } catch (e: any) {
      lastError = e;
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(`HTTP request failed. Last error: ${lastError?.message}`);
}
