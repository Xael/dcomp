
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PerDcompOrder, AppState } from './types';
import { generateId, downloadJson, formatCurrency, formatDate } from './utils/helpers';
import { OrderTable } from './components/OrderTable';
import { StatsCards } from './components/StatsCards';
import { extractPerDcompFromXml } from './services/geminiService';

type ViewType = 'all' | 'compensation' | 'restitution';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    orders: [],
    isProcessing: false,
    error: null,
  });

  // Estados de Filtro
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewType, setViewType] = useState<ViewType>('all');

  // Estados de Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Estado do Menu de Opções
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualEntry, setManualEntry] = useState<Partial<PerDcompOrder>>({
    perDcompNumber: '',
    transmissionDate: new Date().toISOString().split('T')[0],
    creditType: '',
    documentType: '',
    status: 'Em análise',
    value: 0,
    isPaid: false,
    bank: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('perdcomp_orders_v4');
    if (saved) {
      try {
        setState(prev => ({ ...prev, orders: JSON.parse(saved) }));
      } catch (e) {
        console.error("Falha ao carregar dados locais");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('perdcomp_orders_v4', JSON.stringify(state.orders));
  }, [state.orders]);

  // Fechar menu de opções ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setIsOptionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, itemsPerPage, viewType]);

  const parseValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    let cleanStr = String(val)
      .replace(/R\$/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  };

  // Lógica de Filtragem Avançada
  const filteredOrders = useMemo(() => {
    return state.orders.filter(order => {
      // Filtro de Busca e Banco
      const matchSearch = order.perDcompNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (order.bank || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de Datas
      const orderDate = new Date(order.transmissionDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);
      const matchDate = (!start || orderDate >= start) && (!end || orderDate <= end);

      // Filtro de Tipo de Visualização (DCOMP vs Restituição)
      const docType = (order.documentType || '').toLowerCase();
      const isComp = docType.includes('compensação') || docType.includes('dcomp');
      
      let matchViewType = true;
      if (viewType === 'compensation') matchViewType = isComp;
      if (viewType === 'restitution') matchViewType = !isComp;
      
      return matchSearch && matchDate && matchViewType;
    });
  }, [state.orders, searchTerm, startDate, endDate, viewType]);

  // Lógica de Paginação
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    const isXml = file.name.toLowerCase().endsWith('.xml');

    if (isXml) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const extracted = await extractPerDcompFromXml(content);
          
          const newOrder: PerDcompOrder = {
            id: generateId(),
            perDcompNumber: extracted.perDcompNumber || 'N/A',
            transmissionDate: extracted.transmissionDate ? new Date(extracted.transmissionDate).toISOString() : new Date().toISOString(),
            creditType: extracted.creditType || 'N/A',
            documentType: extracted.documentType || 'N/A',
            status: extracted.status || 'Em Processamento',
            value: extracted.value || 0,
            importedAt: new Date().toISOString(),
            isPaid: false,
            bank: '',
          };

          setState(prev => ({
            ...prev,
            orders: [newOrder, ...prev.orders],
            isProcessing: false
          }));
        } catch (err: any) {
          setState(prev => ({ ...prev, isProcessing: false, error: "Erro ao processar XML: " + err.message }));
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) throw new Error("O arquivo parece estar vazio.");

          const newOrders: PerDcompOrder[] = jsonData.map((row: any) => ({
            id: generateId(),
            perDcompNumber: String(row['PER/DCOMP'] || row['PERDCOMP'] || row['PER DCOMP'] || 'N/A'),
            transmissionDate: row['Data de Transmissão'] ? new Date(row['Data de Transmissão']).toISOString() : new Date().toISOString(),
            creditType: String(row['Tipo de Crédito'] || 'N/A'),
            documentType: String(row['Tipo de Documento'] || 'N/A'),
            status: String(row['Situação'] || 'Em análise'),
            value: parseValue(row['Valor']),
            importedAt: new Date().toISOString(),
            isPaid: false,
            bank: '',
          }));

          setState(prev => ({
            ...prev,
            orders: [...newOrders, ...prev.orders],
            isProcessing: false
          }));
        } catch (err: any) {
          setState(prev => ({ ...prev, isProcessing: false, error: "Erro ao processar planilha: " + err.message }));
        }
      };
      reader.readAsBinaryString(file);
    }
    event.target.value = '';
  };

  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntry.perDcompNumber || !manualEntry.value) {
      alert("Por favor, preencha o número do PER/DCOMP e o valor.");
      return;
    }

    const newOrder: PerDcompOrder = {
      id: generateId(),
      perDcompNumber: manualEntry.perDcompNumber || 'N/A',
      transmissionDate: manualEntry.transmissionDate ? new Date(manualEntry.transmissionDate).toISOString() : new Date().toISOString(),
      creditType: manualEntry.creditType || 'N/A',
      documentType: manualEntry.documentType || 'N/A',
      status: manualEntry.status || 'Em análise',
      value: Number(manualEntry.value),
      importedAt: new Date().toISOString(),
      isPaid: Boolean(manualEntry.isPaid),
      bank: manualEntry.bank || '',
    };

    setState(prev => ({
      ...prev,
      orders: [newOrder, ...prev.orders]
    }));

    setShowManualForm(false);
    setManualEntry({
      perDcompNumber: '',
      transmissionDate: new Date().toISOString().split('T')[0],
      creditType: '',
      documentType: '',
      status: 'Em análise',
      value: 0,
      isPaid: false,
      bank: ''
    });
  };

  const handleExportXlsx = () => {
    if (filteredOrders.length === 0) {
      alert("Não há dados filtrados para exportar.");
      return;
    }

    const exportData = filteredOrders.map(o => ({
      'PER/DCOMP': o.perDcompNumber,
      'Data de Transmissão': new Date(o.transmissionDate).toLocaleDateString('pt-BR'),
      'Tipo de Crédito': o.creditType,
      'Tipo de Documento': o.documentType,
      'Situação': o.status,
      'Valor': o.value,
      'Baixado': o.isPaid ? 'SIM' : 'NÃO',
      'Banco': o.bank || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório PERDCOMP");
    
    const suffix = viewType === 'compensation' ? '_COMP' : viewType === 'restitution' ? '_REST' : '';
    XLSX.writeFile(workbook, `relatorio_perdcomp${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleGeneratePdf = () => {
    if (filteredOrders.length === 0) {
      alert("Não há dados filtrados para gerar o PDF.");
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const totalValue = filteredOrders.reduce((acc, curr) => acc + curr.value, 0);
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const reportTitle = viewType === 'compensation' ? 'Relatório de Compensações (DCOMP)' : 
                        viewType === 'restitution' ? 'Relatório de Restituições/Ressarcimentos' : 
                        'Relatório Geral de Fluxo PER/DCOMP';

    // Cabeçalho
    doc.setFontSize(20);
    doc.setTextColor(6, 78, 59); // Emerald 900
    doc.text(reportTitle, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${dateStr}`, 14, 28);
    doc.text(`Total de registros: ${filteredOrders.length}`, 14, 33);
    doc.text(`Valor Total do Período: ${formatCurrency(totalValue)}`, 14, 38);

    // Tabela
    const tableData = filteredOrders.map(o => [
      o.perDcompNumber,
      formatDate(o.transmissionDate),
      `${o.creditType}\n(${o.documentType})`,
      o.status,
      formatCurrency(o.value),
      o.isPaid ? 'SIM' : 'NÃO',
      o.bank || '-'
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['PER/DCOMP', 'Transmissão', 'Crédito / Documento', 'Situação', 'Valor', 'Pago', 'Banco']],
      body: tableData,
      headStyles: { fillColor: [6, 95, 70] }, // Emerald 800
      alternateRowStyles: { fillColor: [248, 250, 252] }, // Slate 50
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'center' },
        5: { halign: 'center' }
      }
    });

    const fileNameSuffix = viewType === 'compensation' ? 'compensacao' : viewType === 'restitution' ? 'restituicao' : 'geral';
    doc.save(`relatorio_${fileNameSuffix}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleUpdateOrder = (updatedOrder: PerDcompOrder) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === updatedOrder.id ? updatedOrder : o)
    }));
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Deseja realmente excluir este registro permanentemente?')) {
      setState(prev => ({ 
        ...prev, 
        orders: prev.orders.filter(o => o.id !== id) 
      }));
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setViewType('all');
  };

  const handleBackupExport = () => {
    downloadJson(state.orders, `backup_perdcomp_${new Date().toISOString().split('T')[0]}.json`);
    setIsOptionsMenuOpen(false);
  };

  const handleBackupImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          setState(prev => ({ ...prev, orders: [...data, ...prev.orders] }));
          alert('Backup restaurado com sucesso!');
        }
      } catch (err) {
        alert('Arquivo de backup inválido.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
    setIsOptionsMenuOpen(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-50 flex flex-col">
      <header className="max-w-[1600px] w-full mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-black text-emerald-800 tracking-tight uppercase flex items-center">
            <span className="mr-3">📊</span> Fluxo PER/DCOMP
          </h1>
          <p className="text-slate-500 font-medium italic">Monitoramento de Créditos e Compensações Fiscais</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 no-print justify-end">
          <button 
            onClick={() => setShowManualForm(!showManualForm)}
            className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-xl font-bold transition-all flex items-center shadow-sm hover:bg-emerald-200 active:scale-95"
          >
            ➕ Manual
          </button>

          <label className="cursor-pointer bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl font-bold transition-all flex items-center shadow-md active:scale-95">
            📁 Importar (XLSX / XML)
            <input type="file" accept=".xlsx, .xls, .xml" onChange={handleFileUpload} className="hidden" />
          </label>
          
          <button 
            onClick={handleGeneratePdf}
            title="Gera um arquivo PDF para download direto com os dados filtrados."
            className="bg-white border-2 border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl font-bold hover:bg-emerald-50 transition-all shadow-sm flex items-center active:scale-95"
          >
            📄 Baixar PDF
          </button>

          <button 
            onClick={handleExportXlsx}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md flex items-center active:scale-95"
          >
            📗 Excel
          </button>

          <div className="relative" ref={optionsMenuRef}>
            <button 
              onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)}
              className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold hover:bg-slate-300 transition-all shadow-sm flex items-center active:scale-95"
            >
              ⚙️ Opções
            </button>
            {isOptionsMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <button 
                  onClick={handleBackupExport} 
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm border-b border-slate-100 flex items-center font-semibold text-slate-600 transition-colors"
                >
                  <span className="mr-3">📤</span> Exportar Backup (JSON)
                </button>
                <label className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm cursor-pointer border-b border-slate-100 flex items-center font-semibold text-slate-600 transition-colors">
                  <span className="mr-3">📥</span> Restaurar Backup (JSON)
                  <input type="file" accept=".json" onChange={handleBackupImport} className="hidden" />
                </label>
                <button 
                  onClick={() => {
                    if (window.confirm('Apagar todos os dados registrados localmente?')) {
                      setState(p => ({...p, orders: []}));
                      setIsOptionsMenuOpen(false);
                    }
                  }} 
                  className="w-full text-left px-4 py-3 hover:bg-rose-50 text-rose-600 font-bold text-sm flex items-center transition-colors"
                >
                  <span className="mr-3">🗑️</span> Limpar Banco Local
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Barra de Filtros e Busca */}
      <section className="max-w-[1600px] w-full mx-auto mb-6 no-print">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1 w-full">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Buscar PER/DCOMP</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30">🔍</span>
              <input 
                type="text" 
                placeholder="Nº do pedido ou banco..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="w-full md:w-44">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">De (Início)</label>
            <input 
              type="date" 
              className="w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all text-sm"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div className="w-full md:w-44">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Até (Fim)</label>
            <input 
              type="date" 
              className="w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-xl outline-none transition-all text-sm"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <button 
            onClick={resetFilters}
            className="px-4 py-2.5 text-slate-400 hover:text-rose-500 font-bold text-xs uppercase transition-colors"
          >
            Limpar
          </button>
        </div>
      </section>

      <main className="max-w-[1600px] w-full mx-auto flex-1">
        {showManualForm && (
          <div className="mb-8 bg-white p-6 rounded-2xl shadow-xl border-2 border-emerald-100 no-print animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-emerald-800 uppercase tracking-tight">Novo Lançamento Manual</h3>
              <button onClick={() => setShowManualForm(false)} className="text-slate-400 hover:text-rose-500 font-bold">FECHAR X</button>
            </div>
            <form onSubmit={handleAddManualEntry} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Número PER/DCOMP</label>
                <input 
                  type="text" 
                  required
                  placeholder="00000.00000.000000..."
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none font-bold"
                  value={manualEntry.perDcompNumber}
                  onChange={e => setManualEntry({...manualEntry, perDcompNumber: e.target.value})}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Data Transmissão</label>
                <input 
                  type="date" 
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none"
                  value={manualEntry.transmissionDate}
                  onChange={e => setManualEntry({...manualEntry, transmissionDate: e.target.value})}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Tipo de Crédito</label>
                <input 
                  type="text" 
                  placeholder="IPI, PIS, COFINS..."
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none"
                  value={manualEntry.creditType}
                  onChange={e => setManualEntry({...manualEntry, creditType: e.target.value})}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Tipo de Documento</label>
                <select 
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none"
                  value={manualEntry.documentType}
                  onChange={e => setManualEntry({...manualEntry, documentType: e.target.value})}
                >
                  <option value="">Selecione...</option>
                  <option value="Pedido de Ressarcimento">Pedido de Ressarcimento</option>
                  <option value="Declaração de Compensação">Declaração de Compensação</option>
                  <option value="Pedido de Restituição">Pedido de Restituição</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Situação</label>
                <select 
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none"
                  value={manualEntry.status}
                  onChange={e => setManualEntry({...manualEntry, status: e.target.value})}
                >
                  <option value="Em análise">Em análise</option>
                  <option value="Deferido">Deferido</option>
                  <option value="Indeferido">Indeferido</option>
                  <option value="Cancelado">Cancelado</option>
                  <option value="Em Processamento">Em Processamento</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Valor R$</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none font-bold text-emerald-800"
                  value={manualEntry.value}
                  onChange={e => setManualEntry({...manualEntry, value: Number(e.target.value)})}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Banco</label>
                <input 
                  type="text" 
                  placeholder="Nome do Banco"
                  className="p-2 border rounded-lg focus:border-emerald-500 outline-none"
                  value={manualEntry.bank}
                  onChange={e => setManualEntry({...manualEntry, bank: e.target.value})}
                />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full bg-emerald-800 text-white font-black p-2 rounded-lg hover:bg-emerald-900 transition-colors uppercase tracking-widest text-xs">
                  Confirmar Cadastro
                </button>
              </div>
            </form>
          </div>
        )}

        {state.isProcessing && (
          <div className="mb-6 p-4 bg-emerald-600 text-white rounded-xl flex items-center shadow-lg animate-pulse no-print">
            <div className="mr-3 h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Processando arquivos com IA...
          </div>
        )}

        {state.error && (
          <div className="mb-6 p-4 bg-rose-100 border-2 border-rose-200 text-rose-700 rounded-xl font-bold flex items-center no-print">
            ⚠️ {state.error}
          </div>
        )}

        <div className="print-content">
          <StatsCards orders={filteredOrders} />
          
          {/* Seletor de Abas de Relatório */}
          <div className="mb-6 no-print">
            <div className="flex flex-wrap gap-2 border-b border-slate-200">
              <button 
                onClick={() => setViewType('all')}
                className={`px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 ${viewType === 'all' ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                📑 Visão Geral
              </button>
              <button 
                onClick={() => setViewType('compensation')}
                className={`px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 ${viewType === 'compensation' ? 'border-indigo-600 text-indigo-800 bg-indigo-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                ⚖️ Compensações (DCOMP)
              </button>
              <button 
                onClick={() => setViewType('restitution')}
                className={`px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 ${viewType === 'restitution' ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                💰 Restituições / Ressarcimentos
              </button>
            </div>
          </div>

          <div className="flex justify-between items-end mb-4 px-2">
            <div className="border-l-4 border-emerald-500 pl-4">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {viewType === 'all' ? 'Detalhamento Geral' : viewType === 'compensation' ? 'Relatório de Compensações' : 'Controle de Restituições'}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Relatório Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
              {(startDate || endDate || searchTerm) && (
                <p className="text-[9px] text-emerald-600 font-black uppercase mt-1 no-print">
                  Filtros ativos: {startDate && `De ${startDate}`} {endDate && `Até ${endDate}`} {searchTerm && `Busca: "${searchTerm}"`}
                </p>
              )}
            </div>
            <div className="no-print flex items-center gap-4">
               <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exibir</label>
                  <select 
                    className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded outline-none cursor-pointer border-none"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
               </div>
               <div className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-widest">
                {filteredOrders.length} Resultados
              </div>
            </div>
          </div>

          {/* Versão para Tela - Visível apenas no navegador, mostra dados paginados */}
          <div className="print:hidden">
            <OrderTable 
              orders={paginatedOrders} 
              onDelete={handleDelete} 
              onUpdate={handleUpdateOrder}
            />

            {/* Controles de Paginação */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2 no-print">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                >
                  Anterior
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    if (
                      page === 1 || 
                      page === totalPages || 
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-10 h-10 rounded-xl font-black text-xs transition-all ${
                            currentPage === page 
                              ? 'bg-emerald-700 text-white shadow-lg' 
                              : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return <span key={page} className="text-slate-300 px-1 font-bold">...</span>;
                    }
                    return null;
                  })}
                </div>

                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-4 py-2 rounded-xl font-bold text-xs uppercase transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                >
                  Próximo
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-[1600px] w-full mx-auto mt-12 py-8 border-t border-slate-200 text-center text-slate-400 text-[10px] no-print font-black uppercase tracking-[0.3em]">
        Gestão PER/DCOMP • Controle Independente v5.9
      </footer>
    </div>
  );
};

export default App;
