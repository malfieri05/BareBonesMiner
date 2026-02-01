import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type OpenGraphData = {
  ogTitle?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterImage?: string;
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const rawTarget = requestUrl.searchParams.get('u');

  if (!rawTarget) {
    return new Response('Missing share URL.', { status: 400 });
  }

  let targetUrl: URL;
  try {
    const decoded = decodeURIComponent(rawTarget);
    targetUrl = new URL(decoded);
  } catch {
    return new Response('Invalid share URL.', { status: 400 });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return new Response('Unsupported URL protocol.', { status: 400 });
  }

  const ogData: OpenGraphData = await fetchOpenGraph(targetUrl.toString()).catch(
    () => ({})
  );
  const ogTitle = ogData.ogTitle || ogData.twitterTitle || '';
  const ogImage = ogData.ogImage || ogData.twitterImage || '';

  const metaTitle = 'Saved with ScrollMiner';
  const metaDescription = ogTitle
    ? `Saved with ScrollMiner • ${ogTitle}`
    : 'Saved with ScrollMiner';

  const html = buildSharePage({
    targetUrl: targetUrl.toString(),
    metaTitle,
    metaDescription,
    ogImage
  });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}

async function fetchOpenGraph(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    }
  });

  const html = await response.text();

  return {
    ogTitle: getMetaContent(html, 'og:title'),
    ogImage: getMetaContent(html, 'og:image'),
    twitterTitle: getMetaContent(html, 'twitter:title'),
    twitterImage: getMetaContent(html, 'twitter:image')
  };
}

function getMetaContent(html: string, name: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i'
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function buildSharePage({
  targetUrl,
  metaTitle,
  metaDescription,
  ogImage
}: {
  targetUrl: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
}) {
  const escapedTarget = escapeHtml(targetUrl);
  const escapedTitle = escapeHtml(metaTitle);
  const escapedDescription = escapeHtml(metaDescription);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:site_name" content="ScrollMiner" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://valueminer.org/s?u=${encodeURIComponent(
      escapedTarget
    )}" />
    ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
    ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta http-equiv="refresh" content="1;url=${escapedTarget}" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f1120;
        color: #f7f5ff;
      }
      .card {
        max-width: 520px;
        padding: 28px;
        border-radius: 20px;
        background: rgba(22, 24, 42, 0.95);
        border: 1px solid rgba(164, 93, 233, 0.7);
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
        text-align: center;
      }
      .brand {
        font-weight: 700;
        color: #b18bff;
        margin-bottom: 8px;
        letter-spacing: 0.02em;
      }
      .title {
        font-size: 18px;
        margin-bottom: 20px;
      }
      .button {
        display: inline-block;
        margin-top: 12px;
        padding: 12px 20px;
        border-radius: 999px;
        background: #a45de9;
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
      .secondary {
        margin-left: 8px;
        background: transparent;
        border: 1px solid rgba(164, 93, 233, 0.7);
        color: #f7f5ff;
      }
      .note {
        margin-top: 16px;
        font-size: 13px;
        opacity: 0.75;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">Saved with ScrollMiner</div>
      <div class="title">Opening your clip…</div>
      <a class="button" href="${escapedTarget}" rel="noopener noreferrer">Watch the original</a>
      <a class="button secondary" href="https://valueminer.org" rel="noopener noreferrer">Get ScrollMiner</a>
      <div class="note">If nothing happens, tap “Watch the original.”</div>
    </div>
    <script>
      setTimeout(function () {
        window.location.replace(${JSON.stringify(targetUrl)});
      }, 800);
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
