import React, { useState, useEffect } from 'react';
import { db } from "./firebase";
import {
  ShieldAlert, MapPin, Clock, Gauge, CarFront, Trash2,
  AlertTriangle, Activity, Map as MapIcon, LayoutDashboard,
  CheckCircle2, X, Upload, Send, Info
} from 'lucide-react';
import { ref as dbRef, onValue, remove, push } from "firebase/database";

// Leaflet Imports
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { MapContainer, TileLayer, useMap, Marker, Popup } from 'react-leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// 🚀 Icon Configuration for Leaflet
let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// 🚀 Heatmap Logic Component
function HeatLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    if (L.heatLayer && points.length > 0) {
      const heat = L.heatLayer(points, {
        radius: 35, blur: 15, maxZoom: 17,
        gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
      }).addTo(map);
      return () => { map.removeLayer(heat); };
    }
  }, [points, map]);
  return null;
}

function App() {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'heatmap', 'upload'
  const [filter, setFilter] = useState('all'); // 'all', 'live', 'uploaded'
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedViolation, setSelectedViolation] = useState(null);

  // Forensic Upload States
  const [uploadFile, setUploadFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forensicResult, setForensicResult] = useState(null);
  const [manualMeta, setManualMeta] = useState({ location: '', timestamp: '', plate: 'Manual Review' });

  // Live Camera State
  const [isLiveCamera, setIsLiveCamera] = useState(false);

  // 🚀 Selective Deletion Logic
  const toggleSelection = (e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const deleteSelected = () => {
    if (window.confirm(`Delete ${selectedIds.length} records?`)) {
      selectedIds.forEach(id => remove(dbRef(db, `violations/${id}`)));
      setSelectedIds([]);
    }
  };

  const clearAllViolations = () => {
    if (window.confirm("Clear all logs?")) remove(dbRef(db, 'violations'));
  };

  // 🚀 LIVE CAMERA API CALL
  const toggleLiveCamera = async () => {
    const nextState = !isLiveCamera;
    setIsLiveCamera(nextState);

    try {
      await fetch('http://localhost:5000/api/toggle-camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextState }),
      });
    } catch (error) {
      console.error("Backend Connection Failed:", error);
      alert("Failed to connect to DashGuard Backend. Is pi_sentinel.py running?");
      setIsLiveCamera(!nextState); // Revert on failure
    }
  };

  // 🚀 FORENSIC UPLOAD API CALL
  const handleForensicAnalysis = async () => {
    if (!uploadFile) return alert("Please select a video file first");

    setIsAnalyzing(true);
    setForensicResult(null);

    const formData = new FormData();
    formData.append('video', uploadFile);

    try {
      const response = await fetch('http://localhost:5000/api/upload-video', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setForensicResult(data);
      } else {
        alert(data.error || "Analysis completed: No major violations detected.");
      }
    } catch (error) {
      console.error("Forensic Analysis Error:", error);
      alert("Connection error to AI Engine. Ensure pi_sentinel.py is running.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Submit confirmed upload to Firebase
  const handleForensicSubmit = () => {
    if (!manualMeta.location || !manualMeta.timestamp) return alert("Please fill metadata");
    push(dbRef(db, 'violations'), {
      ...forensicResult,
      ...manualMeta,
      source: 'uploaded',
      speed_kmh: 0
    });
    setForensicResult(null);
    setUploadFile(null);
    setView('dashboard');
    setFilter('uploaded');
  };

  // Real-time Firebase Listener
  useEffect(() => {
    const violationsRef = dbRef(db, 'violations');
    const unsubscribe = onValue(violationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loaded = Object.entries(data)
          .map(([id, values]) => ({ id, ...values, source: values.source || 'live' }))
          .reverse();
        setViolations(loaded);
      } else { setViolations([]); }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* Detail Modal */}
        {selectedViolation && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm">
            <div className="bg-white w-full max-w-5xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col md:flex-row relative max-h-[90vh]">
              <button onClick={() => setSelectedViolation(null)} className="absolute top-6 right-6 z-10 bg-slate-900/20 text-white p-2 rounded-full"><X /></button>
              <div className="w-full md:w-2/3 bg-slate-100 flex items-center justify-center">
                <img src={selectedViolation.evidence_image_url} className="w-full h-full object-contain" alt="Evidence" />
              </div>
              <div className="w-full md:w-1/3 p-10 bg-white overflow-y-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-red-50 p-3 rounded-2xl"><ShieldAlert className="text-red-600" /></div>
                  <h2 className="font-black text-2xl tracking-tight">Incident File</h2>
                </div>
                <div className="space-y-5">
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Source Stream</p>
                    <p className="text-sm font-black uppercase text-blue-600">{selectedViolation.source}</p>
                  </div>
                  <div className="p-5 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Detected Violation</p>
                    <p className="text-xl font-black text-red-600">{selectedViolation.violation}</p>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl font-bold text-sm text-slate-700"><Clock size={20} className="text-indigo-500" />{selectedViolation.timestamp}</div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl font-bold text-sm text-slate-700"><MapPin size={20} className="text-emerald-500" /><span className="truncate">{selectedViolation.location}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="bg-red-50 p-3 rounded-2xl"><ShieldAlert size={32} className="text-red-600" /></div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">DashGuard Live</h1>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Operational Command Center</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              <button onClick={() => setView('dashboard')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex gap-2 items-center transition-all ${view === 'dashboard' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><LayoutDashboard size={14} /> Records</button>
              <button onClick={() => setView('heatmap')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex gap-2 items-center transition-all ${view === 'heatmap' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon size={14} /> Heatmap</button>
            </div>

            {/* 🚀 LIVE CAMERA TOGGLE */}
            <button
              onClick={toggleLiveCamera}
              className={`flex items-center gap-2 font-black text-xs uppercase tracking-widest py-3 px-6 rounded-2xl transition-all active:scale-95 ${isLiveCamera ? 'bg-red-600 text-white shadow-lg animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              <Activity size={16} /> {isLiveCamera ? "Stop Live Feed" : "Start Live Feed"}
            </button>

            {/* 🚀 UPLOAD TAB BUTTON */}
            <button
              onClick={() => setView('upload')}
              className={`flex items-center gap-2 font-black text-xs uppercase tracking-widest py-3 px-6 rounded-2xl transition-all active:scale-95 ${view === 'upload' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
            >
              <Upload size={16} /> Forensic Upload
            </button>

            {selectedIds.length > 0 ? (
              <button onClick={deleteSelected} className="bg-red-600 text-white p-3 rounded-2xl shadow-lg animate-in zoom-in"><Trash2 size={20} /></button>
            ) : (
              <button onClick={clearAllViolations} className="bg-white hover:bg-red-50 text-red-600 p-3 rounded-2xl border border-red-100 transition-all"><Trash2 size={20} /></button>
            )}

            <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black flex items-center gap-3 shadow-xl">
              <Activity size={16} className="text-blue-400 animate-pulse" />
              <span className="text-sm tracking-tighter">{violations.length}</span>
            </div>
          </div>
        </header>

        {/* 🚀 Forensic Upload View */}
        {view === 'upload' && (
          <div className="max-w-2xl mx-auto py-12">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
              {!forensicResult ? (
                <>
                  <div className="bg-blue-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8"><Upload className="text-blue-600" size={40} /></div>
                  <h2 className="text-3xl font-black text-slate-900 mb-3">Forensic Analysis</h2>
                  <p className="text-slate-400 mb-10 font-bold uppercase text-[10px] tracking-widest">Process dashcam archives through DashGuard AI</p>

                  <input type="file" id="forensicUpload" accept="video/*" hidden onChange={(e) => setUploadFile(e.target.files[0])} />

                  <label htmlFor="forensicUpload" className="block w-full border-4 border-dashed border-slate-50 p-12 rounded-[2rem] cursor-pointer hover:bg-slate-50 transition-all mb-8">
                    <p className="font-black text-slate-400 text-sm uppercase tracking-tighter">
                      {uploadFile ? uploadFile.name : "Click to select Video Footage"}
                    </p>
                  </label>

                  <button
                    disabled={!uploadFile || isAnalyzing}
                    onClick={handleForensicAnalysis}
                    className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] transition-all shadow-xl ${isAnalyzing ? 'bg-slate-200 text-slate-500 cursor-not-allowed animate-pulse' : 'bg-slate-900 text-white active:scale-95 hover:bg-slate-800'}`}
                  >
                    {isAnalyzing ? "Processing AI Pipeline..." : "Initialize Scanner"}
                  </button>
                </>
              ) : (
                <div className="text-left space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
                  <div className="bg-green-50 p-5 rounded-3xl flex items-center gap-4 border border-green-100">
                    <CheckCircle2 className="text-green-600" size={24} />
                    <p className="font-black text-green-700 uppercase text-[11px] tracking-widest">AI Result: Violation Authenticated</p>
                  </div>

                  <div className="relative rounded-[2rem] overflow-hidden border-8 border-slate-50 shadow-inner">
                    <img src={forensicResult.evidence_image_url} className="w-full h-64 object-cover" alt="Preview" />
                    <div className="absolute top-4 left-4 bg-red-600 text-white font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-widest">
                      {forensicResult.violation}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Location of Incident</p>
                      <input className="w-full p-5 bg-slate-50 rounded-2xl font-black text-slate-700 border border-transparent focus:border-blue-200 outline-none transition-all" placeholder="e.g. Kozhikode Bypass" onChange={e => setManualMeta({ ...manualMeta, location: e.target.value })} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Date & Time</p>
                      <input type="datetime-local" className="w-full p-5 bg-slate-50 rounded-2xl font-black text-slate-700 border border-transparent focus:border-blue-200 outline-none transition-all" onChange={e => setManualMeta({ ...manualMeta, timestamp: e.target.value.replace('T', ' ') })} />
                    </div>
                  </div>

                  <button onClick={handleForensicSubmit} className="w-full bg-red-600 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-lg shadow-red-100 flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-red-700">
                    <Send size={20} /> Push to Central Ledger
                  </button>
                  <button onClick={() => { setForensicResult(null); setUploadFile(null); }} className="w-full bg-white text-slate-400 border-2 border-slate-100 py-3 rounded-[1.5rem] font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all">
                    Discard & Upload New
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 🚀 Main Dashboard View */}
        {!loading && view !== 'upload' && (
          <>
            {/* View Filter Toggle */}
            <div className="flex justify-center mb-10">
              <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
                {['all', 'live', 'uploaded'].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                    {f} Incidents
                  </button>
                ))}
              </div>
            </div>

            {view === 'heatmap' ? (
              <div className="bg-white p-4 rounded-[3rem] shadow-2xl h-[700px] relative border border-slate-100">
                <MapContainer center={[9.2993, 76.6154]} zoom={15} className="h-full w-full rounded-[2.5rem]">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
                  <HeatLayer points={violations.filter(v => filter === 'all' || v.source === filter).map(v => [parseFloat(v.latitude || 9.2993), parseFloat(v.longitude || 76.6154), 0.5])} />
                  {violations.filter(v => filter === 'all' || v.source === filter).map((v) => (
                    <Marker key={v.id} position={[parseFloat(v.latitude), parseFloat(v.longitude)]}>
                      <Popup><div className="w-56 p-2 font-sans"><img src={v.evidence_image_url} className="rounded-xl mb-3 shadow-md" /><div className="flex justify-between items-center mb-2"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${v.source === 'live' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{v.source}</span><span className="text-red-600 font-black text-xs">{v.violation}</span></div><p className="text-[10px] font-bold text-slate-500">{v.timestamp}</p></div></Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {violations.filter(v => filter === 'all' || v.source === filter).map((v) => (
                  <div key={v.id} onClick={() => setSelectedViolation(v)} className={`group cursor-pointer bg-white rounded-[2.5rem] shadow-xl overflow-hidden border-2 transition-all duration-500 ${selectedIds.includes(v.id) ? 'border-red-500 ring-4 ring-red-50 shadow-red-100' : 'border-slate-50 hover:shadow-2xl hover:border-slate-200'}`}>
                    <div className="relative h-64 bg-slate-100">
                      <div onClick={(e) => toggleSelection(e, v.id)} className={`absolute top-6 right-6 z-10 p-1.5 rounded-full backdrop-blur-md transition-all ${selectedIds.includes(v.id) ? 'bg-red-500 text-white' : 'bg-white/50 text-transparent border border-white/40'}`}><CheckCircle2 size={20} /></div>
                      <img src={v.evidence_image_url} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-1000" alt="Evidence" />
                      <div className="absolute top-6 left-6 bg-white/95 backdrop-blur text-slate-900 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-[0.15em] shadow-xl">{v.violation}</div>
                      <div className={`absolute bottom-6 left-6 text-[9px] font-black uppercase px-4 py-1.5 rounded-xl shadow-lg ${v.source === 'live' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>{v.source} Feed</div>
                    </div>
                    <div className="p-8">
                      <div className={`flex items-center gap-4 px-6 py-3 rounded-2xl border mb-6 font-mono font-black text-2xl tracking-tighter ${v.license_plate === "Manual Review Required" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-900 border-slate-100 shadow-inner"}`}>
                        <CarFront size={22} className={v.license_plate === "Manual Review Required" ? "text-amber-500" : "text-blue-600"} />
                        {v.license_plate}
                      </div>
                      <div className="flex items-center gap-4 mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="p-2.5 bg-white rounded-xl shadow-sm"><Clock size={18} className="text-indigo-600" /></div>
                        <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Time of Incident</p><p className="text-sm font-black text-slate-700 tracking-tight">{v.timestamp}</p></div>
                      </div>
                      <div className="flex items-center gap-4 px-2"><MapPin size={18} className="text-emerald-500" /><p className="text-xs font-bold text-slate-500 truncate">{v.location || 'Location Not Logged'}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!loading && violations.length === 0 && view !== 'upload' && (
          <div className="bg-white border-4 border-dashed border-slate-100 rounded-[4rem] py-40 flex flex-col items-center justify-center text-center mt-8">
            <ShieldAlert size={80} className="text-slate-200 mb-8" />
            <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Safe Roads Confirmed</h2>
            <p className="text-slate-400 max-w-xs mx-auto font-bold uppercase text-[10px] tracking-widest leading-relaxed">No active violations detected. Monitoring systems operating at peak efficiency.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;