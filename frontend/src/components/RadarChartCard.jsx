import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Users, MessageSquare, Flame, Scale, HeartPulse } from 'lucide-react';

const data = [
    { subject: 'Frequency', A: 50, B: 40, fullMark: 50 },
    { subject: 'Responsiveness', A: 48, B: 30, fullMark: 50 },
    { subject: 'Warmth', A: 35, B: 45, fullMark: 50 },
    { subject: 'Initiative balance', A: 40, B: 25, fullMark: 50 },
    { subject: 'Emotional stability', A: 45, B: 38, fullMark: 50 },
];

const getIconForSubject = (subject) => {
    switch (subject) {
        case 'Frequency': return <div className="bg-emerald-100 p-1.5 rounded-lg mr-2"><Users size={14} className="text-emerald-600" /></div>;
        case 'Responsiveness': return <div className="bg-blue-100 p-1.5 rounded-lg mr-2"><MessageSquare size={14} className="text-blue-600" /></div>;
        case 'Warmth': return <div className="bg-purple-100 p-1.5 rounded-lg mr-2"><Flame size={14} className="text-purple-600" /></div>;
        case 'Initiative balance': return <div className="bg-amber-100 p-1.5 rounded-lg mr-2"><Scale size={14} className="text-amber-600" /></div>;
        case 'Emotional stability': return <div className="bg-red-100 p-1.5 rounded-lg mr-2"><HeartPulse size={14} className="text-red-600" /></div>;
        default: return null;
    }
};

const CustomTick = ({ payload, x, y, textAnchor, stroke, radius }) => {
    return (
        <g transform={`translate(${x},${y})`}>
            <foreignObject x={textAnchor === 'start' ? 0 : -140} y={-10} width="140" height="40">
                <div className={`flex items-center ${textAnchor === 'start' ? 'justify-start' : textAnchor === 'end' ? 'justify-end' : 'justify-center'} w-full h-full`}>
                    {textAnchor === 'end' && <span className="text-[12px] font-medium text-gray-800 leading-tight text-right mr-2">{payload.value}</span>}
                    {getIconForSubject(payload.value)}
                    {(textAnchor === 'start' || textAnchor === 'middle') && <span className="text-[12px] font-medium text-gray-800 leading-tight">{payload.value}</span>}
                </div>
            </foreignObject>
        </g>
    );
};

export default function RadarChartCard() {
    return (
        <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 h-full flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <h3 className="text-[18px] font-bold text-gray-900">Social Health Radar Chart</h3>
                <span className="text-[15px] font-medium text-gray-600">Personal Stats</span>
            </div>

            <div className="flex-1 w-full relative min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
                        <PolarGrid stroke="#e5e7eb" strokeWidth={1.5} />
                        <PolarAngleAxis
                            dataKey="subject"
                            tick={<CustomTick />}
                        />
                        <PolarRadiusAxis angle={90} domain={[0, 50]} tick={{ fill: '#6b7280', fontSize: 10 }} tickCount={4} />
                        <Radar name="User" dataKey="B" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.1} />
                        <Radar name="Average" dataKey="A" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.15} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
