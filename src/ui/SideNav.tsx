import { useState } from 'react'
import { Icon, type IconName } from '../icons'
import { CountBadge, worstLevel, type Level } from './signal'

export interface NavLeaf { path: string; label: string; badge?: { level: Level; n: number } }
export interface NavItem { key: string; label: string; icon: IconName; path?: string; badge?: { level: Level; n: number }; children?: NavLeaf[]; tour?: string }

/** Linke Navigation: einfache Punkte und aufklappbare Gruppen; zugeklappte Gruppen zeigen die schlimmste Stufe ihrer Unterpunkte */
export function SideNav({ items, route }: { items: NavItem[]; route: string }) {
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({})
  const isOn = (p: string) => route === p || route.startsWith(p + '/')
  return (
    <nav className="nav-main" data-tour="nav">
      {items.map((it) => {
        if (!it.children) {
          const on = !!it.path && isOn(it.path)
          return (
            <a key={it.key} className={`nav-item ${on ? 'active' : ''}`} href={`#${it.path}`} data-nav={it.label} aria-current={on ? 'page' : undefined}>
              <Icon name={it.icon} /><span className="nav-label">{it.label}</span>
              {it.badge && <CountBadge level={it.badge.level} n={it.badge.n} />}
            </a>
          )
        }
        const childOn = it.children.some((c) => isOn(c.path))
        const open = openKeys[it.key] ?? childOn
        const worst = it.children.filter((c) => c.badge).map((c) => c.badge!)
        const lvl = worstLevel(worst.map((b) => b.level))
        const total = worst.filter((b) => b.level === lvl).reduce((s, b) => s + b.n, 0)
        return (
          <div key={it.key} className={`nav-grp ${open ? 'open' : ''}`}>
            <button className={`nav-item ${childOn ? 'active' : ''}`} aria-expanded={open} onClick={() => setOpenKeys({ ...openKeys, [it.key]: !open })} data-nav={it.label}>
              <Icon name={it.icon} /><span className="nav-label">{it.label}</span>
              {!open && worst.length > 0 && <CountBadge level={lvl} n={lvl === 'rot' || lvl === 'info' ? total : undefined} />}
              <Icon name="pfeil-rechts" size={16} />
            </button>
            {open && (
              <div className="nav-sub">
                {it.children.map((c) => (
                  <a key={c.path} className={`nav-item sub ${isOn(c.path) ? 'active' : ''}`} href={`#${c.path}`} data-nav={c.label}>
                    <span className="nav-label">{c.label}</span>
                    {c.badge && <CountBadge level={c.badge.level} n={c.badge.n} />}
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
