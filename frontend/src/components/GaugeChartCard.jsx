import React from 'react';

export default function GaugeChartCard() {
    const activeRelationships = 13.00;

    return (
        <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 h-full flex flex-col justify-between">
            <h3 className="text-[18px] font-bold text-gray-900 mb-6">Cognitive Load Gauge Chart</h3>

            <div className="relative w-full flex justify-center items-end mt-4 mb-2">

                {/* SVG Gauge */}
                <div className="relative w-[240px] h-[120px] overflow-hidden flex justify-center pb-2">
                    <svg className="absolute bottom-0 w-[240px] h-[240px]" viewBox="0 0 240 240">
                        <defs>
                            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#4ade80" /> {/* Green */}
                                <stop offset="50%" stopColor="#3b82f6" opacity="0.8" /> {/* Blue */}
                                <stop offset="100%" stopColor="#e2e8f0" /> {/* Gray */}
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Background Shadow Arc */}
                        <circle
                            cx="120"
                            cy="120"
                            r={100}
                            fill="transparent"
                            stroke="#e2e8f0"
                            strokeWidth="20"
                            strokeDasharray={`${Math.PI * 100} ${Math.PI * 100 * 2}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            className="transform origin-center rotate-180 opacity-50"
                        />

                        {/* Foreground Gradient Arc */}
                        <circle
                            cx="120"
                            cy="120"
                            r={100}
                            fill="transparent"
                            stroke="url(#gaugeGradient)"
                            strokeWidth="20"
                            strokeDasharray={`${Math.PI * 100} ${Math.PI * 100 * 2}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            className="transform origin-center rotate-180"
                            filter="url(#glow)"
                        />

                        {/* Inner tick marks */}
                        <g className="transform origin-center -rotate-180" stroke="#9ca3af" strokeWidth="2">
                            {[...Array(9)].map((_, i) => (
                                <line key={i} x1="120" y1="35" x2="120" y2="45" transform={`rotate(${(i * 22.5) - 90} 120 120)`} />
                            ))}
                        </g>

                        {/* Glowing Needle (pointing to right side) */}
                        <g className="transform origin-center transition-transform duration-1000" style={{ transform: `rotate(45deg)` }}>
                            <path d="M 120 120 L 120 40 L 117 120 Z" fill="#8b5cf6" filter="url(#glow)" />
                            <circle cx="120" cy="120" r="8" fill="#8b5cf6" />
                        </g>
                    </svg>
                </div>

                {/* Labels Left */}
                <div className="absolute left-0 top-[20%] text-center">
                    <span className="block text-[12px] text-gray-600 font-medium">Optimal range</span>
                    <span className="block text-[13px] text-emerald-500 font-bold">50% <span className="text-gray-500 font-normal">active</span></span>
                    <span className="block text-[12px] text-gray-500">relationships</span>
                </div>

                {/* Labels Right */}
                <div className="absolute right-0 top-[40%] text-center">
                    <span className="block text-[12px] text-gray-600 font-medium">Current active</span>
                    <span className="block text-[12px] text-gray-600 font-medium whitespace-nowrap">relationships</span>
                    <span className="block text-[16px] text-gray-900 font-bold">{activeRelationships.toFixed(2)}</span>
                </div>

            </div>

            <p className="text-center text-[13px] text-gray-600 font-medium mt-4">
                Optimize your relationship portfolio.
            </p>
        </div>
    );
}
