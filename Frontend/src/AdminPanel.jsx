import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref as dbRef, onValue } from 'firebase/database';
import { ShieldAlert, Users, Activity, ChevronDown, ChevronUp, Clock, MapPin, CarFront } from 'lucide-react';

// ==========================================
// 🔐 ADMIN PANEL
// Shows all users and their violation counts.
// Only rendered if current user is in /admins/{uid} in Firebase.
// ==========================================
export default function AdminPanel({ dark }) {
    const [allViolations, setAllViolations] = useState({}); // { userId: [violations] }
    const [userEmails, setUserEmails] = useState({});       // { userId: email }
    const [expandedUser, setExpandedUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const c = (dk, d, l) => dk ? d : l;

    useEffect(() => {
        // Step 1: Get all users first
        const usersRef = dbRef(db, 'users');
        const unsubUsers = onValue(usersRef, (snapshot) => {
            const usersData = snapshot.val() || {};
            setUserEmails(usersData);

            const userIds = Object.keys(usersData);

            // No users registered yet
            if (userIds.length === 0) {
                setAllViolations({});
                setLoading(false);
                return;
            }

            // Step 2: For each user, fetch their violations individually
            // (Firebase per-user rules block a single parent-level read)
            const allGrouped = {};
            let loadedCount = 0;
            const unsubscribers = [];

            userIds.forEach((userId) => {
                const vRef = dbRef(db, `violations/${userId}`);
                const unsub = onValue(vRef, (vSnap) => {
                    const vData = vSnap.val();
                    if (vData && typeof vData === 'object') {
                        allGrouped[userId] = Object.entries(vData)
                            .map(([id, v]) => ({ id, ...v }))
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    } else {
                        allGrouped[userId] = [];
                    }
                    loadedCount++;
                    if (loadedCount === userIds.length) {
                        setAllViolations({ ...allGrouped });
                        setLoading(false);
                    }
                }, (err) => {
                    console.error(`❌ Failed to read violations for ${userId}:`, err);
                    allGrouped[userId] = [];
                    loadedCount++;
                    if (loadedCount === userIds.length) {
                        setAllViolations({ ...allGrouped });
                        setLoading(false);
                    }
                });
                unsubscribers.push(unsub);
            });

            return () => unsubscribers.forEach(u => u());

        }, (err) => {
            console.error('❌ Failed to read users:', err);
            setError('Permission denied. Make sure Firebase rules allow admin read access.');
            setLoading(false);
        });

        return () => unsubUsers();
    }, []);

    const totalViolations = Object.values(allViolations).reduce((sum, v) => sum + v.length, 0);
    const totalUsers = Object.keys(allViolations).filter(uid => allViolations[uid].length > 0).length;

    const bg = c(dark, 'bg-[#0f1520]', 'bg-[#f0f4f8]');
    const cardBg = c(dark, 'bg-[#1c2638] border-slate-600', 'bg-white border-slate-200');
    const textPrimary = c(dark, 'text-white', 'text-slate-900');
    const textMuted = c(dark, 'text-slate-400', 'text-slate-500');

    if (loading) {
        return (
            <div className={`min-h-screen ${bg} flex items-center justify-center`}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className={`font-black uppercase text-xs tracking-widest ${textMuted}`}>
                        Loading admin data...
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`min-h-screen ${bg} flex items-center justify-center p-8`}>
                <div className="bg-red-900/30 border-2 border-red-700/40 rounded-3xl p-8 max-w-md text-center">
                    <ShieldAlert size={40} className="text-red-400 mx-auto mb-4" />
                    <p className="text-red-400 font-black uppercase text-xs tracking-widest mb-2">Access Error</p>
                    <p className="text-slate-300 text-sm font-bold">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${bg} p-4 md:p-8 transition-colors duration-300`}>
            <div className="max-w-6xl mx-auto">

                {/* ── Header ── */}
                <div className={`bg-[#1c2638] border-2 border-slate-600 rounded-3xl p-6 mb-8 flex items-center gap-4`}>
                    <div className="bg-red-900/40 border border-red-700/40 p-3 rounded-2xl">
                        <ShieldAlert size={28} className="text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">Admin Panel</h1>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                            DashGuard System Overview
                        </p>
                    </div>
                </div>

                {/* ── Stats ── */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className={`border-2 rounded-3xl p-6 ${cardBg}`}>
                        <div className="flex items-center gap-3 mb-2">
                            <Users size={20} className="text-blue-400" />
                            <p className={`text-[10px] font-black uppercase tracking-widest ${textMuted}`}>
                                Active Users
                            </p>
                        </div>
                        <p className={`text-4xl font-black ${textPrimary}`}>{totalUsers}</p>
                    </div>
                    <div className={`border-2 rounded-3xl p-6 ${cardBg}`}>
                        <div className="flex items-center gap-3 mb-2">
                            <Activity size={20} className="text-red-400" />
                            <p className={`text-[10px] font-black uppercase tracking-widest ${textMuted}`}>
                                Total Violations
                            </p>
                        </div>
                        <p className={`text-4xl font-black ${textPrimary}`}>{totalViolations}</p>
                    </div>
                </div>

                {/* ── Per-user breakdown ── */}
                <div className={`border-2 rounded-3xl overflow-hidden ${cardBg}`}>
                    <div className={`p-6 border-b-2 ${c(dark, 'border-slate-600', 'border-slate-200')}`}>
                        <h2 className={`font-black text-lg ${textPrimary}`}>User Activity</h2>
                        <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${textMuted}`}>
                            Click a user to expand their violations
                        </p>
                    </div>

                    {Object.keys(allViolations).length === 0 ? (
                        <div className="p-12 text-center">
                            <p className={`font-black uppercase text-xs tracking-widest ${textMuted}`}>
                                No violations logged yet
                            </p>
                        </div>
                    ) : (
                        <div className={`divide-y-2 ${c(dark, 'divide-slate-700/50', 'divide-slate-100')}`}>
                            {Object.entries(allViolations)
                                .sort((a, b) => b[1].length - a[1].length)
                                .map(([userId, violations]) => {
                                    const email = userEmails[userId]?.email || userId.slice(0, 12) + '...';
                                    const isExpanded = expandedUser === userId;

                                    return (
                                        <div key={userId}>
                                            {/* ── User row ── */}
                                            <button
                                                onClick={() => setExpandedUser(isExpanded ? null : userId)}
                                                className={`w-full flex items-center justify-between p-6 transition-colors text-left
                                                    ${c(dark, 'hover:bg-[#252f42]', 'hover:bg-slate-50')}`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-black text-white text-sm shrink-0">
                                                        {email[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className={`font-black text-sm ${textPrimary}`}>{email}</p>
                                                        <p className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
                                                            {userId.slice(0, 16)}...
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className={`px-4 py-2 rounded-xl border
                                                        ${violations.length > 0
                                                            ? 'bg-red-900/40 border-red-700/40'
                                                            : c(dark, 'bg-slate-700/40 border-slate-600', 'bg-slate-100 border-slate-200')}`}>
                                                        <span className={`font-black text-sm
                                                            ${violations.length > 0 ? 'text-red-400' : textMuted}`}>
                                                            {violations.length} violation{violations.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                    {isExpanded
                                                        ? <ChevronUp size={18} className="text-slate-400" />
                                                        : <ChevronDown size={18} className="text-slate-400" />}
                                                </div>
                                            </button>

                                            {/* ── Expanded violations ── */}
                                            {isExpanded && (
                                                <div className={`border-t-2 ${c(dark, 'border-slate-700 bg-[#151d2e]', 'border-slate-100 bg-slate-50')}`}>
                                                    {violations.length === 0 ? (
                                                        <p className={`p-6 text-center font-black text-xs uppercase tracking-widest ${textMuted}`}>
                                                            No violations for this user
                                                        </p>
                                                    ) : (
                                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                                                            {violations.map((v) => (
                                                                <div key={v.id}
                                                                    className={`border-2 rounded-2xl p-4 ${c(dark, 'bg-[#1c2638] border-slate-600', 'bg-white border-slate-200')}`}>
                                                                    {v.evidence_image_url && (
                                                                        <img
                                                                            src={v.evidence_image_url}
                                                                            className="w-full h-28 object-cover rounded-xl mb-3"
                                                                            alt="Evidence"
                                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                                        />
                                                                    )}
                                                                    <p className="text-red-400 font-black text-xs uppercase tracking-widest mb-2">
                                                                        {v.violation}
                                                                    </p>
                                                                    <div className={`flex items-center gap-2 text-xs font-bold mb-1 ${textMuted}`}>
                                                                        <Clock size={12} />{v.timestamp}
                                                                    </div>
                                                                    <div className={`flex items-center gap-2 text-xs font-bold mb-1 ${textMuted}`}>
                                                                        <MapPin size={12} />{v.location || 'Unknown'}
                                                                    </div>
                                                                    <div className={`flex items-center gap-2 text-xs font-mono font-bold ${textMuted}`}>
                                                                        <CarFront size={12} />{v.license_plate || 'Manual Review Required'}
                                                                    </div>
                                                                    <div className={`mt-2 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg inline-block
                                                                        ${v.source === 'live'
                                                                            ? 'bg-green-900/40 text-green-400'
                                                                            : 'bg-blue-900/40 text-blue-400'}`}>
                                                                        {v.source || 'uploaded'} feed
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
