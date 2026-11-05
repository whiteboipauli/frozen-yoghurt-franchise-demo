/** Bild einlesen und verkleinern (für Produktfotos und Profilfotos; Ergebnis als Data-URL, bewusst klein gehalten) */
export function readImage(file: File, max = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    fr.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Kein gültiges Bild'))
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k)
        c.height = Math.round(img.height * k)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', quality))
      }
      img.src = String(fr.result)
    }
    fr.readAsDataURL(file)
  })
}
