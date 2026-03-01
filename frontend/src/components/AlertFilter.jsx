import React, { useState } from 'react';

// Map tab label → backend urgency value (lowercase), null = all
const TABS = [
    { label: 'All', urgency: null },
    { label: 'Critical', urgency: 'critical' },
    { label: 'High', urgency: 'high' },
    { label: 'Medium', urgency: 'medium' },
    { label: 'Low', urgency: 'low' },
];

const TAB_COLOR = {
    Critical: 'bg-red-500 text-white',
    High: 'bg-orange-400 text-white',
    Medium: 'bg-amber-400 text-white',
    Low: 'bg-yellow-300 text-gray-800',
    All: 'bg-[#7c5ff4] text-white',
};

export default function AlertFilter({ onFilterChange }) {
    const [active, setActive] = useState('All');

    function handleTab(item) {
        setActive(item.label);
        if (onFilterChange) onFilterChange(item.urgency);
    }

    return (
        <div className="flex bg-white/60 p-1 rounded-xl shadow-sm border border-white/40 backdrop-blur-md gap-0.5">
            {TABS.map(item => (
                <button
                    key={item.label}
                    onClick={() => handleTab(item)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${active === item.label
                            ? TAB_COLOR[item.label]
                            : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                        }`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
