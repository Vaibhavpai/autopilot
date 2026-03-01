import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ── helpers ────────────────────────────────────────────────────────────────────

const to100 = (v) => {
    if (v == null) return 0;
    return v > 1 ? Math.round(v) : Math.round(v * 100);
};

/** Evenly space N nodes around a circle, with a little angular jitter */
function layoutNodes(contacts, cx, cy, maxR) {
    const n = contacts.length;
    return contacts.map((c, i) => {
        const score = to100(c.health_score) / 100;          // 0–1
        const distance = (1 - score) * maxR * 0.88 + maxR * 0.04; // healthy → near center

        // spread evenly, jitter slightly so labels don't collide
        const angle = (2 * Math.PI * i) / n - Math.PI / 2 + (i % 2 === 0 ? 0.08 : -0.08);

        return {
            ...c,
            x: cx + distance * Math.cos(angle),
            y: cy + distance * Math.sin(angle),
            score,
            distance,
        };
    });
}

/** Pick a color based on trend / ghosted — uses real pipeline trend values */
function nodeColor(c) {
    if (c.is_ghosted) return { fill: '#fca5a5', stroke: '#ef4444', text: '#991b1b' };
    if (c.trend === 'improving') return { fill: '#bbf7d0', stroke: '#22c55e', text: '#166534' };
    if (c.trend === 'at_risk') return { fill: '#fed7aa', stroke: '#f97316', text: '#7c2d12' };
    if (c.trend === 'declining') return { fill: '#fde68a', stroke: '#f59e0b', text: '#92400e' };
    const h = to100(c.health_score);
    if (h >= 70) return { fill: '#c4b5fd', stroke: '#7c3aed', text: '#4c1d95' };
    if (h >= 40) return { fill: '#bfdbfe', stroke: '#3b82f6', text: '#1e3a5f' };
    return { fill: '#e5e7eb', stroke: '#9ca3af', text: '#374151' };
}

// ── ring labels ────────────────────────────────────────────────────────────────

const RINGS = [
    { pct: 0.25, label: 'Very Close' },
    { pct: 0.50, label: 'Close' },
    { pct: 0.75, label: 'Drifting' },
    { pct: 1.00, label: 'Distant' },
];

// ── component ──────────────────────────────────────────────────────────────────

export default function RelationshipGraph({ contacts = [] }) {
    const svgRef = useRef(null);
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(null);   // contact object
    const [dims, setDims] = useState({ w: 600, h: 600 });

    // Responsive resize
    useEffect(() => {
        const el = svgRef.current?.parentElement;
        if (!el) return;
        const obs = new ResizeObserver(([entry]) => {
            const w = entry.contentRect.width;
            setDims({ w, h: Math.min(w, 560) });
        });
        obs.observe(el);
        setDims({ w: el.offsetWidth, h: Math.min(el.offsetWidth, 560) });
        return () => obs.disconnect();
    }, []);

    const { w, h } = dims;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy) - 48;

    const nodes = layoutNodes(contacts, cx, cy, maxR);

    return (
        <div className="w-full relative select-none">
            <svg
                ref={svgRef}
                width={w}
                height={h}
                className="overflow-visible"
            >
                <defs>
                    {/* Soft radial glow for center */}
                    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#7c5ff4" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#7c5ff4" stopOpacity="0" />
                    </radialGradient>
                    {/* Node shadow */}
                    <filter id="nodeShadow" x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00000020" />
                    </filter>
                </defs>

                {/* ── Concentric rings ── */}
                {RINGS.map(({ pct, label }) => {
                    const r = maxR * pct;
                    return (
                        <g key={label}>
                            <circle
                                cx={cx} cy={cy} r={r}
                                fill="none"
                                stroke="#e5e7eb"
                                strokeWidth="1"
                                strokeDasharray={pct < 1 ? '4 6' : ''}
                            />
                            <text
                                x={cx + r + 6}
                                y={cy + 4}
                                fill="#d1d5db"
                                fontSize="10"
                                fontFamily="Inter, sans-serif"
                            >{label}</text>
                        </g>
                    );
                })}

                {/* ── Center glow ── */}
                <circle cx={cx} cy={cy} r={maxR} fill="url(#centerGlow)" />

                {/* ── Lines from center to each node ── */}
                {nodes.map((n) => {
                    const col = nodeColor(n);
                    const opacity = 0.15 + n.score * 0.55;
                    const sw = 0.5 + n.score * 2.5;
                    return (
                        <line
                            key={`line-${n.contact_id}`}
                            x1={cx} y1={cy}
                            x2={n.x} y2={n.y}
                            stroke={col.stroke}
                            strokeWidth={sw}
                            strokeOpacity={opacity}
                        />
                    );
                })}

                {/* ── Nodes ── */}
                {nodes.map((n) => {
                    const col = nodeColor(n);
                    const isHov = hovered?.contact_id === n.contact_id;
                    const r = 7 + n.score * 8;   // size proportional to score

                    // Label side: right if node is left of center, else left
                    const labelX = n.x + (n.x > cx ? r + 5 : -(r + 5));
                    const anchor = n.x > cx ? 'start' : 'end';

                    return (
                        <g
                            key={n.contact_id}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={() => setHovered(n)}
                            onMouseLeave={() => setHovered(null)}
                            onClick={() => navigate(`/relationships/${n.contact_id}`)}
                        >
                            {/* Halo on hover */}
                            {isHov && (
                                <circle
                                    cx={n.x} cy={n.y}
                                    r={r + 10}
                                    fill={col.stroke}
                                    fillOpacity="0.12"
                                />
                            )}
                            {/* Node circle */}
                            <circle
                                cx={n.x} cy={n.y}
                                r={isHov ? r + 2 : r}
                                fill={col.fill}
                                stroke={col.stroke}
                                strokeWidth={isHov ? 2.5 : 1.5}
                                filter="url(#nodeShadow)"
                                style={{ transition: 'r 0.15s, stroke-width 0.15s' }}
                            />
                            {/* Initials inside circle */}
                            <text
                                x={n.x} y={n.y + 1}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={r > 12 ? '9' : '7'}
                                fontWeight="700"
                                fontFamily="Inter, sans-serif"
                                fill={col.text}
                                pointerEvents="none"
                            >
                                {(n.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </text>

                            {/* ── Hover: full name pill above node ── */}
                            {isHov && (() => {
                                const name = n.name || '?';
                                const charW = 7.2;
                                const pw = name.length * charW + 20;
                                const ph = 22;
                                const px = n.x - pw / 2;
                                const py = n.y - r - ph - 8;
                                return (
                                    <g pointerEvents="none">
                                        {/* Connector dot */}
                                        <line
                                            x1={n.x} y1={n.y - r - 3}
                                            x2={n.x} y2={py + ph}
                                            stroke={col.stroke}
                                            strokeWidth="1"
                                            strokeOpacity="0.4"
                                            strokeDasharray="2 2"
                                        />
                                        {/* Pill background */}
                                        <rect
                                            x={px} y={py}
                                            width={pw} height={ph}
                                            rx="11" ry="11"
                                            fill={col.stroke}
                                        />
                                        {/* Name text */}
                                        <text
                                            x={n.x} y={py + ph / 2 + 1}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontSize="11"
                                            fontWeight="700"
                                            fontFamily="Inter, sans-serif"
                                            fill="white"
                                        >{name}</text>
                                    </g>
                                );
                            })()}
                        </g>
                    );
                })}

                {/* ── Center "You" node ── */}
                <circle
                    cx={cx} cy={cy} r={22}
                    fill="#7c5ff4"
                    stroke="#5b3eb8"
                    strokeWidth="2"
                    filter="url(#nodeShadow)"
                />
                <text
                    x={cx} y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="Inter, sans-serif"
                    fill="white"
                >You</text>

                {/* ── Hover tooltip card (bottom-right details) ── */}
                {hovered && (() => {
                    const h100 = to100(hovered.health_score);
                    const col = nodeColor(hovered);
                    const bw = 160, bh = 80;
                    // Position tooltip to avoid going off-screen
                    const bx = hovered.x > cx
                        ? Math.min(hovered.x + 18, w - bw - 4)
                        : Math.max(hovered.x - bw - 18, 4);
                    const by = Math.max(4, Math.min(h - bh - 4, hovered.y - bh / 2));

                    return (
                        <g pointerEvents="none">
                            {/* Card shadow rect */}
                            <rect
                                x={bx} y={by}
                                width={bw} height={bh}
                                rx="12" ry="12"
                                fill="white"
                                stroke={col.stroke}
                                strokeWidth="1.5"
                                strokeOpacity="0.4"
                                filter="url(#nodeShadow)"
                            />
                            {/* Accent top bar */}
                            <rect x={bx} y={by} width={bw} height="4" rx="12" ry="0" fill={col.stroke} />
                            <rect x={bx} y={by + 2} width={bw} height="4" fill={col.stroke} />

                            <text x={bx + 12} y={by + 22} fontSize="12" fontWeight="800" fontFamily="Inter, sans-serif" fill="#111827">{hovered.name}</text>
                            <text x={bx + 12} y={by + 38} fontSize="10" fontFamily="Inter, sans-serif" fill="#9ca3af">
                                Health: <tspan fontWeight="700" fill={col.stroke}>{h100}/100</tspan>
                            </text>
                            <text x={bx + 12} y={by + 52} fontSize="10" fontFamily="Inter, sans-serif" fill="#9ca3af">
                                Trend: <tspan fontWeight="700" fill="#374151">{hovered.trend ?? '—'}</tspan>
                                {'   '}Type: <tspan fontWeight="700" fill="#374151">{(hovered.tag ?? '—').replace('_', ' ')}</tspan>
                            </text>
                            <text x={bx + 12} y={by + 66} fontSize="9" fontFamily="Inter, sans-serif" fill="#d1d5db">Click to open profile →</text>
                        </g>
                    );
                })()}
            </svg>

            {/* ── Legend ── */}
            <div className="flex flex-wrap gap-3 mt-3 px-2">
                {[
                    { color: '#7c3aed', fill: '#c4b5fd', label: 'Healthy (≥70)' },
                    { color: '#3b82f6', fill: '#bfdbfe', label: 'Stable (40–69)' },
                    { color: '#22c55e', fill: '#bbf7d0', label: 'Improving' },
                    { color: '#f97316', fill: '#fed7aa', label: 'At Risk' },
                    { color: '#ef4444', fill: '#fca5a5', label: 'Ghosted' },
                ].map(({ color, fill, label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <span className="w-3 h-3 rounded-full border" style={{ background: fill, borderColor: color }} />
                        {label}
                    </div>
                ))}
                <span className="text-[11px] text-gray-400 ml-auto">Node size = health score · Click to open profile</span>
            </div>
        </div>
    );
}
