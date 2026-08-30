const sections = ["OVERVIEW", "MACRO", "EQUITIES", "ARCHIVE"] as const;

export function DeskRail() {
  return (
    <aside className="desk-rail" aria-label="Desk sections">
      <div className="rail-mark" aria-label="MyBloomberg">
        M<span>/</span>B
      </div>
      <nav aria-label="Primary navigation">
        <ul className="rail-nav">
          {sections.map((section, index) => (
            <li key={section}>
              <a
                href={`#${section.toLowerCase()}`}
                className={index === 0 ? "is-active" : undefined}
                aria-current={index === 0 ? "page" : undefined}
              >
                <span className="rail-index">0{index + 1}</span>
                <span>{section}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="rail-foot" aria-hidden="true">
        SEOUL
        <span>37.56°N</span>
      </div>
    </aside>
  );
}
