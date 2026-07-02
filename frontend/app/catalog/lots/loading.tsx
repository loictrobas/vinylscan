export default function LotsLoading() {
  return (
    <div className="px-6 py-6 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="h-6 w-12 bg-vs-border rounded mb-2" />
          <div className="h-4 w-16 bg-vs-border/60 rounded" />
        </div>
        <div className="h-9 w-24 bg-vs-border rounded-lg" />
      </div>
      <div className="h-10 w-64 bg-vs-border rounded-lg mb-4" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-3">
            <div className="h-3 w-20 bg-vs-border rounded" />
            <div className="h-7 w-16 bg-vs-border rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="h-4 w-40 bg-vs-border rounded mb-1.5" />
                <div className="h-3 w-28 bg-vs-border/60 rounded" />
              </div>
              <div className="h-4 w-4 bg-vs-border rounded" />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j}>
                  <div className="h-3 w-12 bg-vs-border/60 rounded mb-1" />
                  <div className="h-5 w-8 bg-vs-border rounded" />
                </div>
              ))}
            </div>
            <div className="h-1 bg-vs-border rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
