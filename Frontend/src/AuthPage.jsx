import React, { useState } from 'react';
import { ShieldAlert, Mail, Lock, Eye, EyeOff, RefreshCw, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { signIn, signUp, resetPassword } from './firebase';

export default function AuthPage() {
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resetSent, setResetSent] = useState(false);

    const handleSubmit = async () => {
        setError('');

        if (mode === 'forgot') {
            if (!email) return setError('Please enter your email address.');
            setLoading(true);
            try {
                await resetPassword(email);
                setResetSent(true);
            } catch (err) {
                const messages = {
                    'auth/user-not-found': 'No account found with this email.',
                    'auth/invalid-email': 'Please enter a valid email address.',
                    'auth/too-many-requests': 'Too many attempts. Please try again later.',
                };
                setError(messages[err.code] || 'Something went wrong. Please try again.');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!email || !password) return setError('Please fill in all fields.');
        if (mode === 'signup' && password !== confirmPassword)
            return setError('Passwords do not match.');
        if (mode === 'signup' && password.length < 6)
            return setError('Password must be at least 6 characters.');

        setLoading(true);
        try {
            if (mode === 'login') {
                await signIn(email, password);
            } else {
                await signUp(email, password);
            }
        } catch (err) {
            const messages = {
                'auth/user-not-found': 'No account found with this email.',
                'auth/wrong-password': 'Incorrect password.',
                'auth/email-already-in-use': 'An account with this email already exists.',
                'auth/invalid-email': 'Please enter a valid email address.',
                'auth/too-many-requests': 'Too many attempts. Please try again later.',
                'auth/invalid-credential': 'Invalid email or password.',
            };
            setError(messages[err.code] || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (newMode) => {
        setMode(newMode);
        setError('');
        setResetSent(false);
        setPassword('');
        setConfirmPassword('');
    };

    const inputClass = `w-full bg-[#1c2638] border-2 border-slate-600 rounded-2xl px-5 py-4 
    text-slate-100 font-semibold outline-none transition-all placeholder:text-slate-500
    focus:border-blue-500`;

    return (
        <div className="min-h-screen bg-[#0f1520] flex items-center justify-center p-4">
            <div className="w-full max-w-md">

                {/* Logo */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-red-900/40 border-2 border-red-700/40 rounded-3xl mb-6">
                        <ShieldAlert size={40} className="text-red-400" />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight">DashGuard</h1>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mt-2">
                        Traffic Violation Detection System
                    </p>
                </div>

                {/* Card */}
                <div className="bg-[#1c2638] border-2 border-slate-600 rounded-[2.5rem] p-10 shadow-2xl shadow-black/40">

                    {/* ── FORGOT PASSWORD MODE ── */}
                    {mode === 'forgot' ? (
                        <div>
                            <button
                                onClick={() => switchMode('login')}
                                className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-xs font-black uppercase tracking-widest mb-8 transition-colors"
                            >
                                <ArrowLeft size={14} /> Back to Sign In
                            </button>

                            {resetSent ? (
                                /* Success state */
                                <div className="text-center py-4">
                                    <div className="w-16 h-16 bg-green-900/40 border border-green-700/40 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <CheckCircle2 size={32} className="text-green-400" />
                                    </div>
                                    <h2 className="text-xl font-black text-white mb-3">Check Your Email</h2>
                                    <p className="text-slate-400 text-sm font-bold mb-2">
                                        Password reset link sent to:
                                    </p>
                                    <p className="text-blue-400 font-black text-sm mb-8">{email}</p>
                                    <button
                                        onClick={() => switchMode('login')}
                                        className="w-full py-4 rounded-2xl font-black uppercase tracking-[0.15em] text-sm bg-blue-600 text-white hover:bg-blue-500 transition-all active:scale-95"
                                    >
                                        Back to Sign In
                                    </button>
                                </div>
                            ) : (
                                /* Email input state */
                                <div>
                                    <h2 className="text-xl font-black text-white mb-2">Reset Password</h2>
                                    <p className="text-slate-400 text-sm font-bold mb-8">
                                        Enter your email and we'll send you a reset link.
                                    </p>
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="email"
                                                placeholder="Email address"
                                                className={inputClass + " pl-12"}
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                            />
                                        </div>

                                        {error && (
                                            <div className="bg-red-900/30 border border-red-700/40 rounded-2xl px-5 py-3">
                                                <p className="text-red-400 text-sm font-bold">{error}</p>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleSubmit}
                                            disabled={loading}
                                            className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.15em] text-sm transition-all active:scale-95
                                                ${loading
                                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40'
                                                }`}
                                        >
                                            {loading
                                                ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> Sending...</span>
                                                : 'Send Reset Link'
                                            }
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ── LOGIN / SIGNUP MODE ── */
                        <div>
                            {/* Tab switcher */}
                            <div className="flex bg-[#252f42] p-1.5 rounded-2xl border border-slate-600 mb-8">
                                <button
                                    onClick={() => switchMode('login')}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                                        ${mode === 'login' ? 'bg-[#334260] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Sign In
                                </button>
                                <button
                                    onClick={() => switchMode('signup')}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                                        ${mode === 'signup' ? 'bg-[#334260] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Sign Up
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Email */}
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="email"
                                        placeholder="Email address"
                                        className={inputClass + " pl-12"}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                    />
                                </div>

                                {/* Password */}
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Password"
                                        className={inputClass + " pl-12 pr-12"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                    />
                                    <button
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                {/* Confirm Password (signup only) */}
                                {mode === 'signup' && (
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Confirm password"
                                            className={inputClass + " pl-12"}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                        />
                                    </div>
                                )}

                                {/* Forgot password link — login mode only */}
                                {mode === 'login' && (
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => switchMode('forgot')}
                                            className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-blue-400 transition-colors"
                                        >
                                            Forgot Password?
                                        </button>
                                    </div>
                                )}

                                {/* Error */}
                                {error && (
                                    <div className="bg-red-900/30 border border-red-700/40 rounded-2xl px-5 py-3">
                                        <p className="text-red-400 text-sm font-bold">{error}</p>
                                    </div>
                                )}

                                {/* Submit */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.15em] text-sm transition-all active:scale-95
                                        ${loading
                                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                            : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40'
                                        }`}
                                >
                                    {loading
                                        ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> Please wait...</span>
                                        : mode === 'login' ? 'Sign In' : 'Create Account'
                                    }
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <p className="text-center text-slate-600 text-xs mt-6 font-bold uppercase tracking-widest">
                    DashGuard Live © 2026 — Providence College of Engineering
                </p>
            </div>
        </div>
    );
}
