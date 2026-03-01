import React, { useState } from 'react';
import { Search } from 'lucide-react';

// Real tag values from MongoDB (exact lowercase strings stored in DB)
// Display label → backend tag query value (null = all)
const FILTERS = [
    { label: 'All', tag: null },
    { label: 'Close Friends', tag: 'close_friend' },
    { label: 'Family', tag: 'family' },
    { label: 'Work', tag: 'work' },
    { label: 'Mentor', tag: 'mentor' },
    { label: 'Romantic', tag: 'romantic' },
    { label: 'Acquaintance', tag: 'acquaintance' },
];

export default function RelationshipFilter({ onFilterChange, onSearch }) {
    const [active, setActive] = useState('All');
    const [search, setSearch] = useState('');

    function handleFilter(item) {
        setActive(item.label);
        if (onFilterChange) onFilterChange({ tag: item.tag });
    }

    function handleSearch(e) {
        setSearch(e.target.value);
        if (onSearch) onSearch(e.target.value);
    }

    return (
        <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                    type="text"
                    value={search}
                    onChange={handleSearch}
                    placeholder="Search contacts…"
                    className="pl-9 pr-4 py-2 bg-gray-50/80 rounded-xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#7c5ff4]/20 focus:bg-white w-[220px] text-sm transition-all placeholder-gray-400"
                />
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1 flex-wrap">
                {FILTERS.map((item, index) => (
                    <React.Fragment key={item.label}>
                        <button
                            onClick={() => handleFilter(item)}
                            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap ${active === item.label
                                    ? 'bg-[#e9e3fe] text-[#7c5ff4]'
                                    : 'text-gray-500 hover:text-gray-800 flex items-center gap-1.5'
                                }`}
                        >
                            {active !== item.label && (
                                <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />
                            )}
                            {item.label}
                        </button>
                        {index < FILTERS.length - 1 && (
                            <div className="w-px h-4 bg-gray-100 mx-0.5" />
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
