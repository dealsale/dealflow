import type { DealFlowState } from '../../hooks/useDealFlowState';
import { Leads } from '../Leads';

/** En celular, el mismo tablero de estados (las columnas se deslizan de lado). */
export function MLeads({ df }: { df: DealFlowState }) {
  return <Leads df={df} />;
}
