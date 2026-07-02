export default function CatalogLoading() {
  return (
    <div className="px-6 py-6 pb-28 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="h-6 w-24 bg-vs-border rounded mb-2" />
          <div className="h-4 w-32 bg-vs-border/60 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-vs-border rounded-lg" />
          <div className="h-9 w-24 bg-vs-border rounded-lg" />
          <div className="h-9 w-28 bg-vs-border rounded-lg" />
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-vs-border px-5 py-3 flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 w-16 bg-vs-border rounded" />
          ))}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              {["", "Record", "Format", "Cond.", "Market", "Price", "Lot", ""].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="w-10"><div className="w-4 h-4 rounded bg-vs-border" /></td>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-vs-border flex-shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <div className="h-3 w-28 bg-vs-border rounded" />
                      <div className="h-3.5 w-40 bg-vs-border rounded" />
                    </div>
                  </div>
                </td>
                <td><div className="h-3 w-10 bg-vs-border rounded" /></td>
                <td><div className="h-4 w-8 bg-vs-border rounded-full" /></td>
                <td><div className="h-3 w-14 bg-vs-border rounded" /></td>
                <td><div className="h-3 w-12 bg-vs-border rounded" /></td>
                <td><div className="h-3 w-16 bg-vs-border rounded" /></td>
                <td><div className="h-6 w-10 bg-vs-border rounded-lg" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
