import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { formatDate, formatPrice } from '../utils/format';
import './PriceChart.css';

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', '5Y'];
const PERIOD_MAP = { '1W': '1w', '1M': '1m', '3M': '3m', '6M': '6m', '1Y': '1y', '5Y': '5y' };

function CustomTooltip({ active, payload, label, currency, period }) {
  if (!active || !payload?.length) return null;
  const price = payload[0]?.value;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__date">{formatDate(label, PERIOD_MAP[period])}</p>
      <p className="chart-tooltip__price">{formatPrice(price, currency)}</p>
    </div>
  );
}

export default function PriceChart({ history, period, onPeriodChange, currency = 'USD' }) {
  const data = useMemo(() => {
    if (!history?.length) return [];
    return history.map(row => ({
      date: row.date,
      close: row.close != null ? parseFloat(row.close.toFixed(4)) : null,
    })).filter(r => r.close != null);
  }, [history]);

  const isPositive = data.length >= 2 && data[data.length - 1].close >= data[0].close;
  const lineColor  = isPositive ? '#3fb950' : '#f85149';
  const gradId     = isPositive ? 'gradGreen' : 'gradRed';

  const minVal = useMemo(() => Math.min(...data.map(d => d.close)), [data]);
  const maxVal = useMemo(() => Math.max(...data.map(d => d.close)), [data]);
  const pad    = (maxVal - minVal) * 0.05 || 1;

  const tickCount = period === '1W' ? 7 : period === '1M' ? 6 : 8;

  return (
    <div className="price-chart">
      {/* Period selector */}
      <div className="price-chart__periods" role="group" aria-label="Select time period">
        {PERIODS.map(p => (
          <button
            key={p}
            className={`price-chart__period-btn ${period === p ? 'active' : ''}`}
            onClick={() => onPeriodChange(p)}
            style={period === p ? { '--btn-color': lineColor } : {}}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="price-chart__empty">No historical data available for this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3fb950" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f85149" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f85149" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(48,54,61,0.8)"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              tickFormatter={v => formatDate(v, PERIOD_MAP[period])}
              tick={{ fill: '#6e7681', fontSize: 11 }}
              axisLine={{ stroke: '#30363d' }}
              tickLine={false}
              interval="preserveStartEnd"
              tickCount={tickCount}
            />

            <YAxis
              domain={[minVal - pad, maxVal + pad]}
              tickFormatter={v => formatPrice(v, currency).replace(/[A-Z]{3}\s?/g, '')}
              tick={{ fill: '#6e7681', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickCount={6}
            />

            <Tooltip
              content={<CustomTooltip currency={currency} period={period} />}
              cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: '4 3' }}
            />

            <Area
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, stroke: '#161b22', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
