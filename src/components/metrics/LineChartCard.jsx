import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Activity } from 'lucide-react';

export default function LineChartCard({ data }) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const chartData = data.map(item => ({
    day: item.day || item.date || item.label,
    water_level_m: parseFloat(item.level !== undefined ? item.level : (item.water_level_m !== undefined ? item.water_level_m : 0)),
    threshold_m: 1.8
  }));

  const maxVal = Math.max(...chartData.map(d => d.water_level_m), 3.0);

  return (
    <div style={{
      backgroundColor: 'rgba(24, 24, 27, 0.85)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      width: '100%'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
            Peak Water Submergence Hydrograph (Depth in Meters)
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          Severe Flood Risk
        </div>
      </div>

      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="waterDepthGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.65} />
                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="day" stroke="#a1a1aa" fontSize={11} tickLine={false} />
            <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} domain={[0, Math.ceil(maxVal + 0.5)]} />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const dataPoint = payload[0].payload;
                  return (
                    <div style={{
                      backgroundColor: '#09090b',
                      border: '1px solid #38bdf8',
                      padding: '8px 12px',
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.8)'
                    }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{dataPoint.day} Stage</div>
                      <div style={{ fontSize: 14, color: '#38bdf8', fontWeight: 800 }}>
                        Water Depth: {dataPoint.water_level_m} meters
                      </div>
                      <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>
                        Danger Level: +1.8m Baseline Exceeded
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <ReferenceLine y={1.8} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Danger Threshold (1.8m)', fill: '#ef4444', fontSize: 10, position: 'top' }} />

            <Area
              type="monotone"
              dataKey="water_level_m"
              stroke="#38bdf8"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#waterDepthGlow)"
              dot={{ r: 5, fill: '#38bdf8', stroke: '#09090b', strokeWidth: 2 }}
              activeDot={{ r: 7, fill: '#ffffff', stroke: '#38bdf8', strokeWidth: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
