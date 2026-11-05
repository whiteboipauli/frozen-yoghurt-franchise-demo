// Durchklick-Prüfung: alle Seiten in jeder Rolle bei 1024, 1280 und 1440 px, mit Konsolenfehlern.
// Start: npm i -D playwright && npx playwright install chromium && npm run dev  (in einem zweiten Terminal), dann: node tools/check.mjs
import { chromium } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5174/'
const WIDTHS = [1024, 1280, 1440]
const ROLES = {
  hq: { login: 'HQ', routes: ['/zentrale/cockpit', '/zentrale/laeden', '/zentrale/laeden/beispielhausen/inventuren', '/zentrale/warenabgleich', '/zentrale/faelle', '/zentrale/bestellungen', '/zentrale/finanzen/rechnungen', '/zentrale/kommunikation/pinnwand', '/zentrale/katalog', '/einstellungen'] },
  laden: { login: 'Carlstadt', routes: ['/filiale/heute', '/filiale/ware/artikel', '/filiale/ware/bestellungen', '/filiale/ware/rechnungen', '/filiale/team/dienstplan', '/filiale/team/mitarbeitende', '/filiale/inventur', '/filiale/monatszahlen', '/filiale/hq/pinnwand', '/filiale/einstellungen'] },
}

const browser = await chromium.launch()
let problems = 0
for (const width of WIDTHS) {
  for (const [role, cfg] of Object.entries(ROLES)) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(BASE)
    await page.getByRole('button', { name: new RegExp(cfg.login) }).first().click()
    await page.getByRole('button', { name: 'Überspringen' }).click({ timeout: 2000 }).catch(() => {})
    for (const r of cfg.routes) {
      await page.evaluate((h) => { location.hash = '#' + h }, r)
      await page.waitForTimeout(700)
      const text = await page.evaluate(() => document.body.innerText)
      if (/undefined|NaN|Something went wrong/.test(text)) { problems++; console.log(`[${width}] ${role} ${r}: verdächtiger Text`) }
    }
    if (errors.length) { problems++; console.log(`[${width}] ${role}: ${errors.length} Konsolenfehler`, errors[0]) }
    await page.close()
  }
}
await browser.close()
console.log(problems ? `${problems} Auffälligkeiten` : 'alles in Ordnung')
process.exit(problems ? 1 : 0)
