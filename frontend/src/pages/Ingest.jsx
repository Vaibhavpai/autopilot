import React, { useEffect, useState, useRef, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import DashboardLayout from '../components/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import {
    Database, Upload, RefreshCw, Trash2, CheckCircle2, AlertCircle,
    Loader2, Sparkles, MessageSquareText, FileSpreadsheet, Play,
    ArrowRight, BarChart3, Zap, Clock
} from 'lucide-react';

const BASE = '/api';

// ── API ──────────────────────────────────────────────────────────────────────────

async function apiPost(path, body, isFormData = false) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        ...(isFormData
            ? { body }
            : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => ({ detail: res.statusText }));
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    return json;
}
async function apiDelete(path) {
    const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    return json;
}
async function apiGet(path) {
    const res = await fetch(`${BASE}${path}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    return json;
}

// ── Tiny helpers ─────────────────────────────────────────────────────────────────

function Banner({ type, msg }) {
    if (!msg) return null;
    const ok = type === 'success';
    return (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-[13px] ${ok ? 'bg-green-50 text-green-700 border border-green-100'
                : 'bg-red-50 text-red-600 border border-red-100'
            }`}>
            {ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
            <span>{msg}</span>
        </div>
    );
}

function StepBadge({ n, label, active, done }) {
    return (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all ${done ? 'bg-green-50 text-green-700'
                : active ? 'bg-violet-50 text-violet-700 ring-2 ring-violet-200'
                    : 'bg-gray-50 text-gray-400'
            }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${done ? 'bg-green-400 text-white'
                    : active ? 'bg-violet-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                }`}>{done ? '✓' : n}</span>
            {label}
        </div>
    );
}

// ── File upload sub-form ─────────────────────────────────────────────────────────

function FileUploadRow({ title, accept, platform, icon, accentColor, onSuccess }) {
    const fileRef = useRef();
    const [yourName, setYourName] = useState('You');
    const [clearExisting, setClearExisting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [fileName, setFileName] = useState('');

    async function handleUpload() {
        const file = fileRef.current?.files?.[0];
        if (!file) { setStatus({ type: 'error', msg: 'Pick a file first.' }); return; }
        setLoading(true); setStatus(null);
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('your_name', yourName);
            form.append('clear_existing', String(clearExisting));
            const res = await apiPost(`/ingest/${platform}`, form, true);
            setStatus({ type: 'success', msg: res.message });
            if (onSuccess) onSuccess(res);
        } catch (err) {
            setStatus({ type: 'error', msg: err.message });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${accentColor}`}>
                    {icon}
                </div>
                <span className="text-[14px] font-semibold text-gray-800">{title}</span>
                <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md ml-auto">{accept}</span>
            </div>

            <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 hover:border-violet-300 rounded-xl p-3 text-center cursor-pointer transition-colors"
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
                />
                <p className="text-[12px] text-gray-400">
                    {fileName || `Click to select ${accept} file`}
                </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                    <span className="text-[11px] text-gray-400 shrink-0">Your name:</span>
                    <input
                        value={yourName}
                        onChange={(e) => setYourName(e.target.value)}
                        className="flex-1 px-2 py-1 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-300"
                    />
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <div
                        onClick={() => setClearExisting(p => !p)}
                        className={`w-8 h-4 rounded-full transition-colors relative ${clearExisting ? 'bg-violet-500' : 'bg-gray-200'}`}
                    >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${clearExisting ? 'translate-x-[17px]' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-[11px] text-gray-400">Clear first</span>
                </label>
                <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="px-4 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-[12px] font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    Import
                </button>
            </div>

            <Banner type={status?.type} msg={status?.msg} />
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────────

export default function Ingest() {
    const navigate = useNavigate();

    // DB / ingest state
    const [dbStatus, setDbStatus] = useState(null);
    const [dbLoading, setDbLoading] = useState(true);
    const [synthLoading, setSynthLoading] = useState(false);
    const [synthStatus, setSynthStatus] = useState(null);
    const [clearLoading, setClearLoading] = useState(false);
    const [clearStatus, setClearStatus] = useState(null);

    // Pipeline state
    const [pipelineStatus, setPipelineStatus] = useState(null);     // last run from backend
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [pipelineResult, setPipelineResult] = useState(null);
    const [pipelineError, setPipelineError] = useState(null);
    const pollRef = useRef(null);

    // Current wizard step: 1=ingest, 2=running, 3=done
    const step = pipelineResult
        ? 3
        : pipelineRunning
            ? 2
            : 1;

    // ── Fetch helpers ──────────────────────────────────────────────────────────

    const loadDbStatus = useCallback(async () => {
        try {
            setDbLoading(true);
            const data = await apiGet('/ingest/status');
            setDbStatus(data);
        } catch { setDbStatus(null); }
        finally { setDbLoading(false); }
    }, []);

    const pollPipeline = useCallback(async () => {
        try {
            const data = await apiGet('/pipeline/status');
            setPipelineStatus(data);
            if (data.status === 'completed') {
                setPipelineRunning(false);
                setPipelineResult(data);
                clearInterval(pollRef.current);
                loadDbStatus();
            } else if (data.status === 'failed') {
                setPipelineRunning(false);
                setPipelineError(data.error || 'Pipeline failed.');
                clearInterval(pollRef.current);
            }
        } catch { /* ignore */ }
    }, [loadDbStatus]);

    useEffect(() => {
        loadDbStatus();
        pollPipeline();
        return () => clearInterval(pollRef.current);
    }, [loadDbStatus, pollPipeline]);

    // ── Actions ────────────────────────────────────────────────────────────────

    async function handleSynthetic() {
        setSynthLoading(true); setSynthStatus(null);
        try {
            const res = await apiPost('/ingest/synthetic', {});
            setSynthStatus({ type: 'success', msg: res.message });
            loadDbStatus();
        } catch (err) {
            setSynthStatus({ type: 'error', msg: err.message });
        } finally { setSynthLoading(false); }
    }

    async function handleClear() {
        if (!window.confirm('Delete ALL loaded message data?')) return;
        setClearLoading(true); setClearStatus(null);
        try {
            const res = await apiDelete('/ingest/clear');
            setClearStatus({ type: 'success', msg: res.message });
            setPipelineResult(null);
            loadDbStatus();
        } catch (err) {
            setClearStatus({ type: 'error', msg: err.message });
        } finally { setClearLoading(false); }
    }

    async function handleRunPipeline() {
        setPipelineRunning(true);
        setPipelineResult(null);
        setPipelineError(null);
        try {
            await apiPost('/pipeline/run', {});
            // Poll every 2s until done
            pollRef.current = setInterval(pollPipeline, 2000);
        } catch (err) {
            setPipelineRunning(false);
            setPipelineError(err.message);
        }
    }

    const hasData = (dbStatus?.total_messages ?? 0) > 0;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">

                    {/* ── Header ── */}
                    <div className="flex items-start justify-between mb-6 pt-1">
                        <div>
                            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Data Ingest & Pipeline</h2>
                            <p className="text-[13px] text-gray-400 mt-0.5">
                                Import chat data → Run ML models → Store scored contacts
                            </p>
                        </div>
                        <button onClick={loadDbStatus} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-violet-600 transition-colors mt-1">
                            <RefreshCw size={13} className={dbLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>

                    {/* ── Wizard progress ── */}
                    <div className="flex items-center gap-3 mb-7 flex-wrap">
                        <StepBadge n="1" label="Ingest Data" active={step === 1} done={step > 1 || hasData} />
                        <ArrowRight size={14} className="text-gray-300" />
                        <StepBadge n="2" label="Run ML Pipeline" active={step === 2} done={step === 3} />
                        <ArrowRight size={14} className="text-gray-300" />
                        <StepBadge n="3" label="View Results" active={step === 3} done={false} />
                    </div>

                    {/* ── DB Status bar ── */}
                    <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] px-5 py-4 mb-6 flex items-center gap-5 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Database size={16} className="text-violet-500" />
                            <span className="text-[13px] font-semibold text-gray-800">MongoDB</span>
                        </div>
                        {dbLoading
                            ? <Loader2 size={14} className="animate-spin text-gray-300" />
                            : dbStatus ? (
                                <>
                                    <span className="flex items-center gap-1.5 text-[12px] text-gray-600">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                        Connected
                                    </span>
                                    <span className="text-[12px] text-gray-500">
                                        <strong className="text-gray-800">{dbStatus.contacts_loaded}</strong> contacts
                                    </span>
                                    <span className="text-[12px] text-gray-500">
                                        <strong className="text-gray-800">{dbStatus.total_messages?.toLocaleString()}</strong> messages
                                    </span>
                                    {dbStatus.contacts?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 ml-auto">
                                            {dbStatus.contacts.slice(0, 4).map(c => (
                                                <span key={c.name} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                                                    {c.name} <span className="text-gray-400">({c.message_count})</span>
                                                </span>
                                            ))}
                                            {dbStatus.contacts.length > 4 && (
                                                <span className="text-[11px] text-gray-400">+{dbStatus.contacts.length - 4} more</span>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : <span className="text-[12px] text-red-400">Cannot reach backend</span>
                        }
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                        {/* ── LEFT: Ingest options (3/5) ── */}
                        <div className="lg:col-span-3 flex flex-col gap-5">

                            {/* Synthetic */}
                            <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center text-white">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-[14px] font-semibold text-gray-900">Synthetic Demo Data</h3>
                                        <p className="text-[11px] text-gray-400">Instantly generate realistic contacts & messages</p>
                                    </div>
                                    <button
                                        onClick={handleSynthetic}
                                        disabled={synthLoading}
                                        className="ml-auto px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-[12px] font-semibold rounded-xl disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                                    >
                                        {synthLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                        {synthLoading ? 'Generating…' : 'Generate'}
                                    </button>
                                </div>
                                <Banner type={synthStatus?.type} msg={synthStatus?.msg} />
                            </div>

                            {/* File uploads */}
                            <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5 flex flex-col gap-4">
                                <h3 className="text-[14px] font-semibold text-gray-900 flex items-center gap-2">
                                    <Upload size={15} className="text-gray-500" /> Upload Real Chat Data
                                </h3>
                                <FileUploadRow
                                    title="WhatsApp" accept=".txt" platform="whatsapp"
                                    icon={<MessageSquareText size={14} />} accentColor="bg-green-500"
                                    onSuccess={loadDbStatus}
                                />
                                <FileUploadRow
                                    title="Telegram" accept=".json" platform="telegram"
                                    icon={<MessageSquareText size={14} />} accentColor="bg-blue-500"
                                    onSuccess={loadDbStatus}
                                />
                                <FileUploadRow
                                    title="CSV" accept=".csv" platform="csv"
                                    icon={<FileSpreadsheet size={14} />} accentColor="bg-amber-500"
                                    onSuccess={loadDbStatus}
                                />
                            </div>

                            {/* Clear */}
                            <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-500">
                                        <Trash2 size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-[14px] font-semibold text-gray-900">Clear All Data</h3>
                                        <p className="text-[11px] text-gray-400">Wipe all messages from MongoDB before re-importing</p>
                                    </div>
                                    <button
                                        onClick={handleClear}
                                        disabled={clearLoading}
                                        className="ml-auto px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[12px] font-semibold rounded-xl disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                                    >
                                        {clearLoading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                        Clear
                                    </button>
                                </div>
                                <Banner type={clearStatus?.type} msg={clearStatus?.msg} />
                            </div>
                        </div>

                        {/* ── RIGHT: Pipeline (2/5) ── */}
                        <div className="lg:col-span-2 flex flex-col gap-5">

                            {/* Run pipeline card */}
                            <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-6 flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-[15px] font-semibold text-gray-900">ML Pipeline</h3>
                                        <p className="text-[11px] text-gray-400">Score, analyse & generate actions</p>
                                    </div>
                                </div>

                                {/* Pipeline steps */}
                                <div className="flex flex-col gap-2 text-[12px] text-gray-500">
                                    {[
                                        { icon: <BarChart3 size={13} />, label: 'Score every contact (health, recency, sentiment…)' },
                                        { icon: <Zap size={13} />, label: 'Detect relationship drift & ghost patterns' },
                                        { icon: <Play size={13} />, label: 'Generate AI action recommendations' },
                                        { icon: <Database size={13} />, label: 'Save scored profiles back to MongoDB' },
                                    ].map((s, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <span className={`mt-0.5 ${pipelineRunning ? 'text-violet-400 animate-pulse' : 'text-gray-400'}`}>{s.icon}</span>
                                            <span>{s.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {!hasData && !pipelineRunning && (
                                    <div className="text-[12px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                        ⚠️ Load some data first using one of the ingest options on the left.
                                    </div>
                                )}

                                <button
                                    onClick={handleRunPipeline}
                                    disabled={pipelineRunning || !hasData}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white text-[14px] font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(124,95,244,0.4)]"
                                >
                                    {pipelineRunning
                                        ? <><Loader2 size={16} className="animate-spin" /> Running pipeline…</>
                                        : <><Play size={16} /> Run ML Pipeline</>
                                    }
                                </button>

                                {pipelineError && <Banner type="error" msg={pipelineError} />}
                            </div>

                            {/* Pipeline running status */}
                            {pipelineRunning && (
                                <div className="bg-violet-50 border border-violet-100 rounded-[18px] p-5 flex flex-col gap-3">
                                    <div className="flex items-center gap-2 text-violet-700 font-semibold text-[13px]">
                                        <Loader2 size={15} className="animate-spin" />
                                        Pipeline is running…
                                    </div>
                                    <div className="flex flex-col gap-1.5 text-[12px] text-violet-500">
                                        <span>• Loading messages from MongoDB</span>
                                        <span>• Scoring contacts with ML engine</span>
                                        <span>• Generating action recommendations</span>
                                        <span>• Saving results to MongoDB</span>
                                    </div>
                                    <p className="text-[11px] text-violet-400">This may take 15–60 seconds depending on data size.</p>
                                </div>
                            )}

                            {/* Pipeline result */}
                            {pipelineResult && (
                                <div className="bg-green-50 border border-green-100 rounded-[18px] p-5 flex flex-col gap-4">
                                    <div className="flex items-center gap-2 text-green-700 font-semibold text-[14px]">
                                        <CheckCircle2 size={16} />
                                        Pipeline Complete!
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Contacts Scored', value: pipelineResult.contacts_processed },
                                            { label: 'Actions Generated', value: pipelineResult.actions_generated },
                                            { label: 'Duration', value: pipelineResult.duration_seconds ? `${pipelineResult.duration_seconds}s` : '—' },
                                            { label: 'Trigger', value: pipelineResult.trigger ?? 'manual' },
                                        ].map(s => (
                                            <div key={s.label} className="bg-white rounded-xl p-3">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{s.label}</p>
                                                <p className="text-[16px] font-bold text-gray-900 capitalize">{s.value ?? '—'}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => navigate('/relationships')}
                                            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-[13px] font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                                        >
                                            <BarChart3 size={14} /> View Contacts
                                        </button>
                                        <button
                                            onClick={() => navigate('/dashboard')}
                                            className="flex-1 py-2.5 bg-white border border-green-200 text-green-700 text-[13px] font-semibold rounded-xl flex items-center justify-center gap-1.5 hover:bg-green-50 transition-colors"
                                        >
                                            <BarChart3 size={14} /> Dashboard
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Last pipeline run (if no current result) */}
                            {!pipelineResult && pipelineStatus && pipelineStatus.status !== 'never_run' && (
                                <div className="bg-white/90 backdrop-blur-sm rounded-[18px] border border-white/60 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5">
                                    <h4 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                        <Clock size={12} /> Last Pipeline Run
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                                        <div><span className="text-gray-400">Status:</span> <span className={`font-semibold capitalize ${pipelineStatus.status === 'completed' ? 'text-green-600'
                                                : pipelineStatus.status === 'failed' ? 'text-red-500'
                                                    : 'text-amber-500'
                                            }`}>{pipelineStatus.status}</span></div>
                                        <div><span className="text-gray-400">Contacts:</span> <strong>{pipelineStatus.contacts_processed ?? '—'}</strong></div>
                                        <div><span className="text-gray-400">Actions:</span> <strong>{pipelineStatus.actions_generated ?? '—'}</strong></div>
                                        <div><span className="text-gray-400">Duration:</span> <strong>{pipelineStatus.duration_seconds ? `${pipelineStatus.duration_seconds}s` : '—'}</strong></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </DashboardLayout>
    );
}
