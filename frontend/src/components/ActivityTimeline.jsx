import React from 'react';
import { MessageSquare, TrendingUp, Clock, Calendar, Heart } from 'lucide-react';

const getIcon = (type) => {
    switch (type) {
        case 'chat': return <MessageSquare size={18} />;
        case 'sentiment': return <TrendingUp size={18} />;
        case 'inactivity': return <Clock size={18} />;
        case 'event': return <Calendar size={18} />;
        case 'health': return <Heart size={18} />;
        default: return <div className="w-2.5 h-2.5 bg-gray-300 rounded-full" />;
    }
};

const getIconColors = (type) => {
    switch (type) {
        case 'chat': return 'bg-[#f3efff] text-[#7c5ff4]';
        case 'sentiment': return 'bg-amber-50 text-amber-500';
        case 'inactivity': return 'bg-red-50 text-red-400';
        case 'event': return 'bg-blue-50 text-blue-500';
        case 'health': return 'bg-green-50 text-green-500';
        default: return 'bg-gray-50 text-gray-400';
    }
};

export default function ActivityTimeline({ timeline = [] }) {
    if (!timeline || timeline.length === 0) {
        return (
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 h-full flex flex-col">
                <h3 className="text-[18px] text-gray-900 font-semibold mb-6">Activity Timeline</h3>
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    No activity data available yet.
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white/90 backdrop-blur-sm p-8 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60 h-full">
            <h3 className="text-[18px] text-gray-900 font-semibold mb-8">Activity Timeline</h3>

            <div className="relative flex flex-col gap-6">
                {/* Vertical spine */}
                {timeline.length > 1 && (
                    <div className="absolute left-[23px] top-12 bottom-6 w-[2px] bg-gray-100 -z-10" />
                )}

                {timeline.map((item, index) => (
                    <div key={index} className="flex gap-5 relative group">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-[3px] border-white shadow-sm z-10 ${getIconColors(item.type)}`}>
                            {getIcon(item.type)}
                        </div>

                        <div className="pt-1 flex-1">
                            {item.title && (
                                <h4 className="text-[15px] font-semibold text-gray-900 mb-0.5">{item.title}</h4>
                            )}
                            {item.description && (
                                <p className="text-[14px] text-gray-600 leading-snug">{item.description}</p>
                            )}
                            {item.time && (
                                <p className="text-[13px] text-gray-400 font-medium mt-1">{item.time}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
