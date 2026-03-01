import React from 'react';

export default function DashboardLayout({ children }) {
    return (
        <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden rounded-[32px] mesh-bg shadow-xl ring-1 ring-black/5 bg-white/40 backdrop-blur-xl">
            {children}
        </div>
    );
}
