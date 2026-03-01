import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

const to100 = (val) => {
    if (val == null) return 0;
    return val > 1 ? Math.round(val) : Math.round(val * 100);
};

export default function ProfileSummary({ data }) {
    const score = to100(data.healthScore);

    // SVG semicircle via path — viewBox 160×85 shows only top half of circle
    const cx = 80, cy = 80, r = 60;
    const arcLen = Math.PI * r;
    const filled = arcLen * (score / 100);

    const gaugeColor = score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#f87171';

    return (
        <div className="bg-white/90 backdrop-blur-sm rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 flex h-full overflow-hidden">

            {/* Avatar — fixed width, full height */}
            <div className="w-[130px] shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-purple-50 relative">
                {data.image ? (
                    <img
                        src={data.image}
                        alt={data.name}
                        className="w-full h-full object-cover object-top"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <div
                    className="absolute inset-0 items-center justify-center text-4xl font-bold text-purple-400"
                    style={{ display: data.image ? 'none' : 'flex' }}
                >
                    {data.name?.charAt(0) ?? '?'}
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 flex flex-col px-5 py-4 min-w-0">

                {/* Name + type */}
                <div>
                    <p className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase mb-0.5">Contact</p>
                    <h2 className="text-[17px] font-bold text-gray-900 leading-tight truncate mb-1.5">{data.name}</h2>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-gray-400">Relationship:</span>
                        <span className="bg-violet-50 text-violet-600 border border-violet-100 px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize">
                            {data.type}
                        </span>
                    </div>
                </div>

                {/* Gauge + Drift row */}
                <div className="flex items-center gap-4 mt-auto pt-2">

                    {/* Mini semicircle gauge */}
                    <div className="flex flex-col items-center shrink-0">
                        <div className="relative w-[110px] h-[60px] overflow-hidden">
                            <svg viewBox="20 20 120 65" width="110" height="60" className="absolute top-0 left-0">
                                <defs>
                                    <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#818cf8" />
                                        <stop offset="100%" stopColor={gaugeColor} />
                                    </linearGradient>
                                </defs>
                                {/* BG arc */}
                                <path
                                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                                    fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round"
                                />
                                {/* FG arc */}
                                {score > 0 && (
                                    <path
                                        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                                        fill="none" stroke="url(#gGrad)" strokeWidth="10" strokeLinecap="round"
                                        strokeDasharray={`${filled} ${arcLen}`}
                                        style={{ transition: 'stroke-dasharray 1s ease-out' }}
                                    />
                                )}
                            </svg>
                            {/* Score text */}
                            <div className="absolute bottom-0 left-0 right-0 flex items-baseline justify-center gap-0.5">
                                <span className="text-[22px] font-black text-gray-900 leading-none">{score}</span>
                                <span className="text-[10px] text-gray-400 font-semibold">/100</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mt-0.5">Health Score</p>
                    </div>

                    {/* Divider */}
                    <div className="w-px h-10 bg-gray-100 shrink-0" />

                    {/* Drift */}
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center text-violet-500 shrink-0">
                            <SlidersHorizontal size={14} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Emotional Drift</p>
                            <p className="text-[13px] font-bold text-gray-800 capitalize truncate">{data.emotionalDrift}</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
