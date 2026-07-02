"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Inbox, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { api, type SellTradeLead } from "@/lib/api";

const STATUS_STYLES: Record<SellTradeLead["status"], string> = {
  new: "bg-vs-accent/10 text-vs-accent",
  contacted: "bg-vs-warning/10 text-vs-warning",
  closed: "bg-vs-muted/20 text-vs-muted",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<SellTradeLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    api.listLeads().then(setLeads).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function setStatus(id: string, status: SellTradeLead["status"]) {
    setUpdatingId(id);
    try {
      const updated = await api.updateLeadStatus(id, status);
      setLeads((ls) => ls.map((l) => (l.id === id ? updated : l)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-vs-text">Sell/Trade Leads</h1>
        <p className="text-xs text-vs-muted mt-0.5">Submissions from your storefront's Sell/Trade form. Also emailed to you when they come in.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-vs-muted" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20">
          <Inbox size={28} className="text-vs-muted/40 mx-auto mb-2" />
          <p className="text-vs-muted text-sm">No leads yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {leads.map((lead) => {
            const expanded = expandedId === lead.id;
            return (
              <div key={lead.id} className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : lead.id)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-2xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_STYLES[lead.status]}`}>{lead.status}</span>
                    <p className="text-sm font-medium text-vs-text truncate">{lead.name}</p>
                    <p className="text-xs text-vs-muted truncate hidden sm:inline">{lead.email}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-vs-muted">{fmtDate(lead.created_at)}</span>
                    {expanded ? <ChevronUp size={14} className="text-vs-muted" /> : <ChevronDown size={14} className="text-vs-muted" />}
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t border-vs-border pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><p className="text-vs-muted mb-0.5">Email</p><a href={`mailto:${lead.email}`} className="text-vs-accent hover:underline flex items-center gap-1"><Mail size={11} />{lead.email}</a></div>
                      <div><p className="text-vs-muted mb-0.5">Approx. records</p><p className="text-vs-text">{lead.approx_records || "—"}</p></div>
                      <div><p className="text-vs-muted mb-0.5">Preferred payout</p><p className="text-vs-text capitalize">{lead.payout_preference || "—"}</p></div>
                    </div>
                    {lead.notes && (
                      <div>
                        <p className="text-xs text-vs-muted mb-0.5">Notes</p>
                        <p className="text-sm text-vs-text whitespace-pre-wrap">{lead.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      {(["new", "contacted", "closed"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(lead.id, s)}
                          disabled={updatingId === lead.id || lead.status === s}
                          className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-colors disabled:opacity-40 ${lead.status === s ? "border-vs-accent text-vs-accent bg-vs-accent/5" : "border-vs-border text-vs-muted hover:text-vs-text"}`}
                        >
                          Mark {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
