import { brand, ladenName } from '../brand'
import { TOUR_STORE } from '../data/stores'
import { go } from '../lib/router'
import { login } from '../lib/ui-state'
import { Icon, type IconName } from '../icons'

interface Card { key: string; title: string; sub: string; icon: IconName; big?: boolean; onClick: () => void }

/** Demo-Login: drei Zugänge als große Karten (im echten System mit Passwort) */
export function LoginPage() {
  const cards: Card[] = [
    { key: 'carlstadt', title: ladenName('Carlstadt'), sub: 'Flagship · HQ-eigen', icon: 'stores', onClick: () => { login({ role: 'store', storeId: TOUR_STORE }); go('/filiale/heute') } },
    { key: 'hq', title: brand.zentraleName, sub: brand.zentraleUntertitel, icon: 'hq', onClick: () => { login({ role: 'hq' }); go('/zentrale/cockpit') } },
  ]
  return (
    <div className="login">
      <div className="login-in">
        <div className="login-brand"><div className="brand-mark"><Icon name="becher" size={22} stroke={2} /></div><div><b>{brand.produktName}</b><span>{brand.untertitel}</span></div></div>
        <h1>Wer meldet sich an?</h1>
        <p className="login-note"><Icon name="lock" size={16} />Demo-Login – im echten System mit Passwort.</p>
        <div className="login-grid">
          {cards.map((c) => (
            <button key={c.key} className={`glass login-card ${c.big ? 'big' : ''}`} onClick={c.onClick} data-login={c.key}>
              <span className="login-ico"><Icon name={c.icon} size={c.big ? 44 : 32} stroke={1.6} /></span>
              <span className="login-txt">
                <b>{c.title}</b>
                <span>{c.sub}</span>
              </span>
              <span className="login-go">Anmelden<Icon name="arrow" size={16} /></span>
            </button>
          ))}
        </div>
        <p className="login-foot">Demodaten – keine echten Zahlen</p>
      </div>
    </div>
  )
}
