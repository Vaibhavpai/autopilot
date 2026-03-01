import React, { useEffect, useState, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import ReminderCard from '../components/ReminderCard';
import { getActions, updateActionStatus } from '../api';
import { Search, RefreshCw, Bell, Filter } from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────

const getType = (action) => {
    const r = (action.reason || '').toLowerCase();
    if (r.includes('birthday')) return 'birthday';
    if (r.includes('emotion') || r.includes('drift') || r.includes('sentiment')) return 'emotional';
    if (r.includes('inactiv') || r.includes('ghost') || r.includes('no contact')) return 'inactivity';
    return 'inactivity';
};

const getScheduleTime = (urgency) => {
    if (urgency === 'critical') return 'Today';
    if (urgency === 'high') return 'Today';
    if (urgency === 'medium') return 'Tomorrow';
    return 'This Week';
};

const URGENCY_GROUPS = [
    { key: 'critical', label: '🔴 Critical', sub: 'Reach out today — these need urgent attention' },
    { key: 'high', label: '🟠 High', sub: 'Prioritise today' },
    { key: 'medium', label: '🟡 Medium', sub: 'Soon — this week' },
    { key: 'low', label: '⚪ Low', sub: 'When you have time' },
];

const FILTER_TABS = ['All', 'Today', 'This Week'];

// ── page ───────────────────────────────────────────────────────────────────────

export default function Reminders() {
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [timeFilter, setTimeFilter] = useState('All');

    useEffect(() => { fetchReminders(); }, []);

    async function fetchReminders() {
        try {
            setLoading(true);
            setError(null);
            // Fetch only pending actions from backend
            const data = await getActions({ status: 'pending' });
            setActions(data.actions || []);
        } catch (err) {
            setError(err.message);
            setActions([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleSend(actionId) {
        try {
            await updateActionStatus(actionId, 'sent');
            setActions(prev => prev.filter(a => a.action_id !== actionId));
        } catch (err) {
            console.error('Failed to mark as sent:', err);
        }
    }

    async function handleDismiss(actionId) {
        try {
            await updateActionStatus(actionId, 'dismissed');
            setActions(prev => prev.filter(a => a.action_id !== actionId));
        } catch (err) {
            console.error('Failed to dismiss:', err);
        }
    }

    // Map to reminder objects
    const reminders = useMemo(() => actions.map((a, idx) => ({
        id: a.action_id || idx,
        type: getType(a),
        name: a.contact_name || 'Contact',
        description: a.reason || '',
        message: a.suggested_message || '',
        scheduleTime: getScheduleTime(a.urgency),
        urgency: a.urgency || 'low',
        onSend: () => handleSend(a.action_id),
        onDismiss: () => handleDismiss(a.action_id),
    })), [actions]);

    // Client-side filter: search + time
    const filtered = useMemo(() => reminders.filter(r => {
        const matchSearch = !search.trim() ||
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.description.toLowerCase().includes(search.toLowerCase());
        const matchTime = timeFilter === 'All' ||
            (timeFilter === 'Today' && r.scheduleTime === 'Today') ||
            (timeFilter === 'This Week' && (r.scheduleTime === 'Tomorrow' || r.scheduleTime === 'This Week'));
        return matchSearch && matchTime;
    }), [reminders, search, timeFilter]);

    // Group by urgency
    const grouped = useMemo(() => {
        const map = {};
        URGENCY_GROUPS.forEach(g => { map[g.key] = []; });
        filtered.forEach(r => {
            if (map[r.urgency]) map[r.urgency].push(r);
            else map['low'].push(r);
        });
        return map;
    }, [filtered]);

    const totalCount = reminders.length;
    const todayCount = reminders.filter(r => r.scheduleTime === 'Today').length;

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">

                    {/* Header */}
                    <div className="flex items-start justify-between mb-6 pt-1 flex-wrap gap-3">
                        <div>
                            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight flex items-center gap-2">
                                <Bell size={20} className="text-violet-500" /> Smart Reminders
                            </h2>
                            <p className="text-[13px] text-gray-400 mt-0.5">
                                {totalCount} pending · <strong className="text-red-500">{todayCount} due today</strong>
                            </p>
                        </div>
                        <button
                            onClick={fetchReminders}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-violet-600 transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px]">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Controls bar */}
                    <div className="flex items-center gap-3 mb-6 flex-wrap">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name or reason…"
                                className="pl-9 pr-4 py-2 text-[13px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200 w-[240px] placeholder-gray-400"
                            />
                        </div>

                        {/* Time filter tabs */}
                        <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-0.5">
                            {FILTER_TABS.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setTimeFilter(tab)}
                                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${timeFilter === tab
                                            ? 'bg-violet-500 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                >
                                    {tab}
                                    {tab === 'Today' && todayCount > 0 && (
                                        <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{todayCount}</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {filtered.length !== totalCount && (
                            <span className="text-[12px] text-gray-400">
                                Showing <strong>{filtered.length}</strong> of {totalCount}
                            </span>
                        )}
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="text-center py-20 text-gray-400 text-sm">Loading reminders…</div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                            <span className="text-5xl">🔔</span>
                            <p className="text-[15px] font-semibold text-gray-600">
                                {search ? `No reminders matching "${search}"` : 'All clear!'}
                            </p>
                            <p className="text-[13px] text-center text-gray-400">
                                {!search && 'No pending reminders. Run the pipeline to generate smart reminders.'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-8">
                            {URGENCY_GROUPS.map(({ key, label, sub }) => {
                                const group = grouped[key];
                                if (!group || group.length === 0) return null;
                                return (
                                    <section key={key}>
                                        <div className="flex items-baseline gap-3 mb-3">
                                            <h3 className="text-[15px] font-bold text-gray-900">{label}</h3>
                                            <span className="text-[12px] text-gray-400">{sub}</span>
                                            <span className="ml-auto text-[12px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                {group.length}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                            {group.map(reminder => (
                                                <ReminderCard key={reminder.id} reminder={reminder} />
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </DashboardLayout>
    );
}
