import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import RelationshipGraph from '../components/RelationshipGraph';
import { Users, TrendingUp, TrendingDown, Ghost, Heart, RefreshCw, Loader2 } from 'lucide-react';

const BASE = '/api';

const to100 = (v) => {
    if (v == null) return 0;
    return v > 1 ? Math.round(v) : Math.round(v * 100);
};

// ── Stat mini-card ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }) {
    return (
        <div className={`bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                <p className="text-[20px] font-bold text-gray-900 leading-tight">{value}</p>
                {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
            </div>
        </div>
    );
}

// ── Top contacts list ──────────────────────────────────────────────────────────

function ContactRankList({ contacts, title, sortFn, colorFn, valueFn }) {
    const sorted = [...contacts].sort(sortFn).slice(0, 5);
    return (
        <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-4">{title}</h3>
            <div className="flex flex-col gap-3">
                {sorted.map((c, i) => {
                    const val = valueFn(c);
                    const col = colorFn(c);
                    return (
                        <div key={c.contact_id ?? i} className="flex items-center gap-3">
                            <span className="text-[11px] text-gray-300 font-bold w-4 shrink-0">#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-gray-800 truncate">{c.name}</p>
                                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${val}%`, backgroundColor: col }}
                                    />
                                </div>
                            </div>
                            <span className="text-[12px] font-bold shrink-0" style={{ color: col }}>{val}</span>
                        </div>
                    );
                })}
                {sorted.length === 0 && (
                    <p className="text-[12px] text-gray-400 text-center py-4">No data yet</p>
                )}
            </div>
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Insights() {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    async function fetchContacts() {
        try {
            setLoading(true);
            const res = await fetch(`${BASE}/contacts/`);
            const data = await res.json();
            setContacts(data.contacts || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchContacts(); }, []);

    // ── Derived stats ──────────────────────────────────────────────────────────

    const total = contacts.length;
    const ghosted = contacts.filter(c => c.is_ghosted).length;
    const healthy = contacts.filter(c => to100(c.health_score) >= 70).length;
    const improving = contacts.filter(c => c.trend === 'improving').length;
    const declining = contacts.filter(c => c.trend === 'at_risk' || c.trend === 'declining').length;
    const avgHealth = total
        ? Math.round(contacts.reduce((s, c) => s + to100(c.health_score), 0) / total)
        : 0;

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">

                    {/* ── Header ── */}
                    <div className="flex items-center justify-between mb-6 pt-1">
                        <div>
                            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Relationship Insights</h2>
                            <p className="text-[13px] text-gray-400 mt-0.5">
                                Visual map of your social network — closer to centre = stronger relationship
                            </p>
                        </div>
                        <button
                            onClick={fetchContacts}
                            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-violet-600 transition-colors"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px]">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* ── Stat row ── */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
                        <StatCard
                            icon={<Users size={18} className="text-violet-600" />}
                            label="Total Contacts" value={total}
                            sub="in your network"
                            color="bg-violet-50"
                        />
                        <StatCard
                            icon={<Heart size={18} className="text-green-600" />}
                            label="Healthy" value={healthy}
                            sub="score ≥ 70"
                            color="bg-green-50"
                        />
                        <StatCard
                            icon={<TrendingUp size={18} className="text-blue-600" />}
                            label="Improving" value={improving}
                            sub="trend: improving"
                            color="bg-blue-50"
                        />
                        <StatCard
                            icon={<TrendingDown size={18} className="text-amber-600" />}
                            label="At Risk" value={declining}
                            sub="at_risk or declining"
                            color="bg-amber-50"
                        />
                        <StatCard
                            icon={<Ghost size={18} className="text-red-500" />}
                            label="Ghosted" value={ghosted}
                            sub={`avg health: ${avgHealth}`}
                            color="bg-red-50"
                        />
                    </div>

                    {/* ── Main layout: graph + side lists ── */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                        {/* Relationship Graph — takes 2/3 */}
                        <div className="xl:col-span-2 bg-white/90 backdrop-blur-sm rounded-[24px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[15px] font-semibold text-gray-900">Relationship Web</h3>
                                <div className="flex items-center gap-4 text-[11px] text-gray-400">
                                    <span>⬤ Size = health score</span>
                                    <span>← Distance from centre = closeness</span>
                                </div>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center h-[400px] text-gray-400">
                                    <Loader2 size={24} className="animate-spin mr-2" /> Loading graph…
                                </div>
                            ) : contacts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-[400px] text-gray-400 gap-2">
                                    <Users size={36} className="text-gray-200" />
                                    <p className="text-sm">No contacts yet. Run the pipeline first.</p>
                                </div>
                            ) : (
                                <RelationshipGraph contacts={contacts} />
                            )}
                        </div>

                        {/* Side lists — 1/3 */}
                        <div className="xl:col-span-1 flex flex-col gap-5">

                            {/* Strongest bonds */}
                            <ContactRankList
                                contacts={contacts}
                                title="💪 Strongest Bonds"
                                sortFn={(a, b) => to100(b.health_score) - to100(a.health_score)}
                                valueFn={(c) => to100(c.health_score)}
                                colorFn={(c) => {
                                    const h = to100(c.health_score);
                                    return h >= 70 ? '#7c3aed' : h >= 40 ? '#3b82f6' : '#9ca3af';
                                }}
                            />

                            {/* Needs attention */}
                            <ContactRankList
                                contacts={contacts}
                                title="⚠️ Needs Attention"
                                sortFn={(a, b) => to100(a.health_score) - to100(b.health_score)}
                                valueFn={(c) => to100(c.health_score)}
                                colorFn={() => '#f87171'}
                            />

                            {/* Most active */}
                            <ContactRankList
                                contacts={contacts}
                                title="🔥 Most Active"
                                sortFn={(a, b) => (b.total_messages ?? 0) - (a.total_messages ?? 0)}
                                valueFn={(c) => {
                                    const max = Math.max(...contacts.map(x => x.total_messages ?? 0), 1);
                                    return Math.round(((c.total_messages ?? 0) / max) * 100);
                                }}
                                colorFn={() => '#f59e0b'}
                            />
                        </div>
                    </div>
                </div>
            </main>
        </DashboardLayout>
    );
}
