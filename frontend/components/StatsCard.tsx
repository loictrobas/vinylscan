interface Props {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}

export function StatsCard({ label, value, icon }: Props) {
  return (
    <div className="card p-6 flex items-center gap-4">
      <div className="text-vinyl-accent">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-vinyl-muted text-sm">{label}</p>
      </div>
    </div>
  );
}
