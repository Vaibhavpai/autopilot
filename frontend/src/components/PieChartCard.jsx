import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const data = [
    { name: 'Family', value: 4, color: '#93c5fd' }, // light blue
    { name: 'Friends', value: 12, color: '#86efac' }, // light green
    { name: 'Professional', value: 8, color: '#c4b5fd' }, // light purple
];

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
    const RADIAN = Math.PI / 180;
    // Position labels further out to make room for images
    const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    const align = x > cx ? 'start' : 'end';

    return (
        <g transform={`translate(${x},${y})`}>
            <foreignObject x={align === 'start' ? 0 : -100} y={-15} width="100" height="30">
                <div className={`flex items-center gap-2 ${align === 'start' ? 'justify-start' : 'justify-end'} w-full h-full`}>
                    {align === 'end' && <span className="text-[13px] font-medium text-gray-800 whitespace-nowrap">{data[index].name} ({data[index].value})</span>}

                    <img
                        src={`https://ui-avatars.com/api/?name=${data[index].name}&background=random&rounded=true&size=24`}
                        alt={data[index].name}
                        className="w-6 h-6 rounded-full shadow-sm"
                    />

                    {align === 'start' && <span className="text-[13px] font-medium text-gray-800 whitespace-nowrap">{data[index].name} ({data[index].value})</span>}
                </div>
            </foreignObject>
        </g>
    );
};

export default function PieChartCard() {
    return (
        <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 h-full flex flex-col">
            <h3 className="text-[18px] font-bold text-gray-900 mb-2">Relationship Distribution Pie Chart</h3>

            <div className="flex-1 w-full relative min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius={90}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                            labelLine={false}
                            label={renderCustomizedLabel}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    style={{ filter: `drop-shadow(0px 8px 12px ${entry.color}60)` }}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                            itemStyle={{ color: '#1f2937', fontWeight: 600 }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Bottom Legend */}
            <div className="flex justify-center items-center gap-6 mt-4">
                {data.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <img
                            src={`https://ui-avatars.com/api/?name=${item.name}&background=random&rounded=true&size=24`}
                            alt={item.name}
                            className="w-5 h-5 rounded-full"
                        />
                        <span className="text-[13px] font-medium text-gray-800">{item.name} ({item.value})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
