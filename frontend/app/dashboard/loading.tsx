export default function DashboardLoading() {
  return (
    <div className="px-6 py-6 max-w-5xl animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-16 bg-vs-border rounded mb-2" />
          <div className="h-4 w-40 bg-vs-border/60 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-vs-border rounded-lg" />
          <div className="h-9 w-20 bg-vs-border rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-3">
            <div className="h-4 w-20 bg-vs-border rounded" />
            <div className="h-8 w-24 bg-vs-border rounded" />
          </div>
        ))}
      </div>
      <div className="card p-5 mb-6">
        <div className="h-4 w-24 bg-vs-border rounded mb-4" />
        <div className="flex items-end gap-2 h-20">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 bg-vs-border rounded-t" style={{ height: `${20 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
