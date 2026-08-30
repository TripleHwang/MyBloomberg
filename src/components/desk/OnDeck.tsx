import type { CalendarEvent, WatchlistItem } from "@/lib/domain";

interface OnDeckProps {
  watchlist: WatchlistItem[];
  calendar: CalendarEvent[];
}

export function OnDeck({ watchlist, calendar }: OnDeckProps) {
  return (
    <section className="on-deck" aria-labelledby="on-deck-title">
      <header className="section-heading">
        <p id="on-deck-title">ON DECK</p>
        <span>WATCHLIST / CALENDAR</span>
      </header>
      <div className="on-deck-grid">
        <div>
          <h3>WATCHLIST</h3>
          <ul className="watch-list">
            {watchlist.map((item) => (
              <li key={item.symbol} className={`status-${item.status}`}>
                <div>
                  <strong>{item.symbol}</strong>
                  <span>{item.name}</span>
                </div>
                <span className={`market-move move-${item.direction}`}>
                  {item.move}
                </span>
                <p>{item.condition}</p>
                {item.status !== "fresh" && (
                  <small>{item.status.toUpperCase()} · SAMPLE</small>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>ECONOMIC CALENDAR · SAMPLE</h3>
          <ol className="calendar-list">
            {calendar.map((event) => (
              <li key={`${event.time}-${event.event}`}>
                <time>{event.time}</time>
                <span>{event.region}</span>
                <div>
                  <strong>{event.event}</strong>
                  <small>{event.relevance.toUpperCase()} RELEVANCE</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
