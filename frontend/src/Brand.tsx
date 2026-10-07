import logo from './assets/impetus-logo.png'

export const applicationName='英霏特'

export default function Brand({variant='sidebar'}:{variant?:'sidebar'|'compact'|'login'}) {
  return <span className={`brand-lockup brand-lockup-${variant}`}>
    <img className="brand-logo" src={logo} width={21500} height={2456} alt="IMPETUS" decoding="async"/>
    <span className="brand-name">{applicationName}</span>
  </span>
}
