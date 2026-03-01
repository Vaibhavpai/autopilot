import React from 'react';

export default function AlertsPreview({ alerts }) {
    return (
        <div className="bg-white/90 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 flex flex-col h-full">
            <h3 className="text-[16px] text-gray-900 font-medium mb-6">AI Action Center</h3>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {alerts.map((alert, index) => (
                    <div key={index} className="px-5 py-5 border border-gray-100 rounded-[18px] bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] transition-all">
                        <p className="text-gray-800 text-[14.5px] mb-5 leading-relaxed tracking-tight">
                            {alert.message}
                        </p>
                        <div className="flex gap-3 mt-auto">
                            {alert.actions.map((action, i) => (
                                <button
                                    key={i}
                                    className={`px-6 py-2.5 rounded-[12px] text-sm font-medium transition-colors flex-1 ${action.primary
                                            ? 'bg-[#A388FF] hover:bg-[#8e6cf6] text-white shadow-sm'
                                            : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'
                                        }`}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
