import React from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';

const data = [
    { name: '1', A: 30, B: 20 },
    { name: '2', A: 45, B: 35 },
    { name: '3', A: 40, B: 30 },
    { name: '4', A: 70, B: 45 },
    { name: '5', A: 50, B: 40 },
    { name: '6', A: 55, B: 45 },
    { name: '7', A: 85, B: 55 },
    { name: '8', A: 65, B: 40 },
    { name: '9', A: 75, B: 60 },
    { name: '10', A: 60, B: 50 },
];

export default function LineGraphCard() {
    return (
        <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 h-full flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 z-10">
                <h3 className="text-[18px] font-bold text-gray-900">Emotional Drift Line Graph</h3>
                <span className="text-[15px] font-medium text-gray-600">Overall Trends</span>
            </div>

            <div className="flex-1 w-full relative min-h-[160px] z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#86efac" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#86efac" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="name" hide />
                        <YAxis hide domain={[0, 100]} />

                        {/* Background glowing line */}
                        <Area
                            type="monotone"
                            dataKey="B"
                            stroke="#86efac"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorB)"
                            style={{ filter: 'drop-shadow(0px 10px 10px rgba(134,239,172,0.6))' }}
                        />
                        {/* Foreground glowing line */}
                        <Area
                            type="monotone"
                            dataKey="A"
                            stroke="#c4b5fd"
                            strokeWidth={4}
                            fillOpacity={1}
                            fill="url(#colorA)"
                            style={{ filter: 'drop-shadow(0px 10px 10px rgba(196,181,253,0.6))' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>

                {/* Decorative Glowing Dots matching reference image */}
                <div className="absolute top-[25%] left-[30%] w-3 h-3 bg-white rounded-full border-2 border-[#93c5fd] shadow-[0_0_15px_4px_rgba(147,197,253,0.8)] z-20"></div>
                <div className="absolute top-[10%] left-[55%] w-3 h-3 bg-white rounded-full border-2 border-[#c4b5fd] shadow-[0_0_15px_4px_rgba(196,181,253,0.8)] z-20"></div>
            </div>

            {/* Axis Labels */}
            <div className="absolute left-6 top-1/2 -translate-y-1/2 -rotate-90 origin-left text-[11px] text-gray-500 font-medium whitespace-nowrap z-10">
                Trend (Positive/Negative)
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-gray-500 font-medium z-10">
                30 Days
            </div>

            {/* Fake bottom axis line */}
            <div className="absolute bottom-10 left-12 right-6 h-[1px] bg-gray-200"></div>
            <div className="absolute left-12 bottom-10 top-16 w-[1px] bg-gray-200"></div>
        </div>
    );
}
