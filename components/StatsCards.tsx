
import React from 'react';
import { PerDcompOrder } from '../types';
import { formatCurrency } from '../utils/helpers';

interface StatsCardsProps {
  orders: PerDcompOrder[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ orders }) => {
  // Total Compensado (Filtra estritamente "Declaração de Compensação")
  const totalCompensated = orders
    .filter(o => {
      const docType = (o.documentType || '').toLowerCase();
      return docType.includes('compensação') || docType.includes('dcomp');
    })
    .reduce((acc, curr) => acc + curr.value, 0);

  // Total Restituição/Ressarcimento (Tudo que NÃO é compensação)
  const totalRestitution = orders
    .filter(o => {
      const docType = (o.documentType || '').toLowerCase();
      return !docType.includes('compensação') && !docType.includes('dcomp');
    })
    .reduce((acc, curr) => acc + curr.value, 0);

  // Efetivado (Pago) - Aplica-se geralmente a Restituições/Ressarcimentos
  const totalPaid = orders
    .filter(o => o.isPaid)
    .reduce((acc, curr) => acc + curr.value, 0);
  
  // Saldo Pendente (Restituições que ainda não caíram na conta)
  const totalPending = Math.max(0, totalRestitution - totalPaid);
  
  // Valor Bruto Total (Soma em tempo real de Pendentes + Compensados)
  const realTimeGrossTotal = totalCompensated + totalPending;
  
  const countPaid = orders.filter(o => o.isPaid).length;

  const stats = [
    { label: 'Valor Bruto Total', value: formatCurrency(realTimeGrossTotal), color: 'bg-emerald-800', icon: '💰', sub: 'Pendentes + Compensados' },
    { label: 'Compensado (DCOMP)', value: formatCurrency(totalCompensated), color: 'bg-indigo-600', icon: '⚖️', sub: 'Abatimento Tributário' },
    { label: 'Efetivado (Pago)', value: formatCurrency(totalPaid), color: 'bg-blue-600', icon: '✅', sub: `${countPaid} itens baixados` },
    { label: 'Saldo Pendente', value: formatCurrency(totalPending), color: 'bg-amber-500', icon: '⏳', sub: 'Restituição a cair' },
    { label: 'Total Pedidos', value: orders.length, color: 'bg-slate-700', icon: '📑', sub: 'Registros ativos' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
      {stats.map((stat, idx) => (
        <div key={idx} className={`bg-white p-4 rounded-2xl shadow-sm border border-slate-200 card relative overflow-hidden group hover:shadow-md transition-all ${idx === 4 ? 'col-span-2 lg:col-span-1' : ''}`}>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className="text-lg font-black text-slate-800 leading-tight truncate">
                {stat.value}
              </p>
              {stat.sub && <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase italic">{stat.sub}</p>}
            </div>
            <span className="text-xl opacity-20 no-print">{stat.icon}</span>
          </div>
          <div className={`absolute bottom-0 left-0 h-1 w-full ${stat.color} opacity-80 group-hover:h-1.5 transition-all`}></div>
        </div>
      ))}
    </div>
  );
};
