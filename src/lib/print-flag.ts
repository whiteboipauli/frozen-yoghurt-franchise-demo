/** Merker: Nach dem Öffnen der Rechnungsseite sofort den Druckdialog zeigen („Als PDF herunterladen“) */
let id: string | null = null
export const printAfterNav = { set: (v: string) => { id = v }, take: (v: string) => { const hit = id === v; if (hit) id = null; return hit } }
