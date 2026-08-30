import type { SignalRow } from "@/lib/domain";

interface SignalMatrixProps {
  signals: SignalRow[];
}

export function SignalMatrix({ signals }: SignalMatrixProps) {
  return (
    <section className="signal-matrix" aria-labelledby="signal-matrix-title">
      <header className="section-heading">
        <p id="signal-matrix-title">SIGNAL MATRIX</p>
        <span>MODEL-READ · SAMPLE</span>
      </header>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">FACTOR</th>
              <th scope="col">SIGNAL</th>
              <th scope="col">READING</th>
              <th scope="col">INTERPRETATION</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((row) => (
              <tr key={row.factor}>
                <th scope="row">{row.factor}</th>
                <td>
                  <span
                    className={`signal-dot tone-${row.tone}`}
                    aria-hidden="true"
                  />
                  {row.signal}
                  <span className="sr-only">, {row.tone}</span>
                </td>
                <td className="mono">{row.reading}</td>
                <td>{row.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
