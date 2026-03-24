import React, { useState, useEffect } from 'react';
import { db, auth, logOut, onAuthChange } from "./firebase";
import {
  ShieldAlert, MapPin, Clock, CarFront, Trash2,
  Activity, Map as MapIcon, LayoutDashboard,
  CheckCircle2, X, Upload, Send, ChevronLeft, RefreshCw,
  Sun, Moon, LogOut, Shield
} from 'lucide-react';
import { ref as dbRef, onValue, remove, push, set } from "firebase/database";

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { MapContainer, TileLayer, useMap, Marker, Popup } from 'react-leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import API_BASE from './config';
import AuthPage from './AuthPage';
import AdminPanel from './AdminPanel';

let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// ==========================================
// 🎨 THEME TOKENS
// ==========================================
const T = {
  pageBg: { dk: 'bg-[#0f1520]', lt: 'bg-[#f0f4f8]' },
  cardBg: { dk: 'bg-[#1c2638]', lt: 'bg-white' },
  headerBg: { dk: 'bg-[#1c2638]', lt: 'bg-white' },
  rowBg: { dk: 'bg-[#252f42]', lt: 'bg-slate-50' },
  border: { dk: 'border-slate-600', lt: 'border-slate-200' },
  textPrimary: { dk: 'text-white', lt: 'text-slate-900' },
  textSecondary: { dk: 'text-slate-300', lt: 'text-slate-600' },
  textMuted: { dk: 'text-slate-400', lt: 'text-slate-400' },
  inputBg: { dk: 'bg-[#252f42]', lt: 'bg-slate-50' },
  inputText: { dk: 'text-slate-100', lt: 'text-slate-700' },
  inputBorder: { dk: 'border-slate-500', lt: 'border-slate-200' },
  inputFocus: { dk: 'focus:border-blue-400', lt: 'focus:border-blue-300' },
  inputPlaceholder: { dk: 'placeholder:text-slate-500', lt: 'placeholder:text-slate-400' },
  btnNeutral: {
    dk: 'bg-[#2a3548] text-slate-200 border border-slate-500 hover:bg-[#334260]',
    lt: 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
  },
  btnDark: {
    dk: 'bg-[#2a3548] text-slate-200 border border-slate-500 hover:bg-[#334260]',
    lt: 'bg-slate-900 text-white hover:bg-slate-800'
  },
  toggleTrack: { dk: 'bg-[#252f42] border-slate-600', lt: 'bg-slate-50 border-slate-100' },
  toggleActive: { dk: 'bg-[#334260] text-white', lt: 'bg-white shadow-sm text-slate-900' },
  toggleInactive: { dk: 'text-slate-400 hover:text-slate-200', lt: 'text-slate-400 hover:text-slate-600' },
  filterTrack: { dk: 'bg-[#1c2638] border-slate-600', lt: 'bg-white border-slate-100' },
  iconRed: { dk: 'bg-red-900/60 border border-red-700/40', lt: 'bg-red-50 border border-red-100' },
  iconBlue: { dk: 'bg-blue-900/40 border border-blue-700/40', lt: 'bg-blue-50 border border-blue-100' },
  iconGreen: { dk: 'bg-green-900/40 border border-green-700/40', lt: 'bg-green-50 border border-green-100' },
  plateKnown: { dk: 'bg-blue-900/40 text-blue-200 border-blue-600/50', lt: 'bg-slate-50 text-slate-900 border-slate-100' },
  plateUnknown: { dk: 'bg-amber-900/40 text-amber-300 border-amber-600/50', lt: 'bg-amber-50 text-amber-700 border-amber-200' },
  rowRed: { dk: 'bg-red-900/30 border-red-700/40', lt: 'bg-red-50 border-red-100' },
  rowAmber: { dk: 'bg-amber-900/30 border-amber-700/40', lt: 'bg-amber-50 border-amber-100' },
  rowBlue: { dk: 'bg-blue-900/30 border-blue-700/40', lt: 'bg-blue-50 border-blue-100' },
};
const t = (dark, token) => dark ? T[token].dk : T[token].lt;

// ==========================================
// 🌓 THEME TOGGLE
// ==========================================
function ThemeToggle({ dark, onToggle }) {
  return (
    <button onClick={onToggle}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all duration-300 active:scale-95
        ${dark ? 'bg-[#252f42] border-slate-500 text-slate-200 hover:border-slate-400'
          : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
      <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${dark ? 'bg-blue-500' : 'bg-slate-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full shadow-md transition-all duration-300 flex items-center justify-center
          ${dark ? 'left-6 bg-white' : 'left-1 bg-white'}`}>
          {dark ? <Moon size={10} className="text-blue-600" /> : <Sun size={10} className="text-amber-500" />}
        </div>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">{dark ? 'Dark' : 'Light'}</span>
    </button>
  );
}

// ==========================================
// 🔥 HEATMAP LAYER
// ==========================================
function HeatLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    if (L.heatLayer && points.length > 0) {
      const heat = L.heatLayer(points, { radius: 35, blur: 15, maxZoom: 17, gradient: { 0.4: '#3b82f6', 0.65: '#22c55e', 1: '#ef4444' } }).addTo(map);
      return () => { map.removeLayer(heat); };
    }
  }, [points, map]);
  return null;
}

// ==========================================
// 🏷️ PLATE DISPLAY
// ==========================================
function PlateDisplay({ plate, dk }) {
  const isUnknown = !plate || plate === "Manual Review Required";
  return (
    <div className={`flex items-center gap-4 px-6 py-3 rounded-2xl border font-mono font-black transition-colors duration-300
      ${isUnknown ? `${t(dk, 'plateUnknown')} text-xs tracking-normal` : `${t(dk, 'plateKnown')} text-xl tracking-widest`}`}>
      <CarFront size={22} className={isUnknown ? (dk ? "text-amber-400" : "text-amber-500") : (dk ? "text-blue-300" : "text-blue-600")} />
      {plate || "Manual Review Required"}
    </div>
  );
}

// ==========================================
// 🎴 VIOLATION CARD
// ==========================================
function ViolationCard({ v, isSelected, onSelect, onClick, dk }) {
  return (
    <div onClick={onClick}
      className={`group cursor-pointer rounded-[2.5rem] shadow-xl overflow-hidden border-2 transition-all duration-300
        ${t(dk, 'cardBg')} ${t(dk, 'border')}
        ${isSelected ? 'border-red-500 ring-4 ' + (dk ? 'ring-red-800/40' : 'ring-red-50')
          : dk ? 'hover:border-slate-400' : 'hover:shadow-2xl hover:border-slate-300'}`}>
      <div className={`relative h-64 ${dk ? 'bg-[#252f42]' : 'bg-slate-100'}`}>
        <div onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className={`absolute top-6 right-6 z-10 p-1.5 rounded-full backdrop-blur-md transition-all
            ${isSelected ? 'bg-red-500 text-white' : dk ? 'bg-black/40 text-transparent border border-white/30' : 'bg-white/50 text-transparent border border-white/40'}`}>
          <CheckCircle2 size={20} />
        </div>
        <img src={v.evidence_image_url} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-1000" alt="Evidence"
          onError={(e) => { e.target.src = 'https://placehold.co/640x480/1e293b/475569?text=Evidence+Unavailable'; }} />
        <div className={`absolute top-6 left-6 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-[0.15em] shadow-xl
          ${dk ? 'bg-black/70 backdrop-blur text-white border border-white/15' : 'bg-white/95 backdrop-blur text-slate-900'}`}>
          {v.violation}
        </div>
        <div className={`absolute bottom-6 left-6 text-[9px] font-black uppercase px-4 py-1.5 rounded-xl shadow-lg
          ${v.source === 'live' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>
          {v.source} Feed
        </div>
      </div>
      <div className="p-8">
        <PlateDisplay plate={v.license_plate} dk={dk} />
        <div className={`mt-6 flex items-center gap-4 mb-4 p-4 rounded-2xl border transition-colors duration-300 ${t(dk, 'rowBg')} ${t(dk, 'border')}`}>
          <div className={`p-2.5 rounded-xl ${dk ? 'bg-[#334260]' : 'bg-white shadow-sm'}`}>
            <Clock size={18} className={dk ? 'text-indigo-300' : 'text-indigo-600'} />
          </div>
          <div>
            <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${t(dk, 'textMuted')}`}>Time of Incident</p>
            <p className={`text-sm font-black tracking-tight ${t(dk, 'textPrimary')}`}>{v.timestamp}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 px-2">
          <MapPin size={18} className="text-emerald-400 shrink-0" />
          <p className={`text-xs font-bold truncate ${t(dk, 'textMuted')}`}>{v.location || 'Location Not Logged'}</p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🪟 DETAIL MODAL
// ==========================================
function DetailModal({ violation, onClose, dk }) {
  if (!violation) return null;
  const isUnknownPlate = !violation.license_plate || violation.license_plate === "Manual Review Required";
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className={`w-full max-w-5xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col md:flex-row relative max-h-[90vh] border-2 ${t(dk, 'cardBg')} ${t(dk, 'border')}`}>
        <button onClick={onClose} className={`absolute top-6 right-6 z-10 p-2 rounded-full transition-all
          ${dk ? 'bg-[#334260] text-slate-200 hover:bg-[#3d4f75]' : 'bg-slate-900/20 text-white hover:bg-slate-900/40'}`}>
          <X />
        </button>
        <div className={`w-full md:w-2/3 flex items-center justify-center min-h-64 ${dk ? 'bg-[#151d2e]' : 'bg-slate-100'}`}>
          <img src={violation.evidence_image_url} className="w-full h-full object-contain" alt="Evidence"
            onError={(e) => { e.target.src = 'https://placehold.co/800x600/1e293b/475569?text=Evidence+Unavailable'; }} />
        </div>
        <div className={`w-full md:w-1/3 p-10 overflow-y-auto ${t(dk, 'cardBg')}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-3 rounded-2xl ${t(dk, 'iconRed')}`}><ShieldAlert className={dk ? 'text-red-300' : 'text-red-600'} /></div>
            <h2 className={`font-black text-2xl tracking-tight ${t(dk, 'textPrimary')}`}>Incident File</h2>
          </div>
          <div className="space-y-4">
            <div className={`p-5 rounded-2xl border ${t(dk, 'rowBg')} ${t(dk, 'border')}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${t(dk, 'textMuted')}`}>Source Stream</p>
              <p className={`text-sm font-black uppercase ${dk ? 'text-blue-300' : 'text-blue-600'}`}>{violation.source}</p>
            </div>
            <div className={`p-5 rounded-2xl border ${t(dk, 'rowRed')}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${dk ? 'text-red-400' : 'text-red-400'}`}>Detected Violation</p>
              <p className={`text-xl font-black ${dk ? 'text-red-300' : 'text-red-600'}`}>{violation.violation}</p>
            </div>
            <div className={`p-5 rounded-2xl border ${isUnknownPlate ? t(dk, 'rowAmber') : t(dk, 'rowBlue')}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isUnknownPlate ? 'text-amber-400' : (dk ? 'text-blue-300' : 'text-blue-500')}`}>Vehicle Number Plate</p>
              <p className={`font-mono font-black tracking-widest ${isUnknownPlate ? (dk ? 'text-amber-300 text-sm tracking-normal' : 'text-amber-700 text-sm tracking-normal') : (dk ? 'text-blue-200 text-xl' : 'text-blue-700 text-xl')}`}>
                {violation.license_plate || "Manual Review Required"}
              </p>
            </div>
            <div className={`flex items-center gap-4 p-4 rounded-2xl font-bold text-sm border ${t(dk, 'rowBg')} ${t(dk, 'border')} ${t(dk, 'textSecondary')}`}>
              <Clock size={20} className={dk ? 'text-indigo-300' : 'text-indigo-500'} />{violation.timestamp}
            </div>
            <div className={`flex items-center gap-4 p-4 rounded-2xl font-bold text-sm border ${t(dk, 'rowBg')} ${t(dk, 'border')} ${t(dk, 'textSecondary')}`}>
              <MapPin size={20} className="text-emerald-400 shrink-0" /><span className="truncate">{violation.location}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🎬 FORENSIC UPLOAD VIEW
// ==========================================
function ForensicUploadView({ dk, userId }) {
  const [uploadFile, setUploadFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forensicResult, setForensicResult] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [manualPlate, setManualPlate] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleForensicAnalysis = async () => {
    if (!uploadFile) return alert("Please select a video file first");
    setIsAnalyzing(true); setForensicResult(null); setSelectedImageIndex(0);
    setManualPlate(''); setManualLocation(''); setManualTimestamp('');
    const formData = new FormData();
    formData.append('video', uploadFile);
    // 🚀 Send userId so backend stores under correct path
    formData.append('userId', userId);
    try {
      const response = await fetch(`${API_BASE}/api/upload-video`, { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        setForensicResult(data);
        setManualPlate(data.license_plate !== "Manual Review Required" ? data.license_plate : '');
      } else alert(data.error || "No major violations detected.");
    } catch { alert(`Connection error (${API_BASE}). Is pi_sentinel.py running?`); }
    finally { setIsAnalyzing(false); }
  };

  const handleForensicSubmit = async () => {
    if (!manualLocation || !manualTimestamp) return alert("Please fill Location and Date & Time.");
    const finalPlate = manualPlate.trim() !== '' ? manualPlate.trim().toUpperCase() : (forensicResult.license_plate || "Manual Review Required");
    try {
      // 🚀 Store under violations/{userId}/{violationId}
      await push(dbRef(db, `violations/${userId}`), {
        violation: forensicResult.violation,
        evidence_image_url: forensicResult.evidence_images[selectedImageIndex],
        license_plate: finalPlate,
        location: manualLocation,
        timestamp: manualTimestamp.replace('T', ' '),
        latitude: forensicResult.latitude,
        longitude: forensicResult.longitude,
        source: 'uploaded',
        speed_kmh: 0,
        userId,
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setForensicResult(null); setUploadFile(null); setSelectedImageIndex(0);
        setManualPlate(''); setManualLocation(''); setManualTimestamp(''); setSubmitSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Push failed:", err);
      alert("Failed to push to Firebase. Check console for details.");
    }
  };

  const handleReset = () => { setForensicResult(null); setUploadFile(null); setSelectedImageIndex(0); setManualPlate(''); setManualLocation(''); setManualTimestamp(''); };

  const inputClass = `w-full p-5 rounded-2xl font-black border-2 outline-none transition-all placeholder:font-normal
    ${t(dk, 'inputBg')} ${t(dk, 'inputText')} ${t(dk, 'inputBorder')} ${t(dk, 'inputFocus')} ${t(dk, 'inputPlaceholder')}`;

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className={`p-12 rounded-[3rem] shadow-2xl border-2 text-center relative overflow-hidden transition-colors duration-300 ${t(dk, 'cardBg')} ${t(dk, 'border')}`}>
        <div className={`absolute top-0 left-0 w-full h-[3px] rounded-t-[3rem] ${dk ? 'bg-gradient-to-r from-blue-500 via-blue-300 to-blue-500' : 'bg-blue-600'}`}></div>

        {submitSuccess && (
          <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center gap-6 py-12">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto border ${t(dk, 'iconGreen')}`}><CheckCircle2 className="text-green-400" size={48} /></div>
            <h2 className={`text-2xl font-black ${t(dk, 'textPrimary')}`}>Pushed to Central Ledger</h2>
            <p className={`text-xs font-black uppercase tracking-widest ${t(dk, 'textMuted')}`}>Violation record is now live</p>
          </div>
        )}

        {!forensicResult && !submitSuccess && (
          <>
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border ${t(dk, 'iconBlue')}`}>
              <Upload className={dk ? 'text-blue-300' : 'text-blue-600'} size={40} />
            </div>
            <h2 className={`text-3xl font-black mb-3 ${t(dk, 'textPrimary')}`}>Forensic Analysis</h2>
            <p className={`mb-10 font-bold uppercase text-[10px] tracking-widest ${t(dk, 'textMuted')}`}>Process dashcam archives through DashGuard AI</p>
            <input type="file" id="forensicUpload" accept="video/*" hidden onChange={(e) => setUploadFile(e.target.files[0])} />
            <label htmlFor="forensicUpload"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('video/')) setUploadFile(f); }}
              className={`block w-full border-2 border-dashed p-12 rounded-[2rem] cursor-pointer transition-all mb-8
                ${uploadFile ? (dk ? 'border-green-500 bg-green-900/20' : 'border-green-400 bg-green-50')
                  : dragOver ? (dk ? 'border-blue-400 bg-blue-900/20' : 'border-blue-400 bg-blue-50')
                    : (dk ? 'border-slate-500 hover:border-slate-400 hover:bg-[#252f42]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}`}>
              {uploadFile ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="text-green-400" size={28} />
                  <p className={`font-black text-sm ${dk ? 'text-green-300' : 'text-green-700'}`}>{uploadFile.name}</p>
                  <p className="text-green-400 text-[10px] font-bold uppercase">{(uploadFile.size / (1024 * 1024)).toFixed(1)} MB — Ready</p>
                </div>
              ) : (
                <p className={`font-black text-sm uppercase tracking-tighter ${t(dk, 'textMuted')}`}>Drop video here or click to browse</p>
              )}
            </label>
            <button disabled={!uploadFile || isAnalyzing} onClick={handleForensicAnalysis}
              className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95
                ${!uploadFile || isAnalyzing ? (dk ? 'bg-[#252f42] text-slate-500 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed')
                  : (dk ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-900 text-white hover:bg-slate-800')}`}>
              {isAnalyzing ? <span className="flex items-center justify-center gap-3"><RefreshCw size={18} className="animate-spin" /> Processing AI Pipeline...</span> : "Initialize Scanner"}
            </button>
          </>
        )}

        {forensicResult && !submitSuccess && (
          <div className="text-left space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className={`p-5 rounded-3xl flex items-center gap-4 border ${t(dk, 'iconGreen')}`}>
              <CheckCircle2 className="text-green-400 shrink-0" size={24} />
              <p className="font-black text-green-400 uppercase text-[11px] tracking-widest">AI Result: Violation Authenticated</p>
            </div>
            <div className={`relative rounded-[2rem] overflow-hidden border-4 ${dk ? 'border-slate-600 bg-[#151d2e]' : 'border-slate-100 bg-slate-900'}`}>
              <img src={forensicResult.evidence_images[selectedImageIndex]} className="w-full max-h-[500px] object-contain bg-[#151d2e]" alt="Evidence"
                onError={(e) => { e.target.src = 'https://placehold.co/800x480/0f1623/1e2a3a?text=Image+Unavailable'; }} />
              <div className="absolute top-4 left-4 bg-red-600 text-white font-black text-[10px] px-3 py-1 rounded-full uppercase">{forensicResult.violation}</div>
              <div className="absolute bottom-4 right-4 bg-black/70 text-slate-300 text-[10px] font-black px-3 py-1 rounded-full border border-white/10">
                Angle {selectedImageIndex + 1} of {forensicResult.evidence_images.length}
              </div>
            </div>
            {forensicResult.evidence_images.length > 1 && (
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ml-1 ${t(dk, 'textMuted')}`}>Select Best Evidence Angle</p>
                <div className="flex gap-3 justify-center">
                  {forensicResult.evidence_images.map((imgUrl, idx) => (
                    <div key={idx} onClick={() => setSelectedImageIndex(idx)}
                      className={`cursor-pointer rounded-xl overflow-hidden border-4 transition-all flex-1
                        ${selectedImageIndex === idx ? 'border-blue-500 scale-105 shadow-lg' : (dk ? 'border-slate-600 opacity-60 hover:opacity-90' : 'border-transparent opacity-60 hover:opacity-100')}`}>
                      <img src={imgUrl} className="w-full h-16 object-cover" alt={`Angle ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ml-1 ${t(dk, 'textMuted')}`}>License Plate — Edit if OCR is incorrect</p>
              <div className={`flex items-center gap-4 px-6 py-3 rounded-2xl border-2 ${!manualPlate ? t(dk, 'rowAmber') : t(dk, 'rowBlue')}`}>
                <CarFront size={22} className={!manualPlate ? (dk ? "text-amber-400" : "text-amber-500") : (dk ? "text-blue-300" : "text-blue-600")} />
                <input className={`flex-1 font-mono font-black tracking-widest text-xl bg-transparent outline-none placeholder:text-sm placeholder:font-bold placeholder:tracking-normal
                    ${dk ? 'text-slate-100 placeholder:text-amber-600' : 'text-slate-900 placeholder:text-amber-400'}`}
                  placeholder="Not detected — type manually" value={manualPlate}
                  onChange={(e) => setManualPlate(e.target.value.toUpperCase())} maxLength={15} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ml-1 ${t(dk, 'textMuted')}`}>Location <span className="text-red-400">*</span></p>
                <input className={inputClass} placeholder="e.g. Kozhikode Bypass" value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} />
              </div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ml-1 ${t(dk, 'textMuted')}`}>Date & Time <span className="text-red-400">*</span></p>
                <input type="datetime-local" className={inputClass} value={manualTimestamp} onChange={(e) => setManualTimestamp(e.target.value)} style={{ colorScheme: dk ? 'dark' : 'light' }} />
              </div>
            </div>
            <button onClick={handleForensicSubmit} disabled={!manualLocation || !manualTimestamp}
              className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all
                ${!manualLocation || !manualTimestamp ? (dk ? 'bg-[#252f42] text-slate-500 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed') : 'bg-red-600 text-white hover:bg-red-500'}`}>
              <Send size={20} /> Push to Central Ledger
            </button>
            <button onClick={handleReset}
              className={`w-full py-3 rounded-[1.5rem] font-black uppercase text-xs tracking-widest border-2 transition-all
                ${dk ? 'bg-transparent text-slate-400 border-slate-500 hover:border-slate-400 hover:text-slate-200' : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'}`}>
              Discard & Upload New
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 🏠 MAIN APP
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);           // Firebase user object
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [isLiveCamera, setIsLiveCamera] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dashguard-theme');
    return saved ? saved === 'dark' : true;
  });
  const toggleTheme = () => setDark(prev => { const n = !prev; localStorage.setItem('dashguard-theme', n ? 'dark' : 'light'); return n; });

  // ── Auth listener ──
  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        // Register user email in /users/{uid}
        await set(dbRef(db, `users/${firebaseUser.uid}`), { email: firebaseUser.email });
        // Check if admin
        const adminRef = dbRef(db, `admins/${firebaseUser.uid}`);
        onValue(adminRef, (snap) => setIsAdmin(snap.exists()), { onlyOnce: true });
      }
    });
    return () => unsub();
  }, []);

  // ── Per-user violations listener ──
  useEffect(() => {
    if (!user) return;
    const violationsRef = dbRef(db, `violations/${user.uid}`);
    const unsubscribe = onValue(violationsRef, (snapshot) => {
      const data = snapshot.val();
      setViolations(data
        ? Object.entries(data).map(([id, v]) => ({ id, ...v, source: v.source || 'live' })).reverse()
        : []
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleSelection = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const deleteSelected = () => {
    if (window.confirm(`Delete ${selectedIds.length} record(s)?`)) {
      selectedIds.forEach(id => remove(dbRef(db, `violations/${user.uid}/${id}`)));
      setSelectedIds([]);
    }
  };
  const clearAllViolations = () => {
    if (window.confirm("Clear ALL your violation logs?"))
      remove(dbRef(db, `violations/${user.uid}`));
  };

  const toggleLiveCamera = async () => {
    const nextState = !isLiveCamera; setCameraError(false);
    try {
      const res = await fetch(`${API_BASE}/api/toggle-camera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 🚀 Send userId so backend tags live violations to this user
        body: JSON.stringify({ active: nextState, userId: user.uid }),
      });
      if (!res.ok) throw new Error();
      setIsLiveCamera(nextState);
    } catch { setCameraError(true); setTimeout(() => setCameraError(false), 4000); }
  };

  const filteredViolations = violations.filter(v => filter === 'all' || v.source === filter);
  const heatPoints = filteredViolations.filter(v => v.latitude && v.longitude).map(v => [parseFloat(v.latitude), parseFloat(v.longitude), 0.5]);

  // ── Loading auth ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f1520] flex items-center justify-center">
        <RefreshCw size={32} className="text-slate-600 animate-spin" />
      </div>
    );
  }

  // ── Not logged in ──
  if (!user) return <AuthPage />;

  // ── Admin panel ──
  if (showAdmin && isAdmin) return (
    <div>
      <div className={`p-4 flex items-center justify-between ${dark ? 'bg-[#1c2638] border-b-2 border-slate-600' : 'bg-white border-b-2 border-slate-200'}`}>
        <button onClick={() => setShowAdmin(false)}
          className="flex items-center gap-2 text-blue-400 font-black text-sm uppercase tracking-widest hover:text-blue-300">
          <ChevronLeft size={18} /> Back to Dashboard
        </button>
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
      </div>
      <AdminPanel dark={dark} />
    </div>
  );

  return (
    <div className={`min-h-screen p-4 md:p-8 font-sans transition-colors duration-300 ${t(dark, 'pageBg')}`}>
      <div className="max-w-7xl mx-auto">

        <DetailModal violation={selectedViolation} onClose={() => setSelectedViolation(null)} dk={dark} />

        {/* ── Header ── */}
        <header className={`mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-3xl shadow-xl border-2 transition-colors duration-300 ${t(dark, 'headerBg')} ${t(dark, 'border')}`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${t(dark, 'iconRed')}`}>
              <ShieldAlert size={32} className={dark ? 'text-red-300' : 'text-red-600'} />
            </div>
            <div>
              <h1 className={`text-3xl font-black tracking-tight leading-none ${t(dark, 'textPrimary')}`}>DashGuard Live</h1>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${t(dark, 'textMuted')}`}>
                {user.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle dark={dark} onToggle={toggleTheme} />

            {/* Admin button */}
            {isAdmin && (
              <button onClick={() => setShowAdmin(true)}
                className="flex items-center gap-2 font-black text-xs uppercase tracking-widest py-3 px-5 rounded-2xl bg-purple-700 text-white hover:bg-purple-600 transition-all active:scale-95">
                <Shield size={14} /> Admin
              </button>
            )}

            {view !== 'upload' && (
              <div className={`flex p-1.5 rounded-2xl border-2 ${t(dark, 'toggleTrack')}`}>
                <button onClick={() => setView('dashboard')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex gap-2 items-center transition-all
                    ${view === 'dashboard' ? t(dark, 'toggleActive') : t(dark, 'toggleInactive')}`}>
                  <LayoutDashboard size={14} /> Records
                </button>
                <button onClick={() => setView('heatmap')}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex gap-2 items-center transition-all
                    ${view === 'heatmap' ? t(dark, 'toggleActive') : t(dark, 'toggleInactive')}`}>
                  <MapIcon size={14} /> Heatmap
                </button>
              </div>
            )}

            <button onClick={toggleLiveCamera}
              className={`flex items-center gap-2 font-black text-xs uppercase tracking-widest py-3 px-6 rounded-2xl transition-all active:scale-95
                ${cameraError ? 'bg-orange-500 text-white'
                  : isLiveCamera ? 'bg-red-600 text-white shadow-lg animate-pulse'
                    : t(dark, 'btnNeutral')}`}>
              <Activity size={16} />
              {cameraError ? "Backend Unreachable" : isLiveCamera ? "Stop Live Feed" : "Start Live Feed"}
            </button>

            <button onClick={() => setView(view === 'upload' ? 'dashboard' : 'upload')}
              className={`flex items-center gap-2 font-black text-xs uppercase tracking-widest py-3 px-6 rounded-2xl transition-all active:scale-95
                ${view === 'upload' ? 'bg-blue-600 text-white shadow-lg' : t(dark, 'btnDark')}`}>
              {view === 'upload' ? <ChevronLeft size={16} /> : <Upload size={16} />}
              {view === 'upload' ? 'Back to Records' : 'Forensic Upload'}
            </button>

            {selectedIds.length > 0 ? (
              <button onClick={deleteSelected} className="bg-red-600 text-white p-3 rounded-2xl hover:bg-red-500 transition-all flex items-center gap-2 px-4 text-xs font-black uppercase">
                <Trash2 size={18} /> Delete {selectedIds.length}
              </button>
            ) : (
              <button onClick={clearAllViolations} title="Clear all logs"
                className={`p-3 rounded-2xl border-2 transition-all ${dark ? 'bg-[#252f42] text-slate-400 border-slate-500 hover:text-red-400' : 'bg-white text-red-500 border-red-100 hover:bg-red-50'}`}>
                <Trash2 size={20} />
              </button>
            )}

            <div className={`px-5 py-3 rounded-2xl font-black flex items-center gap-3 border-2 ${dark ? 'bg-[#252f42] border-slate-500 text-white' : 'bg-slate-900 border-transparent text-white'}`}>
              <Activity size={16} className="text-blue-400 animate-pulse" />
              <span className="text-sm tracking-tighter">{violations.length}</span>
            </div>

            {/* Sign Out */}
            <button onClick={logOut}
              className={`p-3 rounded-2xl border-2 transition-all ${dark ? 'bg-[#252f42] text-slate-400 border-slate-500 hover:text-white' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
              title="Sign out">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {view === 'upload' && <ForensicUploadView dk={dark} userId={user.uid} />}

        {!loading && view !== 'upload' && (
          <>
            <div className="flex justify-center mb-10">
              <div className={`flex p-1.5 rounded-2xl border-2 ${t(dark, 'filterTrack')}`}>
                {['all', 'live', 'uploaded'].map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                      ${filter === f ? 'bg-slate-900 text-white shadow-lg' : t(dark, 'toggleInactive')}`}>
                    {f} Incidents
                  </button>
                ))}
              </div>
            </div>

            {view === 'heatmap' && (
              <div className={`p-4 rounded-[3rem] shadow-2xl h-[700px] border-2 ${t(dark, 'cardBg')} ${t(dark, 'border')}`}>
                <MapContainer center={[9.2993, 76.6154]} zoom={15} className="h-full w-full rounded-[2.5rem]">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
                  <HeatLayer points={heatPoints} />
                  {filteredViolations.map((v) => (
                    <Marker key={v.id} position={[parseFloat(v.latitude || 9.2993), parseFloat(v.longitude || 76.6154)]}>
                      <Popup>
                        <div className="w-56 p-2 font-sans">
                          <img src={v.evidence_image_url} className="rounded-xl mb-3 shadow-md w-full h-32 object-cover" alt="thumb" onError={(e) => { e.target.style.display = 'none'; }} />
                          <div className="flex justify-between items-center mb-2">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${v.source === 'live' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{v.source}</span>
                            <span className="text-red-600 font-black text-xs">{v.violation}</span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500">{v.timestamp}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            )}

            {view === 'dashboard' && (
              filteredViolations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {filteredViolations.map((v) => (
                    <ViolationCard key={v.id} v={v} dk={dark}
                      isSelected={selectedIds.includes(v.id)}
                      onSelect={() => toggleSelection(v.id)}
                      onClick={() => setSelectedViolation(v)} />
                  ))}
                </div>
              ) : (
                <div className={`border-4 border-dashed rounded-[4rem] py-40 flex flex-col items-center justify-center text-center mt-8 ${t(dark, 'cardBg')} ${t(dark, 'border')}`}>
                  <ShieldAlert size={80} className={`mb-8 ${dark ? 'text-slate-600' : 'text-slate-200'}`} />
                  <h2 className={`text-3xl font-black mb-3 tracking-tight ${t(dark, 'textPrimary')}`}>
                    {filter === 'all' ? 'Safe Roads Confirmed' : `No ${filter} incidents`}
                  </h2>
                  <p className={`max-w-xs mx-auto font-bold uppercase text-[10px] tracking-widest leading-relaxed ${t(dark, 'textMuted')}`}>
                    No violations detected. Monitoring at peak efficiency.
                  </p>
                </div>
              )
            )}
          </>
        )}

        {loading && view !== 'upload' && (
          <div className="flex items-center justify-center py-40">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw size={40} className={`animate-spin ${dark ? 'text-slate-500' : 'text-slate-300'}`} />
              <p className={`font-black uppercase text-[10px] tracking-widest ${t(dark, 'textMuted')}`}>Syncing with Firebase...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
