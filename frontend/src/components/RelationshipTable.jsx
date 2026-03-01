import React from 'react';
import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Helpers ───────────────────────────────────────────────────────────────────

// trend: "stable"|"improving"|"at_risk"|"declining" + is_ghosted
const getStatusStyle = (contact) => {
    if (contact.is_ghosted) return 'bg-[#f87171] text-white';
    switch (contact.trend) {
        case 'improving': return 'bg-[#4ade80] text-white';
        case 'stable': return 'bg-[#4ade80] text-white';
        case 'at_risk': return 'bg-[#fbbf24] text-white';
        case 'declining': return 'bg-[#fbbf24] text-white';
        default: return 'bg-gray-100 text-gray-600';
    }
};

const getStatusLabel = (contact) => {
    if (contact.is_ghosted) return 'Ghosted';
    switch (contact.trend) {
        case 'improving': return 'Improving';
        case 'stable': return 'Stable';
        case 'at_risk': return 'At Risk';
        case 'declining': return 'Declining';
        default: return contact.trend || 'Unknown';
    }
};

// health_score is 0–1 float from backend
const getHealthBarColor = (score01) => {
    if (score01 >= 0.7) return 'bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.5)]';
    if (score01 >= 0.4) return 'bg-[#fbbf24] shadow-[0_0_12px_rgba(251,191,36,0.5)]';
    return 'bg-[#f87171] shadow-[0_0_12px_rgba(248,113,113,0.5)]';
};

const formatLastSeen = (isoDate) => {
    if (!isoDate) return 'Unknown';
    const diff = Date.now() - new Date(isoDate).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function RelationshipTable({ contacts = [] }) {
    if (contacts.length === 0) return null;

    return (
        <div className="w-full">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-gray-100">
                        <th className="pb-4 font-semibold text-gray-900 text-[15px] pl-4 w-[25%]">Name</th>
                        <th className="pb-4 font-semibold text-gray-900 text-[15px] w-[15%]">Type</th>
                        <th className="pb-4 font-semibold text-gray-900 text-[15px] w-[20%]">Health Score</th>
                        <th className="pb-4 font-semibold text-gray-900 text-[15px] w-[15%]">Last Interaction</th>
                        <th className="pb-4 font-semibold text-gray-900 text-[15px] w-[12%]">Status</th>
                        <th className="pb-4 font-semibold text-gray-900 text-[15px] text-center w-[13%]">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {contacts.map((row, idx) => {
                        const score = row.health_score ?? 0; // 0–1 float
                        const pct = Math.round(score * 100);
                        return (
                            <tr
                                key={row.contact_id || idx}
                                onClick={() => window.location.href = `/relationships/${row.contact_id}`}
                                className="border-b border-gray-50 transition-colors cursor-pointer hover:bg-gray-50/50"
                            >
                                <td className="py-4 pl-4">
                                    <div className="flex items-center gap-3">
                                        {row.avatar ? (
                                            <img
                                                src={row.avatar}
                                                alt={row.name}
                                                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                                                {row.name?.charAt(0) ?? '?'}
                                            </div>
                                        )}
                                        <div>
                                            <div className="font-medium text-gray-800">{row.name}</div>
                                            <div className="text-xs text-gray-400 capitalize">{row.platform || ''}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <span className="bg-gray-100 px-3 py-1 rounded-md text-gray-600 text-sm font-medium capitalize">
                                        {row.tag || '—'}
                                    </span>
                                </td>
                                <td className="py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${getHealthBarColor(score)}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-500">{pct}</span>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <span className="text-gray-600 text-[15px]">
                                        {formatLastSeen(row.last_message_at)}
                                    </span>
                                </td>
                                <td className="py-4">
                                    <span className={`px-4 py-1 rounded-md text-sm font-medium ${getStatusStyle(row)}`}>
                                        {getStatusLabel(row)}
                                    </span>
                                </td>
                                <td className="py-4 text-center">
                                    <Link
                                        to={`/relationships/${row.contact_id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl border border-gray-200 text-[#7c5ff4] font-medium hover:bg-gray-50 transition-colors w-full max-w-[100px]"
                                    >
                                        <Eye size={16} />
                                        View
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
