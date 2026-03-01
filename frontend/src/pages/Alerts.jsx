import React, { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import AlertFilter from '../components/AlertFilter';
import AlertCard from '../components/AlertCard';
import { getActions, updateActionStatus } from '../api';
import { RefreshCw } from 'lucide-react';

// urgency from backend: "critical" | "high" | "medium" | "low"
const urgencyToRisk = {
    critical: 'High Risk',
    high: 'High Risk',
    medium: 'Medium Risk',
    low: 'Low Risk',
};

const typeToIcon = (action) => {
    const r = (action.reason || '').toLowerCase();
    if (r.includes('birthday')) return 'cake';
    if (r.includes('emotion') || r.includes('drift') || r.includes('sentiment')) return 'heart-rate';
    if (r.includes('plan') || r.includes('event') || r.includes('trip')) return 'calendar';
    return 'chat-clock';
};

export default function Alerts() {
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [urgencyFilter, setUrgencyFilter] = useState(null);  // lowercase or null

    useEffect(() => { fetchActions(); }, [urgencyFilter]);

    async function fetchActions() {
        try {
            setLoading(true);
            setError(null);
            // Pass both status=pending to backend so we only get pending actions
            const params = { status: 'pending' };
            if (urgencyFilter) params.urgency = urgencyFilter;
            const data = await getActions(params);
            setActions(data.actions || []);
        } catch (err) {
            setError(err.message);
            setActions([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleAction(actionId, status) {
        try {
            await updateActionStatus(actionId, status);
            // Remove from list immediately for instant UI feedback
            setActions(prev => prev.filter(a => a.action_id !== actionId));
        } catch (err) {
            console.error('Failed to update action status:', err);
        }
    }

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 pt-1 flex-wrap gap-3">
                        <div>
                            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Relationship Alerts</h2>
                            <p className="text-[13px] text-gray-400 mt-0.5">
                                {actions.length} pending action{actions.length !== 1 ? 's' : ''}
                                {urgencyFilter && <span className="ml-1">· filtered by <strong className="text-gray-600">{urgencyFilter}</strong></span>}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={fetchActions}
                                className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-violet-600 transition-colors"
                            >
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                            <AlertFilter onFilterChange={setUrgencyFilter} />
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                            ⚠️ Backend error: <strong>{error}</strong>
                        </div>
                    )}

                    {/* Table Headers */}
                    <div className="flex items-center px-6 mb-3 text-[14px] font-bold text-gray-900">
                        <div className="w-[60px] mr-6">Type</div>
                        <div className="flex-1">Alert Content</div>
                        <div className="w-[130px] text-center pl-6">Risk Level</div>
                        <div className="w-[200px] text-center pl-6">Suggested Action</div>
                    </div>

                    {loading ? (
                        <div className="text-center py-16 text-gray-400 text-sm">Loading alerts…</div>
                    ) : actions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                            <span className="text-5xl">✅</span>
                            <p className="text-[15px] font-semibold text-gray-600">All clear!</p>
                            <p className="text-sm">
                                {urgencyFilter
                                    ? `No pending ${urgencyFilter} alerts.`
                                    : 'No pending alerts. Run the pipeline to generate action items.'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 pb-8">
                            {actions.map((a, idx) => (
                                <AlertCard
                                    key={a.action_id || idx}
                                    alert={{
                                        id: a.action_id || idx,
                                        icon: typeToIcon(a),
                                        title: a.reason || 'Relationship Alert',
                                        description: a.suggested_message || `Action needed for ${a.contact_name || 'contact'}.`,
                                        person: a.contact_name,
                                        riskLevel: urgencyToRisk[a.urgency] || 'Low Risk',
                                        urgencyRaw: a.urgency,
                                        primaryAction: 'Send',
                                        onSend: () => handleAction(a.action_id, 'sent'),
                                        onDismiss: () => handleAction(a.action_id, 'dismissed'),
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </DashboardLayout>
    );
}
