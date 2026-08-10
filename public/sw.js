/*  BakeOnomics service worker
    ---------------------------------------------------------------------------
    Minimal, dependency-free PWA runtime. Its ONLY job today is:

      1) Register so Chrome/Edge/Firefox count us as installable
         (Add to Home Screen / Install app prompts).
      2) Give static assets a durable offline fallback so the app shell
         still opens when the network is flaky.

    Deliberately NOT caching:
      - Supabase REST/auth calls (must always be live so RLS scoping works)
      - POST / PUT / DELETE (only GETs are cachable)
      - Anything cross-origin except Supabase Storage images

    Cache invalidation: bump SW_VERSION on structural changes to this file.
    Vite's asset filenames are hashed, so JS/CSS caches self-invalidate the
    moment a new build ships new filenames. The old shell entry is replaced
    on the next navigation via network-first.
    ========================================================================= */

const SW_VERSION      = 'v1'
const RUNTIME_CACHE   = `bakeonomics-runtime-${SW_VERSION}`
const OFFLINE_SHELL   = '/'

// Take over immediately on install so a new deploy doesn't wait for all tabs
// to close before its SW is in control.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(RUNTIME_CACHE)
    // Warm the app shell so first-open-while-offline still boots
    try { await cache.add(OFFLINE_SHELL) } catch (_) { /* offline install is fine */ }
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop any caches that don't match the current version
    const keys = await caches.keys()
    await Promise.all(
      keys.filter(k => k !== RUNTIME_CACHE).map(k => caches.delete(k))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Only handle GETs — POST/PUT/DELETE must always hit the network
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // NEVER touch Supabase REST / auth / realtime — these are live-data
  // endpoints and RLS enforcement depends on always sending the current
  // session token. `/storage/` is safe to cache; everything else on the
  // supabase.co origin is not.
  const isSupabase        = url.hostname.endsWith('.supabase.co')
  const isSupabaseStorage = isSupabase && url.pathname.includes('/storage/')
  if (isSupabase && !isSupabaseStorage) return

  // Skip anything cross-origin we don't specifically want to cache
  if (url.origin !== self.location.origin && !isSupabaseStorage) return

  // Navigation requests (HTML) — network-first, fall back to cached shell
  // so the app opens offline. New deploys are picked up on the next reload.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
    return
  }

  // Vite's hashed static assets, favicons, manifest, fonts, images →
  // cache-first (they're immutable once deployed under a hashed name; the
  // few unhashed public/ assets update rarely enough that this is fine).
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|webmanifest|woff2?|ttf|otf|css|js)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req))
    return
  }

  // Supabase Storage (uploaded recipe / ingredient photos) → cache-first
  if (isSupabaseStorage) {
    event.respondWith(cacheFirst(req))
    return
  }

  // Anything else: pass through untouched
})

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (_) {
    const cached = await cache.match(request)
    if (cached) return cached
    const shell = await cache.match(OFFLINE_SHELL)
    if (shell) return shell
    return Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch (_) {
    return Response.error()
  }
}

// Allow the app to trigger an immediate SW upgrade after a new deploy is
// detected (postMessage from the page: { type: 'SKIP_WAITING' })
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
