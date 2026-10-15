"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DecisionsChart({ data }: { data: { week: string; APPROVED: number; CHANGES_REQUESTED: number; REJECTED: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e4e4e7" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip cursor={{ fill: "#f4f4f5" }} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="APPROVED" name="Approved" stackId="a" fill="#059669" />
        <Bar dataKey="CHANGES_REQUESTED" name="Changes requested" stackId="a" fill="#d97706" />
        <Bar dataKey="REJECTED" name="Rejected" stackId="a" fill="#71717a" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopRulesChart({ data }: { data: { rule: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 28 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="rule" width={190} tickLine={false} axisLine={false} fontSize={11} />
        <Tooltip cursor={{ fill: "#f4f4f5" }} />
        <Bar dataKey="count" name="Findings" fill="#4f46e5" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
