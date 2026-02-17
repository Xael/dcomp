
import React, { useState } from 'react';
import { PerDcompOrder } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';

interface OrderTableProps {
  orders: PerDcompOrder[];
  onDelete: (id: string) => void;
  onUpdate: (order: PerDcompOrder) => void;
}

export const OrderTable: React.FC<OrderTableProps> = ({ orders, onDelete, onUpdate }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempOrder, setTempOrder] = useState<PerDcompOrder | null>(null);

  const startEditing = (order: PerDcompOrder) => {
    setEditingId(order.id);
    setTempOrder({ ...order });
  };

  const saveEdit = () => {
    if (tempOrder) {
      onUpdate(tempOrder);
      setEditingId(null);
      setTempOrder(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTempOrder(null);
  };

  const togglePaid = (order: PerDcompOrder) => {
    onUpdate({ ...order, isPaid: !order.isPaid });
  };

  const handleInputChange = (field: keyof PerDcompOrder, value: any) => {
    if (tempOrder) {
      setTempOrder({ ...tempOrder, [field]: value });
    }
  };

  const getStatusStyle = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('deferido')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s.includes('indeferido') || s.includes('cancelado')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (s.includes('análise') || s.includes('processamento')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-emerald-800 border-b border-emerald-900">
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-44">Identificação PER/DCOMP</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-32">Transmissão</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest">Crédito / Documento</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-32">Situação</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-36 text-right">Valor Líquido</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-24 text-center no-print">Baixa</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-40 no-print">Banco Recept.</th>
              <th className="px-4 py-5 text-[10px] font-black text-emerald-50 uppercase tracking-widest w-36 text-center no-print">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-20 text-center text-slate-400 bg-slate-50 italic font-medium">
                  Aguardando importação de planilha .xlsx para visualização dos registros.
                </td>
              </tr>
            ) : (
              orders.map((order, idx) => {
                const isEditing = editingId === order.id;
                const rowData = isEditing ? tempOrder! : order;
                const isCompensation = order.documentType.toLowerCase().includes('compensação');

                return (
                  <tr key={order.id} className={`${order.isPaid ? 'bg-emerald-50/50' : isCompensation ? 'bg-indigo-50/20' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-emerald-100/30 transition-colors group`}>
                    {/* PER/DCOMP */}
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={rowData.perDcompNumber}
                          onChange={(e) => handleInputChange('perDcompNumber', e.target.value)}
                          className="w-full p-2 border-2 border-emerald-200 rounded-lg text-xs font-bold focus:border-emerald-500 outline-none"
                        />
                      ) : (
                        <span className="font-bold text-slate-800 text-xs block truncate" title={order.perDcompNumber}>
                          {order.perDcompNumber}
                        </span>
                      )}
                    </td>

                    {/* Transmissão */}
                    <td className="px-4 py-4 text-xs text-slate-600 font-semibold">
                      {isEditing ? (
                        <input 
                          type="date" 
                          value={rowData.transmissionDate ? rowData.transmissionDate.split('T')[0] : ''}
                          onChange={(e) => handleInputChange('transmissionDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
                          className="w-full p-2 border-2 border-emerald-200 rounded-lg text-xs outline-none"
                        />
                      ) : (
                        formatDate(order.transmissionDate)
                      )}
                    </td>

                    {/* Crédito / Documento */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        {isEditing ? (
                          <>
                            <input 
                              type="text" 
                              value={rowData.creditType}
                              onChange={(e) => handleInputChange('creditType', e.target.value)}
                              className="w-full p-1.5 border-2 border-emerald-200 rounded-lg text-[10px] mb-1 outline-none"
                              placeholder="Tipo de Crédito"
                            />
                            <input 
                              type="text" 
                              value={rowData.documentType}
                              onChange={(e) => handleInputChange('documentType', e.target.value)}
                              className="w-full p-1.5 border-2 border-emerald-200 rounded-lg text-[10px] outline-none"
                              placeholder="Tipo de Documento"
                            />
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-slate-700 font-bold leading-tight">{order.creditType}</span>
                            <span className={`text-[9px] uppercase font-black tracking-wider ${isCompensation ? 'text-indigo-600' : 'text-slate-400'}`}>
                              {order.documentType}
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Situação */}
                    <td className="px-4 py-4">
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={rowData.status}
                          onChange={(e) => handleInputChange('status', e.target.value)}
                          className="w-full p-2 border-2 border-emerald-200 rounded-lg text-[10px] font-bold outline-none"
                        />
                      ) : (
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black border uppercase block text-center truncate ${getStatusStyle(order.status)}`}>
                          {order.status}
                        </span>
                      )}
                    </td>

                    {/* Valor */}
                    <td className="px-4 py-4 text-right">
                      {isEditing ? (
                        <input 
                          type="number" 
                          step="0.01"
                          value={rowData.value}
                          onChange={(e) => handleInputChange('value', parseFloat(e.target.value) || 0)}
                          className="w-full p-2 border-2 border-emerald-200 rounded-lg text-xs text-right font-bold outline-none"
                        />
                      ) : (
                        <span className={`text-sm font-black ${order.isPaid ? 'text-emerald-700' : isCompensation ? 'text-indigo-700' : 'text-slate-900'}`}>
                          {formatCurrency(order.value)}
                        </span>
                      )}
                    </td>

                    {/* Baixa (Toggle Pago) */}
                    <td className="px-4 py-4 text-center no-print">
                      <button 
                        onClick={() => togglePaid(order)}
                        className={`w-12 h-6 rounded-full relative transition-all duration-300 shadow-inner ${order.isPaid ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        title={order.isPaid ? "Estornar Pagamento" : "Confirmar Recebimento"}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${order.isPaid ? 'left-7' : 'left-1'}`}></div>
                      </button>
                    </td>

                    {/* Banco */}
                    <td className="px-4 py-4 no-print">
                      <input 
                        type="text" 
                        value={order.bank || ''} 
                        onChange={(e) => onUpdate({ ...order, bank: e.target.value })}
                        placeholder="Banco..."
                        className={`w-full bg-transparent border-b-2 text-[11px] focus:outline-none transition-all ${order.bank ? 'border-emerald-400 font-bold text-emerald-800' : 'border-slate-200 text-slate-400 focus:border-emerald-300'}`}
                      />
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-4 text-center no-print">
                      <div className="flex items-center justify-center gap-2">
                        {isEditing ? (
                          <>
                            <button 
                              onClick={saveEdit} 
                              className="bg-emerald-600 text-white px-3 py-1 rounded-md font-bold text-[10px] uppercase hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                              Salvar
                            </button>
                            <button 
                              onClick={cancelEdit} 
                              className="bg-slate-200 text-slate-600 px-3 py-1 rounded-md font-bold text-[10px] uppercase hover:bg-slate-300 transition-colors"
                            >
                              X
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => startEditing(order)} 
                              className="text-blue-600 font-black text-[10px] uppercase hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => onDelete(order.id)} 
                              className="text-rose-600 font-black text-[10px] uppercase hover:bg-rose-50 px-2 py-1 rounded transition-colors"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
