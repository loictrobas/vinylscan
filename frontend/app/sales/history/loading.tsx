export default function SalesHistoryLoading() {
  return (
    <div className="px-6 py-6 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="h-6 w-32 bg-vs-border rounded mb-2" />
          <div className="h-4 w-24 bg-vs-border/60 rounded" />
        </div>
        <div className="h-5 w-20 bg-vs-border rounded" />
      </div>
      <div className="h-10 w-64 bg-vs-border rounded-lg mb-4" />
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              {["Record", "Condition", "Format", "Cost", "Sold price", "Margin", "Sold at"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-vs-border flex-shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <div className="h-3.5 w-36 bg-vs-border rounded" />
                      <div className="h-3 w-20 bg-vs-border/60 rounded" />
                    </div>
                  </div>
                </td>
                <td><div className="h-3 w-8 bg-vs-border rounded" /></td>
                <td><div className="h-3 w-10 bg-vs-border rounded" /></td>
                <td><div className="h-3 w-12 bg-vs-border rounded" /></td>
                <td><div className="h-4 w-14 bg-vs-border rounded" /></td>
                <td><div className="h-4 w-10 bg-vs-border rounded" /></td>
                <td><div className="h-3 w-20 bg-vs-border rounded" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
