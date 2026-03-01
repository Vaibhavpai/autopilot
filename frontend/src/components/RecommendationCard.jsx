import React from 'react';

export default function RecommendationCard({ recommendation }) {
    if (!recommendation) return null;

    const { message = '', actions = [] } = recommendation;

    return (
        <div className="bg-white/90 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 flex flex-col h-full">
            <h3 className="text-[16px] text-gray-900 font-semibold mb-6">AI Recommendation</h3>

            <div className="flex-1 bg-white border border-gray-100 rounded-[20px] p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col justify-between">
                <p className="text-[14.5px] text-gray-800 leading-relaxed font-medium mb-6">
                    {message || 'No recommendation available yet.'}
                </p>

                {actions.length > 0 && (
                    <div className="flex gap-3 mt-auto">
                        {actions.map((action, i) => (
                            <button
                                key={i}
                                className={`px-6 py-2.5 rounded-[12px] text-[14.5px] font-semibold transition-colors flex-1 flex items-center justify-center gap-2 ${action.primary
                                        ? 'bg-[#A388FF] hover:bg-[#8e6cf6] text-white shadow-[0_4px_14px_rgba(163,136,255,0.4)]'
                                        : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'
                                    }`}
                            >
                                {action.icon && <span>{action.icon}</span>}
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
