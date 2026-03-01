import React, { useState } from 'react';
import { CalendarDays, MessageSquare, ChevronDown, Gift, TrendingDown, Users, Clock, Loader2, X } from 'lucide-react';

const TIMES = ['Today', 'Tomorrow', 'This Week', 'Next Week'];

const TYPE_CONFIG = {
    birthday: {
        icon: <Gift size={20} className="text-amber-500" />,
        bg: 'bg-amber-50',
        badge: 'bg-amber-100 text-amber-700',
        label: '🎂 Birthday',
    },
    emotional: {
        icon: <TrendingDown size={20} className="text-purple-500" />,
        bg: 'bg-purple-50',
        badge: 'bg-purple-100 text-purple-700',
        label: '💜 Emotional Check-in',
    },
    inactivity: {
        icon: <Clock size={20} className="text-blue-500" />,
        bg: 'bg-blue-50',
        badge: 'bg-blue-100 text-blue-700',
        label: '⏱ Re-engage',
    },
    default: {
        icon: <Users size={20} className="text-gray-500" />,
        bg: 'bg-gray-50',
        badge: 'bg-gray-100 text-gray-600',
        label: '👤 Reminder',
    },
};

const URGENCY_COLORS = {
    critical: 'bg-red-500',
    high: 'bg-orange-400',
    medium: 'bg-amber-400',
    low: 'bg-gray-300',
};

export default function ReminderCard({ reminder }) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedTime, setSelectedTime] = useState(reminder.scheduleTime || 'Today');
    const [sending, setSending] = useState(false);
    const [dismissing, setDismissing] = useState(false);

    const cfg = TYPE_CONFIG[reminder.type] || TYPE_CONFIG.default;

    // Avatar initials fallback
    const initials = (reminder.name || '?')
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    async function handleSend() {
        if (!reminder.onSend) return;
        setSending(true);
        try { await reminder.onSend(); } finally { setSending(false); }
    }

    async function handleDismiss() {
        if (!reminder.onDismiss) return;
        setDismissing(true);
        try { await reminder.onDismiss(); } finally { setDismissing(false); }
    }

    return (
        <div className="bg-white/95 backdrop-blur-sm rounded-[22px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] flex flex-col hover:shadow-[0_8px_32px_rgb(0,0,0,0.07)] transition-all relative overflow-hidden">

            {/* Urgency color bar top */}
            <div className={`h-1 w-full ${URGENCY_COLORS[reminder.urgency] || 'bg-gray-200'}`} />

            <div className="p-5 flex flex-col gap-4 flex-1">

                {/* Header */}
                <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-bold text-[14px] shrink-0 shadow-sm">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[15px] font-bold text-gray-900 truncate">{reminder.name}</h3>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                                {cfg.label}
                            </span>
                        </div>
                        <p className="text-[12px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{reminder.description}</p>
                    </div>
                    {/* Dismiss X */}
                    <button
                        onClick={handleDismiss}
                        disabled={sending || dismissing}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all shrink-0 disabled:opacity-30"
                        title="Dismiss"
                    >
                        {dismissing ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    </button>
                </div>

                {/* Message bubble */}
                <div className="bg-violet-50 rounded-[16px] rounded-tl-sm px-4 py-3 flex-1">
                    <div className="flex items-start gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                            {cfg.icon}
                        </div>
                        <p className="text-[13px] text-gray-700 leading-relaxed font-medium flex-1 line-clamp-4">
                            "{reminder.message}"
                        </p>
                    </div>
                </div>

                {/* Footer: schedule + send */}
                <div className="flex items-center gap-2">

                    {/* Schedule picker */}
                    <div className="relative flex-1">
                        <div
                            onClick={() => setIsOpen(p => !p)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white cursor-pointer transition-all"
                        >
                            <CalendarDays size={13} className="text-gray-400 shrink-0" />
                            <span className="text-[12px] font-semibold text-gray-700 flex-1">{selectedTime}</span>
                            <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                        {isOpen && (
                            <div className="absolute bottom-full mb-1 left-0 right-0 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                                {TIMES.map(t => (
                                    <div
                                        key={t}
                                        onClick={() => { setSelectedTime(t); setIsOpen(false); }}
                                        className={`px-3 py-2 text-[12px] font-semibold cursor-pointer transition-colors ${t === selectedTime
                                                ? 'bg-violet-50 text-violet-700'
                                                : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        {t}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Send button */}
                    <button
                        onClick={handleSend}
                        disabled={sending || dismissing}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7c5ff4] hover:bg-[#6a4fe0] text-white text-[12px] font-bold shadow-[0_4px_12px_rgba(124,95,244,0.35)] disabled:opacity-50 transition-all"
                    >
                        {sending
                            ? <Loader2 size={13} className="animate-spin" />
                            : <MessageSquare size={13} className="opacity-80" />}
                        {sending ? 'Sending…' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
}
