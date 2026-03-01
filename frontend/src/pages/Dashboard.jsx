import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import DashboardLayout from '../components/DashboardLayout';
import StatsCard from '../components/StatsCard';
import ChartSection from '../components/ChartSection';
import AlertsPreview from '../components/AlertsPreview';
import { getContacts, getActions } from '../api';

// Static chart shapes
const healthTrendData = [
    { name: 'Spm', value: 30 },
    { name: '', value: 65 },
    { name: '', value: 35 },
    { name: '', value: 95 },
    { name: '', value: 55 },
    { name: '', value: 100 },
    { name: '', value: 65 },
    { name: 'Time', value: 85 },
];

const responseTimeData = [
    { name: 'Jan', value: 42 },
    { name: 'Feb', value: 51 },
    { name: 'Mar', value: 36 },
    { name: 'Apr', value: 60 },
    { name: 'May', value: 68 },
    { name: 'Jun', value: 43 },
];

export default function Dashboard() {
    const [contacts, setContacts] = useState([]);
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const [contactsData, actionsData] = await Promise.all([
                    getContacts(),
                    getActions(),
                ]);
                setContacts(contactsData.contacts || []);
                setActions(actionsData.actions || []);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // ── Real stats derived from actual MongoDB field: trend + is_ghosted ──────
    // trend values: "stable" | "improving" | "at_risk" | "declining" | "ghosted"
    // health_score is a 0–1 float
    const healthyCount = contacts.filter(c => !c.is_ghosted && (c.trend === 'stable' || c.trend === 'improving')).length;
    const atRiskCount = contacts.filter(c => !c.is_ghosted && (c.trend === 'at_risk' || c.trend === 'declining')).length;
    const criticalCount = contacts.filter(c => c.is_ghosted).length;
    const totalCount = contacts.length;

    // Pending actions → AI Action Center preview
    const pendingActions = actions
        .filter(a => a.status === 'pending')
        .slice(0, 3)
        .map(a => ({
            message: a.suggested_message || a.reason || `Follow up with ${a.contact_name}`,
            contactName: a.contact_name,
            urgency: a.urgency,
            actions: [
                { label: 'Send', primary: true },
                { label: 'Edit', primary: false },
            ],
        }));

    const alertsToShow = pendingActions.length > 0
        ? pendingActions
        : [{ message: loading ? 'Loading…' : 'No pending actions. Run the pipeline to generate suggestions.', actions: [] }];

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-8 custom-scrollbar">
                    <h2 className="text-[20px] font-medium text-gray-800 mb-6 tracking-tight">Analytics</h2>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                            ⚠️ Backend error: <strong>{error}</strong>. Make sure FastAPI is running on port 8000.
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        <StatsCard title="Healthy Relationships" value={loading ? '—' : String(healthyCount)} type="success" />
                        <StatsCard title="At Risk" value={loading ? '—' : String(atRiskCount)} type="warning" />
                        <StatsCard title="Critical / Ghosted" value={loading ? '—' : String(criticalCount)} type="critical" />
                        <StatsCard title="Cognitive Load Score" value={loading ? '—' : String(totalCount)} subtitle="Active conversations" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 flex flex-col">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                                <ChartSection title="Relationship Health Trend" type="area" data={healthTrendData} />
                                <ChartSection title="Response Time Trend" type="bar" data={responseTimeData} />
                            </div>
                        </div>
                        <div className="lg:col-span-1 flex flex-col">
                            <AlertsPreview alerts={alertsToShow} />
                        </div>
                    </div>
                </div>
            </main>
        </DashboardLayout>
    );
}
