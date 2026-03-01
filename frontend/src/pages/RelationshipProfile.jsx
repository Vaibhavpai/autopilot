import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopNavbar from '../components/TopNavbar';
import DashboardLayout from '../components/DashboardLayout';
import ProfileSummary from '../components/ProfileSummary';
import ActivityTimeline from '../components/ActivityTimeline';
import InsightsCard from '../components/InsightsCard';
import RecommendationCard from '../components/RecommendationCard';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { getContact, getActions } from '../api';

// ── Pure helpers ────────────────────────────────────────────────────────────────

/**
 * Scores in MongoDB are stored as 0–1 floats from the synthetic generator.
 * The scoring engine produces 0–100, but the existing DB data is 0–1.
 * Detect and normalize to 0–100 for display.
 */
const to100 = (val) => {
    if (val == null) return 0;
    // If already > 1, assume it's already in 0–100 range
    return val > 1 ? Math.round(val) : Math.round(val * 100);
};

const formatDate = (isoStr) => {
    if (!isoStr) return null;
    try {
        return new Date(isoStr).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
    } catch { return isoStr; }
};

// ── Score breakdown bar ─────────────────────────────────────────────────────────

function ScoreBar({ label, value100 }) {
    const pct = Math.min(100, Math.max(0, value100));
    const barColor =
        pct >= 70 ? '#4ade80' :
            pct >= 40 ? '#fbbf24' :
                '#f87171';
    return (
        <div className="flex items-center gap-3">
            <span className="text-[12px] text-gray-500 w-[110px] shrink-0 leading-tight">{label}</span>
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden min-w-0">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
            </div>
            <span className="text-[12px] font-bold text-gray-700 w-9 text-right shrink-0">{pct}</span>
        </div>
    );
}

// ── Score breakdown card ────────────────────────────────────────────────────────

function ScoreBreakdown({ profile }) {
    if (!profile) return null;
    const health = to100(profile.health_score);
    const recency = to100(profile.recency_score);
    const frequency = to100(profile.frequency_score);
    const response = to100(profile.response_ratio);
    const sentiment = to100(profile.sentiment_avg);   // -1..1 → 0..100 or already 0..1

    return (
        <div className="bg-white/90 backdrop-blur-sm p-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-white/60">
            <h3 className="text-[15px] text-gray-900 font-semibold mb-4">Score Breakdown</h3>

            {/* Health badge row */}
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-[18px] shadow-sm shrink-0 ${health >= 70 ? 'bg-green-400' : health >= 40 ? 'bg-amber-400' : 'bg-red-400'
                    }`}>
                    {health}
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Overall Health</p>
                    <p className="text-[14px] font-semibold text-gray-800 capitalize truncate">
                        {profile.trend?.replace('_', ' ') ?? '—'}
                        {profile.is_ghosted && (
                            <span className="ml-2 text-[10px] text-red-400 font-black bg-red-50 px-1.5 py-0.5 rounded-md">GHOSTED</span>
                        )}
                    </p>
                </div>
            </div>

            {/* Score bars */}
            <div className="flex flex-col gap-3.5">
                <ScoreBar label="Recency (30%)" value100={recency} />
                <ScoreBar label="Frequency (30%)" value100={frequency} />
                <ScoreBar label="Response (20%)" value100={response} />
                <ScoreBar label="Sentiment (20%)" value100={sentiment} />
            </div>

            {/* Stat mini-grid */}
            <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-xl p-3 min-w-0">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Messages</p>
                    <p className="text-[17px] font-bold text-gray-900 truncate">{profile.total_messages ?? '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 min-w-0">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Days Since</p>
                    <p className="text-[17px] font-bold text-gray-900 truncate">{profile.days_since ?? '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 min-w-0">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Churn Risk</p>
                    <p className={`text-[17px] font-bold truncate ${(profile.churn_probability ?? 0) > 0.6 ? 'text-red-500' : 'text-green-500'
                        }`}>
                        {profile.churn_probability != null ? `${Math.round(profile.churn_probability * 100)}%` : '—'}
                    </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 min-w-0">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Decay Rate</p>
                    <p className="text-[17px] font-bold text-gray-900 truncate">
                        {profile.engagement_decay_rate != null ? `${Math.round(profile.engagement_decay_rate * 100)}%` : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Main component ──────────────────────────────────────────────────────────────

export default function RelationshipProfile() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                setLoading(true);
                const [contactData, actionsData] = await Promise.all([
                    getContact(id),
                    getActions(),
                ]);
                setProfile(contactData);
                setActions((actionsData.actions || []).filter(a => a.contact_id === id));
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    // ── ProfileSummary ─────────────────────────────────────────────────────────
    const profileData = profile
        ? {
            name: profile.name,
            type: profile.tag
                ? profile.tag.charAt(0).toUpperCase() + profile.tag.slice(1)
                : 'Contact',
            healthScore: to100(profile.health_score),
            emotionalDrift: profile.drift_detected
                ? `${profile.drift_severity ?? 'mild'} drift`
                : 'Stable',
            image: profile.avatar || null,
        }
        : { name: '…', type: '—', healthScore: 0, emotionalDrift: '—', image: null };

    // ── ActivityTimeline ───────────────────────────────────────────────────────
    const timelineData = profile
        ? [
            {
                type: 'chat',
                title: 'Last Message',
                time: formatDate(profile.last_message_at) ?? 'Unknown',
                description: profile.last_topic
                    ? `"${profile.last_topic.slice(0, 60)}…"`
                    : `via ${profile.platform ?? 'unknown platform'}`,
            },
            ...(profile.days_since != null ? [{
                type: 'event',
                title: 'Days Without Contact',
                time: '',
                description: `${profile.days_since} day${profile.days_since !== 1 ? 's' : ''} since last message`,
            }] : []),
            ...(profile.drift_detected ? [{
                type: 'sentiment',
                title: 'Sentiment Drift Detected',
                time: 'Recent',
                description: profile.drift_severity
                    ? `Severity: ${profile.drift_severity}`
                    : 'Emotional tone has shifted',
            }] : []),
            ...(profile.is_ghosted ? [{
                type: 'inactivity',
                title: 'Marked as Ghosted',
                time: '',
                description: 'No meaningful interaction for an extended period',
            }] : []),
        ]
        : [];

    // ── InsightsCard ───────────────────────────────────────────────────────────
    const health100 = to100(profile?.health_score);
    const churnPct = profile?.churn_probability != null ? Math.round(profile.churn_probability * 100) : null;
    const sentimentVal = profile?.sentiment_avg ?? null;

    const insightsData = profile
        ? [
            {
                type: 'time',
                text: `Health score: ${health100} / 100`,
                trend: health100 < 40 ? 'bad' : health100 >= 70 ? 'good' : 'neutral',
            },
            {
                type: 'frequency',
                text: churnPct != null
                    ? `Churn probability: ${churnPct}%`
                    : `Response ratio: ${to100(profile.response_ratio)}%`,
                trend: (churnPct ?? 0) > 60 ? 'bad' : 'good',
            },
            {
                type: 'tone',
                text: `Avg sentiment: ${sentimentVal != null
                    ? sentimentVal > 0.6 ? 'Positive 😊'
                        : sentimentVal > 0.4 ? 'Neutral 😐'
                            : 'Negative 😟'
                    : 'N/A'
                    }`,
                trend: sentimentVal != null
                    ? sentimentVal > 0.5 ? 'good' : 'bad'
                    : 'neutral',
            },
        ]
        : [];

    // ── RecommendationCard ─────────────────────────────────────────────────────
    const firstPending = actions.find(a => a.status === 'pending');
    const recommendationData = {
        message: firstPending?.suggested_message
            ?? (profile
                ? `Hey ${profile.name?.split(' ')[0]}! It's been a while — how are you doing?`
                : '…'),
        actions: [
            { label: 'Send', primary: true, icon: <MessageSquare size={16} className="text-white/70" /> },
            { label: 'Edit', primary: false },
        ],
    };

    return (
        <DashboardLayout>
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <TopNavbar />

                <div className="flex-1 overflow-y-auto px-10 pb-8 custom-scrollbar">

                    {/* Back + breadcrumb */}
                    <div className="flex items-center gap-3 mb-6 pt-2">
                        <button
                            onClick={() => navigate('/relationships')}
                            className="flex items-center gap-1.5 text-gray-500 hover:text-[#7c5ff4] text-sm font-medium transition-colors"
                        >
                            <ArrowLeft size={16} /> Back
                        </button>
                        {profile && (
                            <>
                                <span className="text-gray-300">/</span>
                                <h2 className="text-[18px] font-semibold text-gray-900">{profile.name}</h2>
                                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium capitalize">
                                    {profile.platform}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md text-xs font-medium capitalize ${profile.is_ghosted ? 'bg-red-100 text-red-600'
                                    : profile.trend === 'improving' ? 'bg-green-100 text-green-600'
                                        : profile.trend === 'at_risk' ? 'bg-amber-100 text-amber-600'
                                            : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {profile.is_ghosted ? 'Ghosted' : (profile.trend?.replace('_', ' ') ?? '')}
                                </span>
                            </>
                        )}
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                            ⚠️ {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading profile…</div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* ── Left (2/3) ── */}
                            <div className="lg:col-span-2 flex flex-col gap-5">
                                <div className="h-[200px]">
                                    <ProfileSummary data={profileData} />
                                </div>
                                <ActivityTimeline timeline={timelineData} />
                            </div>

                            {/* ── Right (1/3) ── */}
                            <div className="lg:col-span-1 flex flex-col gap-6">
                                <ScoreBreakdown profile={profile} />
                                <InsightsCard insights={insightsData} />
                                <RecommendationCard recommendation={recommendationData} />
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </DashboardLayout>
    );
}
