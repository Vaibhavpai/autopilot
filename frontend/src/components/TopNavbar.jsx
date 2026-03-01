import React from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';

export default function TopNavbar() {
    const location = useLocation();
    const title = location.pathname.includes('/relationships') ? 'Relationships' : 'Dashboard';

    return (
        <header className="flex items-center justify-between py-8 px-10 flex-shrink-0 z-10 relative">
            <h1 className="text-[28px] font-semibold text-gray-900 capitalize">{title}</h1>

            <div className="flex items-center gap-5">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search"
                        className="pl-12 pr-4 py-2.5 bg-white/70 backdrop-blur-md rounded-full border border-white/50 shadow-[0_2px_10px_rgb(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[#7c5ff4]/20 focus:bg-white w-[280px] text-sm transition-all placeholder-gray-400"
                    />
                </div>

                <button className="bg-white/70 backdrop-blur-md p-3 rounded-full border border-white/50 shadow-[0_2px_10px_rgb(0,0,0,0.02)] text-gray-600 hover:text-gray-900 hover:bg-white transition-colors">
                    <Bell size={18} />
                </button>

                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer ml-1">
                    <img
                        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=150&auto=format&fit=crop"
                        alt="Profile"
                        className="w-full h-full object-cover"
                    />
                </div>
            </div>
        </header>
    );
}
