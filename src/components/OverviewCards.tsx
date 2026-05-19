import { overviewCards } from '../mock/qualidexMock'

export function OverviewCards() {
  return (
    <section className="overview-grid" aria-label="状态概览">
      {overviewCards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="overview-card">
            <div className={`overview-icon ${card.tone}`}>
              <Icon size={28} />
            </div>
            <div>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.detail}</span>
            </div>
          </article>
        )
      })}
    </section>
  )
}
