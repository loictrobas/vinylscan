export default function SalesLoading() {
  return (
    <div className="px-6 py-6 animate-pulse">
      <div className="h-6 w-32 bg-vs-border rounded mb-1" />
      <div className="h-4 w-44 bg-vs-border/60 rounded mb-5" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <div className="card p-4">
            <div className="h-10 bg-vs-border rounded-lg mb-3" />
            <div className="flex flex-col gap-2 py-6 items-center">
              <div className="h-6 w-6 bg-vs-border rounded" />
              <div className="h-4 w-40 bg-vs-border/60 rounded" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="card p-4">
            <div className="h-5 w-12 bg-vs-border rounded mb-3" />
            <div className="py-16 flex flex-col items-center gap-2">
              <div className="h-6 w-6 bg-vs-border rounded" />
              <div className="h-4 w-28 bg-vs-border/60 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
