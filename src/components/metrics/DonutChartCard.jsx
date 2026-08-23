import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';

export default function DonutChartCard({ data }) {
  const rawData = data || [
    { name: "Agricultural Cropland", value: 52, fill: "#3b82f6" },
    { name: "Residential Wards", value: 33, fill: "#ef4444" },
    { name: "Infrastructure & Utilities", value: 15, fill: "#f59e0b" }
  ];

  const chartData = rawData.map(item => ({
    name: item.name || item.category || "Sector",
    value: item.value !== undefined ? item.value : (item.percentage !== undefined ? item.percentage : 0),
    fill: item.fill || item.color || "#38bdf8"
  }));

  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <PieIcon size={16} style={{ color: '#38bdf8' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
          Land-Use Risk Footprint Breakdown (%)
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {/* Donut Visualizer with Center Overlay */}
        <div style={{ position: 'relative', width: 140, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} stroke="#09090b" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0];
                    return (
                      <div style={{
                        backgroundColor: '#09090b',
                        border: `1px solid ${item.payload.fill}`,
                        padding: '6px 10px',
                        borderRadius: 6,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.8)',
                        fontSize: 11
                      }}>
                        <div style={{ color: item.payload.fill, fontWeight: 700 }}>{item.name}</div>
                        <div style={{ color: '#ffffff', fontWeight: 800 }}>{item.value}% Impacted</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center Text Badge */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{totalValue}%</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Impact</div>
          </div>
        </div>

        {/* Legend Chips List */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chartData.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                backgroundColor: 'rgba(9, 9, 11, 0.6)',
                borderRadius: 6,
                border: `1px solid ${item.fill}30`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.fill, boxShadow: `0 0 8px ${item.fill}`, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: item.fill, marginLeft: 8, flexShrink: 0 }}>{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
