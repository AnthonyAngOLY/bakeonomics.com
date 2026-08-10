import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth.jsx'
import { SettingsProvider } from './lib/settings.jsx'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </AuthProvider>
  </BrowserRouter>
)

// ---------------------------------------------------------------------------
// PWA service worker registration
// ---------------------------------------------------------------------------
// Registers /sw.js in production only — dev mode has no SW so HMR and Vite
// dev server behave normally. Wrapped in a load-event listener so it doesn't
// block first paint. On update, we auto-activate the new worker after the
// current page finishes so users pick up the latest deploy on next navigation
// without needing to hard-refresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // If an updated SW is waiting when the page loads, tell it to skip
      // waiting so the next navigation uses the new build.
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // A newer SW is ready — activate it silently
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })
    }).catch((err) => {
      console.warn('[pwa] service worker registration failed:', err)
    })
  })
}
