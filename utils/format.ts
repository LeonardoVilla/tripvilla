export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatCurrency(value?: number): string {
  const n = value ?? 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}
