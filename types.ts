
export interface PerDcompOrder {
  id: string;
  perDcompNumber: string;
  transmissionDate: string;
  creditType: string;
  documentType: string;
  status: string;
  value: number;
  importedAt: string;
  isPaid: boolean;
  bank?: string;
}

export interface AppState {
  orders: PerDcompOrder[];
  isProcessing: boolean;
  error: string | null;
}
