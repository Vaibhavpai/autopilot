import React, { useState } from 'react';
import { CheckCircle2, Radio, Webhook, Loader2, Info } from 'lucide-react';
import { testN8nConnection } from '../api';

export default function AutomationBar() {
    // Treat toggle as local state since the original code was completely static
    // It's just for visualizing the "automation mode" concept for now
    const [isAutoON, setIsAutoON] = useState(true);

    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null); // { success: boolean, msg: string }

    async function handleTestN8n() {
        setTesting(true);
        setTestResult(null);
        try {
            await testN8nConnection();
            setTestResult({ success: true, msg: "n8n Webhook Test Successful" });
        } catch (err) {
            setTestResult({ success: false, msg: "n8n error: Could not reach webhook" });
        } finally {
            setTesting(false);
            setTimeout(() => setTestResult(null), 4000);
        }
    }

    return (
        <div className="flex flex-col gap-3 mb-8">
            <div className="flex items-center gap-4">
                {/* Main Control Pill */}
                <div className="bg-white/95 backdrop-blur-sm rounded-full px-6 py-3 flex items-center gap-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60">
                    <span className="text-[18px] font-bold text-gray-900 flex items-center gap-2">
                        n8n Automation Controls
                    </span>

                    {/* Toggle Switch */}
                    <div
                        onClick={() => setIsAutoON(!isAutoON)}
                        className={`w-[44px] h-[24px] rounded-full relative cursor-pointer flex items-center transition-colors ${isAutoON ? 'bg-[#8b5cf6]' : 'bg-gray-300'
                            }`}
                    >
                        <div
                            className={`w-[20px] h-[20px] bg-white rounded-full absolute shadow-sm transition-transform ${isAutoON ? 'translate-x-[22px]' : 'translate-x-[2px]'
                                }`}
                        />
                    </div>

                    <div className="flex items-center gap-1.5 text-[15.5px] font-semibold">
                        <span className="text-gray-800">Auto-action execution</span>
                        <span className={`flex items-center gap-1 transition-colors ${isAutoON ? 'text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-gray-400'}`}>
                            {isAutoON ? 'ON' : 'OFF'}
                            {isAutoON && <CheckCircle2 size={16} className="fill-emerald-100" />}
                        </span>
                    </div>
                </div>

                {/* Decorative Radio Icons */}
                <div className={`flex items-center gap-6 px-1 transition-opacity ${isAutoON ? 'opacity-100' : 'opacity-40'}`}>
                    <Radio size={22} className="text-[#8b5cf6] animate-pulse" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))' }} />
                    <Radio size={22} className="text-emerald-500 animate-pulse delay-150" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))' }} />
                </div>

                {/* Test n8n Webhook Button */}
                <button
                    onClick={handleTestN8n}
                    disabled={testing}
                    className="bg-white/95 backdrop-blur-sm rounded-full px-5 py-3 flex items-center gap-2 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-200 hover:border-[#8b5cf6] hover:text-[#8b5cf6] font-semibold text-gray-700 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                    {testing ? <Loader2 size={18} className="animate-spin text-[#8b5cf6]" /> : <Webhook size={18} />}
                    {testing ? 'Testing Webhook...' : 'Test n8n Webhook'}
                </button>
            </div>

            {/* Hint & Status indicator */}
            <div className="flex items-center gap-3 px-2">
                <span className="text-[12px] flex items-center gap-1 text-gray-500 font-medium">
                    <Info size={14} className="text-gray-400" />
                    When you click "Send" on a reminder, Autopilot triggers the n8n webhook (N8N_SEND_MESSAGE_WEBHOOK) automatically.
                </span>

                {testResult && (
                    <div className={`text-[12px] font-bold px-3 py-1 rounded-full flex items-center gap-1 overflow-hidden transition-all ${testResult.success
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                            : 'bg-red-50 text-red-600 border border-red-200 shadow-[0_0_12px_rgba(248,113,113,0.3)]'
                        }`}>
                        {testResult.success ? <CheckCircle2 size={13} className="fill-current text-white" /> : '❌'}
                        {testResult.msg}
                    </div>
                )}
            </div>
        </div>
    );
}
