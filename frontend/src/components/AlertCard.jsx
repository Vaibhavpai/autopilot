import React, { useState } from 'react';
import { MessageSquare, CalendarDays, LineChart, X, Check, Loader2 } from 'lucide-react';

const ICONS = {
    'chat-clock': (col) => <MessageSquare size={22} className={col} />,
    'heart-rate': (col) => <LineChart size={22} className={col} />,
    'calendar': (col) => <CalendarDays size={22} className={col} />,
    'cake': () => <span className="text-xl">🎂</span>,
};

const ICON_BG = {
    'chat-clock': 'bg-violet-50',
    'heart-rate': 'bg-red-50',
    'calendar': 'bg-amber-50',
    'cake': 'bg-emerald-50',
};

const ICON_COLOR = {
    'chat-clock': 'text-violet-500',
    'heart-rate': 'text-red-400',
    'calendar': 'text-amber-500',
    'cake': '',
};

const RISK_STYLE = {
    'High Risk': 'bg-red-100 text-red-700 border border-red-200',
    'Medium Risk': 'bg-amber-100 text-amber-700 border border-amber-200',
    'Low Risk': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
};

const URGENCY_DOT = {
    critical: 'bg-red-500',
    high: 'bg-orange-400',
    medium: 'bg-amber-400',
    low: 'bg-gray-300',
};

export default function AlertCard({ alert }) {
    const [sending, setSending] = useState(false);
    const [dismissing, setDismissing] = useState(false);

    const iconFn = ICONS[alert.icon] || ICONS['chat-clock'];
    const iconBg = ICON_BG[alert.icon] || 'bg-gray-50';
    const iconCol = ICON_COLOR[alert.icon] || 'text-gray-400';

    async function handleSend() {
        if (!alert.onSend) return;
        setSending(true);
        try { await alert.onSend(); } finally { setSending(false); }
    }

    async function handleDismiss() {
        if (!alert.onDismiss) return;
        setDismissing(true);
        try { await alert.onDismiss(); } finally { setDismissing(false); }
    }

    return (
        <div className="bg-white/95 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] flex items-center gap-0 overflow-hidden hover:shadow-[0_6px_28px_rgb(0,0,0,0.07)] transition-shadow">

            {/* Urgency color bar */}
            <div className={`w-1 self-stretch shrink-0 ${URGENCY_DOT[alert.urgencyRaw] || 'bg-gray-200'}`} />

            {/* Icon */}
            <div className="px-5 py-5 shrink-0">
                <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center ${iconBg}`}>
                    {iconFn(iconCol)}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 py-4 pr-4 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${URGENCY_DOT[alert.urgencyRaw] || 'bg-gray-300'}`} />
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                        {alert.urgencyRaw ?? 'low'} · {alert.person || 'Unknown'}
                    </span>
                </div>
                <h3 className="text-[14px] font-bold text-gray-900 leading-snug mb-1 truncate">{alert.title}</h3>
                <p className="text-[13px] text-gray-500 leading-snug line-clamp-2">{alert.description}</p>
            </div>

            {/* Risk badge */}
            <div className="px-5 shrink-0">
                <span className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap ${RISK_STYLE[alert.riskLevel] || 'bg-gray-100 text-gray-600'}`}>
                    {alert.riskLevel}
                </span>
            </div>

            {/* Action buttons */}
            <div className="px-5 py-5 shrink-0 flex items-center gap-2 border-l border-gray-100">
                <button
                    onClick={handleSend}
                    disabled={sending || dismissing}
                    className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-[#7c5ff4] hover:bg-[#6a4fe0] text-white shadow-[0_4px_14px_rgba(124,95,244,0.35)] disabled:opacity-50 flex items-center gap-1.5 transition-all"
                >
                    {sending
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Check size={13} />}
                    {sending ? 'Sending…' : 'Done'}
                </button>
                <button
                    onClick={handleDismiss}
                    disabled={sending || dismissing}
                    className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-50 transition-all"
                    title="Dismiss"
                >
                    {dismissing
                        ? <Loader2 size={15} className="animate-spin" />
                        : <X size={15} />}
                </button>
            </div>
        </div>
    );
}
