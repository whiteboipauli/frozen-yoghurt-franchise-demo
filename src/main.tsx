import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './design.css'
import './milchglas.css'
import { installSprings } from './lib/spring'
import { applyTheme } from './lib/ui-state'
import { refreshWeather } from './logic/weather'
import { CITY_COORDS } from './data/stores'

installSprings()
applyTheme()

/** Erst Wetter laden (max. 6 s, alle Städte in einer Anfrage), damit die Demo-Historie mit echtem Wetter erzeugt werden kann. Ohne Netz startet die App trotzdem. */
async function boot() {
  await Promise.race([refreshWeather(Object.values(CITY_COORDS)), new Promise((r) => setTimeout(r, 6000))]).catch(() => {})
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
void boot()
