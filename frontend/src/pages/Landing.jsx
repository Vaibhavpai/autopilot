import React from 'react';
import { Link } from 'react-router-dom';
import {
    Users,
    HeartPulse,
    Activity,
    CalendarDays,
    Mail,
    Lock,
    EyeOff,
    ArrowRight,
    ShieldCheck
} from 'lucide-react';

export default function Landing() {
    return (
        <div className="h-screen w-full relative overflow-hidden font-sans selection:bg-[#A388FF]/30 select-none">
            {/* Background Image */}
            <div
                className="absolute inset-0 z-0"
                style={{
                    backgroundImage: 'url("/images/background.png")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'brightness(0.9)'
                }}
            />

            {/* Navigation */}
            <nav className="relative z-20 flex items-center justify-between px-12 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                        <span className="text-white font-bold text-lg italic">A</span>
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-xl tracking-tight leading-none">AURA Connect</h1>
                        <p className="text-white/60 text-[10px] font-medium tracking-wide mt-0.5 uppercase">Relationship Intelligence Platform</p>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-10">
                    <a href="#" className="text-white/80 hover:text-white transition-colors font-medium text-sm">Home</a>
                    <a href="#" className="text-white/80 hover:text-white transition-colors font-medium text-sm">Features</a>
                    <a href="#" className="text-white/80 hover:text-white transition-colors font-medium text-sm">Pricing</a>
                    <a href="#" className="text-white/80 hover:text-white transition-colors font-medium text-sm">About</a>
                    <Link
                        to="/dashboard"
                        className="bg-white text-gray-900 px-5 py-2 rounded-xl font-bold hover:bg-gray-100 transition-all shadow-[0_8px_20px_rgba(255,255,255,0.15)] text-sm"
                    >
                        Log In
                    </Link>
                </div>
            </nav>

            <main className="relative z-10 grid grid-cols-12 h-[calc(100vh-80px)] px-12 items-center gap-8">

                {/* Left Content - Takes up 7 cols */}
                <div className="col-span-7 flex flex-col justify-center">
                    <h2 className="text-gray-900 text-5xl xl:text-6xl font-extrabold leading-[1.1] mb-6 tracking-tight drop-shadow-sm">
                        Master Your Relationships. <br />
                        AI-Powered Intelligence for <br />
                        Stronger Connections.
                    </h2>

                    <p className="text-gray-800 text-base font-medium leading-relaxed mb-10 max-w-xl opacity-90">
                        AURA tracks relationship health, predicts weakening bonds, and guides you to nurture connections with personalized insights.
                    </p>

                    <div className="grid grid-cols-2 gap-y-10 gap-x-4 mb-12">
                        {/* Feature 1 */}
                        <div className="flex gap-4 items-center h-16">
                            <div className="w-12 h-12 bg-white/40 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/50 shadow-sm shrink-0">
                                <Users className="text-gray-900" size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-[13px] uppercase tracking-wide mb-0.5 flex items-center gap-2">
                                    1. Track Contacts <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]"></div>
                                </h4>
                                <p className="text-gray-800 font-medium text-sm leading-tight">Manage your entire <br />network</p>
                            </div>
                        </div>

                        {/* Feature 2 */}
                        <div className="flex gap-4 items-center h-16">
                            <div className="w-12 h-12 bg-emerald-400/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-emerald-400/30 shadow-sm shrink-0">
                                <HeartPulse className="text-emerald-600" size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-[13px] uppercase tracking-wide mb-0.5">
                                    2. Relationship Health
                                </h4>
                                <p className="text-gray-800 font-medium text-sm leading-tight">AI analyzes interaction <br />quality & frequency</p>
                            </div>
                        </div>

                        {/* Feature 3 */}
                        <div className="flex gap-4 items-center h-16">
                            <div className="w-12 h-12 bg-rose-400/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-rose-400/30 shadow-sm shrink-0">
                                <Activity className="text-rose-500" size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-[13px] uppercase tracking-wide mb-0.5">
                                    3. Predict Bond Strength
                                </h4>
                                <p className="text-gray-800 font-medium text-sm leading-tight">Anticipate drift and re- <br />engage effectively</p>
                            </div>
                        </div>

                        {/* Feature 4 */}
                        <div className="flex gap-4 items-center h-16">
                            <div className="w-12 h-12 bg-white/40 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/50 shadow-sm shrink-0">
                                <CalendarDays className="text-gray-900" size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 text-[13px] uppercase tracking-wide mb-0.5">
                                    4. Reminders & Pipelines
                                </h4>
                                <p className="text-gray-800 font-medium text-sm leading-tight">Organize follow-ups and <br />interaction history</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <Link
                            to="/dashboard"
                            className="bg-[#2a7e78] text-white px-8 py-3.5 rounded-xl font-bold text-[17px] hover:bg-[#216560] transition-all shadow-[0_10px_25px_rgba(42,126,120,0.3)] flex items-center gap-2 group"
                        >
                            Get Started for Free
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <button className="text-gray-900 font-bold text-[17px] hover:underline underline-offset-4 decoration-2">
                            Learn More
                        </button>
                    </div>
                </div>

                {/* Right Content - Takes up 5 cols - Login Card */}
                <div className="col-span-5 flex justify-end">
                    <div className="w-full max-w-[420px] bg-white rounded-[40px] p-10 shadow-[0_40px_80px_rgba(0,0,0,0.12)] border border-white/20">
                        <h3 className="text-gray-900 text-[28px] font-bold text-center mb-10">Welcome Back</h3>

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#2a7e78] transition-colors">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    placeholder="Email Address"
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2a7e78]/10 focus:border-[#2a7e78] transition-all"
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#2a7e78] transition-colors">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 pl-12 pr-12 font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2a7e78]/10 focus:border-[#2a7e78] transition-all"
                                />
                                <button className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    <EyeOff size={18} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between px-1">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#2a7e78] focus:ring-[#2a7e78]" />
                                    <span className="text-gray-500 font-medium text-xs group-hover:text-gray-700 transition-colors">[Remember Me]</span>
                                </label>
                                <button className="text-[#2a7e78] font-bold text-xs hover:underline underline-offset-2">
                                    Forgot Password??
                                </button>
                            </div>

                            <Link
                                to="/dashboard"
                                className="w-full bg-[#2a7e78] text-white py-4 rounded-2xl font-bold text-[17px] hover:bg-[#216560] transition-all shadow-[0_8px_20px_rgba(42,126,120,0.2)] block text-center mt-2 tracking-wide"
                            >
                                LOG IN
                            </Link>

                            <div className="relative py-4 flex items-center justify-center">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-100"></div>
                                </div>
                                <span className="relative bg-white px-4 text-gray-400 text-[10px] font-bold uppercase tracking-widest">Or continue with:</span>
                            </div>

                            <button className="w-full border border-gray-100 rounded-2xl py-3 flex items-center justify-center gap-3 hover:bg-gray-50 transition-all shadow-sm">
                                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                                <span className="text-gray-700 font-bold text-sm">Sign in with Google</span>
                            </button>

                            <button className="w-full border border-gray-100 rounded-2xl py-3 flex items-center justify-center gap-3 hover:bg-gray-50 transition-all shadow-sm">
                                <img src="https://www.svgrepo.com/show/303243/microsoft-icon-logo.svg" alt="Microsoft" className="w-5 h-5 rounded-sm" />
                                <span className="text-gray-700 font-bold text-sm">Sign in with Microsoft</span>
                            </button>

                            <p className="text-center text-gray-500 font-semibold text-xs mt-4">
                                Don't have an account? <button className="text-[#2a7e78] font-bold hover:underline">Sign Up</button>
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Decorative Blur and Nodes */}
            <div className="absolute bottom-[10%] left-[40%] w-32 h-32 bg-amber-400/20 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute top-[40%] right-[5%] w-40 h-40 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        </div>
    );
}
