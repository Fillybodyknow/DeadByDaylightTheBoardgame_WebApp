// Service worker: makes the app installable and lets it open without a connection.
//
// - Pages (navigations): network first, the cached app shell when offline.
// - Everything else from this site (scripts, styles, card images, sounds): served from the
//   cache when there, refreshed in the background (stale-while-revalidate). Assets are cached
//   as they are first used, not all up front: the card and map images are large.
// - Other sites (Firebase for online play, fonts) are left alone.
//
// Bump VERSION to drop the old caches when the caching rules change.

const VERSION = 'v1'
const SHELL = `dbdl-shell-${VERSION}`
const ASSETS = `dbdl-assets-${VERSION}`

const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // Audio and video ask for byte ranges; a partial response can't be cached.
  if (req.headers.has('range')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put('./index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })),
    )
    return
  }

  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const cached = await cache.match(req)
      const fresh = fetch(req)
        .then((res) => {
          if (res.status === 200) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      if (cached) {
        event.waitUntil(fresh)
        return cached
      }
      return (await fresh) ?? (await caches.match(req)) ?? Response.error()
    }),
  )
})
