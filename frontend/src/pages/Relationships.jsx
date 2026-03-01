import React, { useEffect, useState, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import DashboardLayout from '../components/DashboardLayout';
import RelationshipFilter from '../components/RelationshipFilter';
import RelationshipTable from '../components/RelationshipTable';
import { getContacts } from '../api';

export default function Relationships() {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tagFilter, setTagFilter] = useState(null);   // backend tag string
    const [search, setSearch] = useState('');           // client-side name search

    // Re-fetch from backend when tag filter changes
    useEffect(() => {
        async function fetchContacts() {
            try {
                setLoading(true);
                const params = tagFilter ? { tag: tagFilter } : {};
                const data = await getContacts(params);
                setContacts(data.contacts || []);
            } catch (err) {
                setError(err.message);
                setContacts([]);
            } finally {
                setLoading(false);
            }
        }
        fetchContacts();
    }, [tagFilter]);

    // Client-side name search (no extra network request)
    const displayed = useMemo(() => {
        if (!search.trim()) return contacts;
        const q = search.toLowerCase();
        return contacts.filter(c => (c.name || '').toLowerCase().includes(q));
    }, [contacts, search]);

    function handleFilterChange({ tag }) {
        setTagFilter(tag);   // triggers useEffect to re-fetch
    }

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-8 custom-scrollbar">
                    <h2 className="text-[22px] font-semibold text-gray-900 mb-6 tracking-tight">Your Relationships</h2>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                            ⚠️ Backend error: <strong>{error}</strong>. Make sure FastAPI is running on port 8000.
                        </div>
                    )}

                    <div className="bg-white/90 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60">
                        <RelationshipFilter
                            onFilterChange={handleFilterChange}
                            onSearch={setSearch}
                        />

                        <div className="mt-6">
                            {loading ? (
                                <div className="text-center py-16 text-gray-400 text-sm">Loading contacts…</div>
                            ) : displayed.length === 0 ? (
                                <div className="text-center py-16 text-gray-400 text-sm">
                                    {search
                                        ? `No contacts matching "${search}".`
                                        : tagFilter
                                            ? `No contacts with type "${tagFilter.replace('_', ' ')}".`
                                            : 'No contacts found. Run the pipeline first to populate data.'}
                                </div>
                            ) : (
                                <>
                                    <p className="text-[13px] text-gray-400 mb-4">
                                        Showing <strong className="text-gray-600">{displayed.length}</strong> contact{displayed.length !== 1 ? 's' : ''}
                                        {tagFilter && <span className="ml-1">in <strong className="text-gray-600">{tagFilter.replace('_', ' ')}</strong></span>}
                                    </p>
                                    <RelationshipTable contacts={displayed} />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </DashboardLayout>
    );
}
