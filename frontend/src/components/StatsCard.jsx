import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';

export default function StatsCard({ title, value, type, subtitle }) {
    return (
        <div className="bg-white px-6 py-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-300">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-[15px] text-gray-800 font-medium">{title}</h3>
                {type === 'warning' && (
                    <div className="bg-[#fff3e0] p-1.5 rounded-lg text-[#ff9800]">
                        <AlertTriangle size={18} className="fill-current" />
                    </div>
                )}
                {type === 'critical' && (
                    <div className="bg-[#ffebee] p-1.5 rounded-lg text-[#f44336]">
                        <AlertCircle size={18} className="fill-current" />
                    </div>
                )}
            </div>

            <div className="mt-auto">
                <div className={`text-[42px] font-bold leading-none tracking-tight ${type === 'success' ? 'text-[#4ade80]' :
                        type === 'warning' ? 'text-[#fbbf24]' :
                            type === 'critical' ? 'text-[#f87171]' :
                                'text-gray-900'
                    }`}>
                    {value}
                </div>
                {subtitle && (
                    <p className="text-[13px] text-gray-500 mt-2 font-medium">{subtitle}</p>
                )}
            </div>
        </div>
    );
}
