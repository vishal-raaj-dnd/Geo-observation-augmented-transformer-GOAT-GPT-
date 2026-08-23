import React, { useState, useEffect, useRef, useMemo } from 'react';
import { History, Sparkles, PanelLeftClose, PanelLeftOpen, Layers } from 'lucide-react';
import Globe3DIntro from './components/intro/Globe3DIntro';
import Map3DCanvas, { fetchBoundaryGeojson } from './components/map/Map3DCanvas';
import HistorySidebar from './components/history/HistorySidebar';
import ChatSidebar from './components/chat/ChatSidebar';
import ImageryRail from './components/rail/ImageryRail';
import MetricCardGrid from './components/metrics/MetricCardGrid';
import { resolveCityImagery } from './services/imagery';
import { STATE_CITIES } from './data/cities';
import {
  getStoredConversations,
  saveStoredConversation,
  getStoredMessages,
  saveStoredMessage
} from './services/storage';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// "August 2026" -> "2026-08" for imagery providers
const toIsoMonth = (label) => {
  const [mon, yr] = (label || '').trim().split(/\s+/);
  const m = String(MONTHS.findIndex(x => x.toLowerCase() === (mon || '').toLowerCase()) + 1).padStart(2, '0');
  return (yr && /^\d{4}$/.test(yr)) ? `${yr}-${m === '00' ? '01' : m}` : null;
};

export default function App() {
  // Intro State — rotating Earth video intro screen
  const [isIntro, setIsIntro] = useState(true);

  // Cockpit panel state — map is ALWAYS the primary fullscreen surface
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [railTab, setRailTab] = useState('frames');
  const [showFloatingMetrics, setShowFloatingMetrics] = useState(false);

  // Location & Filter State variables
  const [selectedState, setSelectedState] = useState('Tamil Nadu');
  const [selectedCity, setSelectedCity] = useState('Chennai');
  const [dateTime, setDateTime] = useState('August 2026');
  const [prompt, setPrompt] = useState('');

  const [isSatellite, setIsSatellite] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);

  const [attachedImage, setAttachedImage] = useState(null);
  const [isToolLoading, setIsToolLoading] = useState(false);
  const [toolStepText, setToolStepText] = useState('');

  /* ---- Chat → Map command bridge ---- */
  const cmdSeqRef = useRef(0);
  const [mapCommand, setMapCommand] = useState(null);
  const dispatchMapCommand = (type, payload) => setMapCommand({ seq: ++cmdSeqRef.current, type, payload });

  const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity?.name || 'Chennai';
  const stateName = selectedState || 'Tamil Nadu';

  const [cityCoords, setCityCoords] = useState([80.2707, 13.0827]);
  const cityBbox = useMemo(() => (
    Array.isArray(cityCoords)
      ? [cityCoords[0] - 0.35, cityCoords[1] - 0.25, cityCoords[0] + 0.35, cityCoords[1] + 0.25]
      : null
  ), [cityCoords]);

  // Warm the boundary cache
  useEffect(() => {
    fetchBoundaryGeojson(cityName, stateName, cityCoords).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic OpenStreetMap Geocoding to update 3D Map coordinates (race-guarded)
  const geocodeSeqRef = React.useRef(0);
  useEffect(() => {
    if (!cityName) return;
    const seq = ++geocodeSeqRef.current;
    const query = `${cityName}, ${stateName}, India`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (seq !== geocodeSeqRef.current) return;
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          setCityCoords([lon, lat]);
        }
      })
      .catch(err => console.warn("Geocoding coordinates fallback:", err));
  }, [cityName, stateName]);

  // Resolve REAL satellite frames once per location
  const [imagery, setImagery] = useState(null);
  useEffect(() => {
    if (!cityBbox) return;
    let cancelled = false;
    setImagery(null);
    resolveCityImagery(cityBbox, cityName, stateName, toIsoMonth(dateTime))
      .then(res => { if (!cancelled && res) setImagery(res); })
      .catch(err => console.warn('[App] imagery resolution failed:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityName, stateName, cityBbox.join(',')]);

  // Latest finalized AI deliverables
  const latestDeliverables = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender === 'ai' && m.deliverables && !m.streaming) return m.deliverables;
    }
    return null;
  }, [messages]);
  const latestAiText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender === 'ai' && m.text && !m.streaming) return m.text;
    }
    return '';
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    let cancelled = false;
    getStoredConversations()
      .then(convs => { if (!cancelled) setConversations(Array.isArray(convs) ? convs : []); })
      .catch(() => { if (!cancelled) setConversations([]); });
    return () => { cancelled = true; };
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;
    getStoredMessages(activeConversationId)
      .then(msgs => {
        if (cancelled) return;
        const list = Array.isArray(msgs) ? msgs : [];
        setMessages(list);
      })
      .catch(() => { if (!cancelled) setMessages([]); });
    return () => { cancelled = true; };
  }, [activeConversationId]);

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPrompt('');
    setAttachedImage(null);
    setShowFloatingMetrics(false);
    dispatchMapCommand('clearOverlays', {});
    setIsHistoryOpen(false);
  };

  const handleSelectConversation = (convId) => {
    setActiveConversationId(convId);
    setIsHistoryOpen(false);
    setIsChatOpen(true);
  };

  const handleSendQuery = async (queryTextOverride) => {
    const textToSend = queryTextOverride || prompt;
    if (!textToSend || !textToSend.trim()) return;

    // Auto-detect if query mentions any city in our catalog (e.g. Bhagalpur, Mumbai, Pune)
    let activeCity = cityName;
    let activeState = stateName;
    for (const [st, cList] of Object.entries(STATE_CITIES)) {
      for (const c of cList) {
        if (textToSend.toLowerCase().includes(c.toLowerCase())) {
          activeCity = c;
          activeState = st;
          break;
        }
      }
    }

    if (activeCity !== cityName || activeState !== stateName) {
      setSelectedState(activeState);
      setSelectedCity(activeCity);
    }

    setIsChatOpen(true);

    let convId = activeConversationId;
    let currentConvs = [...conversations];

    if (!convId) {
      convId = `conv_${Date.now()}`;
      const newConv = {
        id: convId,
        title: `GOAT Analysis — ${activeCity}`,
        state: activeState,
        city: activeCity,
        timestamp: new Date().toLocaleDateString('en-GB')
      };
      currentConvs = [newConv, ...currentConvs];
      setConversations(currentConvs);
      saveStoredConversation(newConv);
      setActiveConversationId(convId);
    }

    const userMsg = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      attached_image: attachedImage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    saveStoredMessage(convId, userMsg);
    setPrompt('');
    setAttachedImage(null);

    // Pulse boundary while processing
    dispatchMapCommand('pulseBoundary', {});

    // Connect to GOAT GPT FastAPI Backend (http://localhost:8000/api/chat/stream) with SSE Progress Streaming
    setIsToolLoading(true);
    setToolStepText(`Connecting to GOAT GPT Backend (Team ATLAS)...`);

    const aiMsgId = `msg_ai_${Date.now()}`;
    const aiTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, {
      id: aiMsgId, sender: 'ai', text: '', streaming: true, deliverables: null, timestamp: aiTimestamp
    }]);

    const appendDelta = (delta) => {
      setMessages(prev => prev.map(m => (m.id === aiMsgId ? { ...m, text: m.text + delta } : m)));
    };
    const finalizeMsg = (payload) => {
      setMessages(prev => prev.map(m => (m.id === aiMsgId ? {
        ...m,
        streaming: false,
        deliverables: payload?.deliverables || m.deliverables || null,
        text: m.text || payload?.deliverables?.text || m.text
      } : m)));
    };
    const stopLoading = () => { setIsToolLoading(false); setToolStepText(''); };

    const LOCAL_BACKEND = `http://localhost:8000/api/chat/stream?query=${encodeURIComponent(textToSend)}&city=${encodeURIComponent(activeCity)}&state=${encodeURIComponent(activeState)}&month=${encodeURIComponent(dateTime.split(' ')[0] || 'August')}&year=${encodeURIComponent(dateTime.split(' ')[1] || '2026')}`;
    const HF_SPACE_URL = `https://dinesh-07-dev-goat-gpt-backend.hf.space/api/predict`;

    let isFinished = false;
    let fallbackTimer = null;

    const finalizeOnce = (deliverables, fullText) => {
      if (isFinished) return;
      isFinished = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      finalizeMsg({ deliverables: deliverables || { text: fullText } });
      saveStoredMessage(convId, {
        id: aiMsgId, sender: 'ai', text: fullText,
        deliverables: deliverables || { text: fullText }, timestamp: aiTimestamp
      });
      stopLoading();
    };

    // Fast-path: Check if local SSE server is responsive within 1000ms; if not, query HF GPU / backend instantly
    fallbackTimer = setTimeout(() => {
      if (!isFinished && !hasReceivedMessage) {
        callHuggingFaceGPU();
      }
    }, 1200);

    try {
      const eventSource = new EventSource(LOCAL_BACKEND);

      eventSource.onmessage = (event) => {
        hasReceivedMessage = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            setToolStepText(`[${data.percent}%] ${data.message}`);
          } else if (data.type === 'text_chunk') {
            appendDelta(data.text);
          } else if (data.type === 'done') {
            eventSource.close();
            finalizeOnce(data.deliverables, data.deliverables?.text || '');
          }
        } catch (err) {}
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!isFinished && !hasReceivedMessage) {
          callHuggingFaceGPU();
        }
      };
    } catch (err) {
      if (!isFinished) {
        callHuggingFaceGPU();
      }
    }

    async function callHuggingFaceGPU() {
      if (isFinished) return;
      try {
        setToolStepText(`Connecting to Hugging Face GPU Space (dinesh-07-dev/goat-gpt-backend)...`);
        const resp = await fetch(HF_SPACE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: [null, textToSend, "flood"] })
        });
        if (resp.ok) {
          const data = await resp.json();
          let resultText = "Model inference complete.";
          if (typeof data.data?.[1] === 'string') resultText = data.data[1];
          else if (typeof data.data?.[0] === 'string') resultText = data.data[0];
          else if (data.data?.[1]?.text) resultText = data.data[1].text;
          else if (typeof data.data?.[1] === 'object') resultText = JSON.stringify(data.data[1], null, 2);

          appendDelta(resultText);
          finalizeOnce({
            telemetry: {
              model_name: "Qwen2.5-VL-3B-Instruct (ZeroGPU)",
              sensor: "Sentinel-2 L2A STAC"
            },
            text: resultText
          }, resultText);
          return;
        }
      } catch (err) {
        console.warn("HF Space call error:", err);
      }

      // If both local and HF GPU are offline, inform user authentically
      const offlineMsg = `### System Status: Remote GPU Model Connection\n\nUnable to establish connection with Hugging Face ZeroGPU endpoint (\`dinesh-07-dev/goat-gpt-backend\`) and local backend on port 8000.\n\nPlease verify that your Hugging Face Space is active or the local backend is started (\`python -m backend.app.main\`).`;
      appendDelta(offlineMsg);
      finalizeOnce({ text: offlineMsg }, offlineMsg);
    }
  };

  // When deliverables arrive, open the rail automatically
  useEffect(() => {
    if (latestDeliverables) setIsRailOpen(true);
  }, [latestDeliverables]);

  const fitPadding = {
    left: isChatOpen ? 432 : 48,
    right: isRailOpen ? 404 : 80
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#090a0f',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Optional Intro view */}
      {isIntro && (
        <Globe3DIntro onGetStarted={() => setIsIntro(false)} />
      )}

      {/* PRIMARY SURFACE: FULLSCREEN MAP */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}>
        <Map3DCanvas
          selectedCity={selectedCity}
          selectedState={selectedState}
          selectedCityCoords={cityCoords}
          isSatellite={isSatellite}
          setIsSatellite={setIsSatellite}
          isMinimized={false}
          isIntro={isIntro}
          onGetStarted={() => setIsIntro(false)}
          mapCommand={mapCommand}
          fitPadding={fitPadding}
        />
      </div>

      {/* TOP HUD HEADER BAR */}
      {!isIntro && (
        <header style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 54,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px 0 20px',
          pointerEvents: 'none'
        }}>
          {/* Left: History & Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto' }}>
            <button
              onClick={() => setIsChatOpen(o => !o)}
              title={isChatOpen ? 'Hide chat panel' : 'Show chat panel'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 6, backgroundColor: '#18181b',
                border: '1px solid #27272a', color: '#e2e8f0',
                fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              {isChatOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
              Chat
            </button>

            <button
              onClick={() => setIsHistoryOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 6, backgroundColor: '#18181b',
                border: '1px solid #27272a', color: '#e2e8f0',
                fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <History size={14} />
              History
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
              <Sparkles size={15} style={{ color: '#38bdf8' }} />
              GOAT GPT <span style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', backgroundColor: '#18181b', border: '1px solid #27272a', padding: '2px 7px', borderRadius: 4 }}>Team ATLAS</span>
            </div>
          </div>

          {/* Right: Imagery rail toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
            <button
              onClick={() => setIsRailOpen(o => !o)}
              title={isRailOpen ? 'Hide imagery panel' : 'Show imagery panel'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: isRailOpen ? 'rgba(2, 132, 199, 0.2)' : '#18181b',
                border: isRailOpen ? '1px solid #0284c7' : '1px solid #27272a',
                color: isRailOpen ? '#38bdf8' : '#e2e8f0',
                fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              <Layers size={13} />
              Imagery & Analytics
            </button>
          </div>
        </header>
      )}

      {/* LEFT: CHAT SIDEBAR */}
      {!isIntro && (
        <ChatSidebar
          open={isChatOpen}
          selectedState={selectedState}
          setSelectedState={setSelectedState}
          selectedCity={selectedCity}
          setSelectedCity={setSelectedCity}
          dateTime={dateTime}
          setDateTime={setDateTime}
          cityCoords={cityCoords}
          messages={messages}
          onSendMessage={handleSendQuery}
          attachedImage={attachedImage}
          onRemoveAttachedImage={() => setAttachedImage(null)}
          onAttachImageFromGallery={(img) => setAttachedImage(img)}
          isToolLoading={isToolLoading}
          toolStepText={toolStepText}
          imagery={imagery}
          dispatchMapCommand={dispatchMapCommand}
          metricsVisible={showFloatingMetrics}
          onToggleMetrics={() => setShowFloatingMetrics(o => !o)}
          onOpenRailTab={(t) => { setRailTab(t); setIsRailOpen(true); }}
        />
      )}

      {/* RIGHT: IMAGERY RAIL */}
      {!isIntro && (
        <ImageryRail
          open={isRailOpen}
          onClose={() => setIsRailOpen(false)}
          tab={railTab}
          setTab={setRailTab}
          imagery={imagery}
          latestDeliverables={latestDeliverables}
          summaryText={latestAiText}
          cityName={cityName}
          stateName={stateName}
          dispatchMapCommand={dispatchMapCommand}
        />
      )}



      {/* History Log Sidebar Drawer */}
      <HistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        conversations={conversations}
        setConversations={setConversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewThread={handleStartNewChat}
      />
    </div>
  );
}
