import { Icon } from '../ui/icons'
import { Btn, Card, PageHead, Pill } from '../ui/kit'

/** Platzhalter: Hier wird später die Anbindung an helloTESS! ergänzt. */
export function ImportPage() {
  return (
    <>
      <PageHead title="Kassendaten" hint="Hier wird später die Kasse (helloTESS!) angebunden. Dann laufen alle Verkäufe automatisch ein – ohne Tippen." />
      <Card>
        <div className="stack" style={{ maxWidth: 620, gap: 16 }}>
          <div><Pill tone="yellow">Noch nicht verbunden</Pill></div>
          <p className="muted">Im Prototyp stammen die Verkäufe aus Demodaten (90 Tage je Filiale). Sobald die Schnittstelle steht, wird jeder Kassenverkauf automatisch über die Rezeptur abgebucht – Becher, Löffel, Pulver und Toppings.</p>
          <div className="note"><Icon name="info" /><div><b>Technischer Hinweis</b><br />Die Anbindung ersetzt <code>recordSale</code> in <code>src/data/repository.ts</code>. Die Oberfläche bleibt unverändert.</div></div>
          <div><Btn kind="primary" disabled>Mit helloTESS! verbinden</Btn></div>
        </div>
      </Card>
    </>
  )
}
