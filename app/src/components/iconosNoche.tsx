/* Íconos de línea del rediseño (los mismos trazos del artifact "Rediseño del panel"). */
import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const IcoResumen = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
export const IcoEstadisticas = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-6M22 20H2" /></svg>;
export const IcoProductos = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>;
export const IcoTienda = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6" /></svg>;
export const IcoAsistente = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
export const IcoWhatsApp = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>;
export const IcoLogistica = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
export const IcoPedidos = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" /></svg>;
export const IcoLeads = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>;
export const IcoInbox = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 13h5l2 3h4l2-3h5M3 13l2-8h14l2 8v7H3z" /></svg>;
export const IcoBiblioteca = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" /></svg>;
export const IcoDealShop = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 8h14l-1 13H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2" /></svg>;
export const IcoMarketing = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 10v4h3l8 5V5l-8 5H3ZM18 9a4 4 0 0 1 0 6" /></svg>;
export const IcoEquipo = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="10" cy="8" r="3.5" /><path d="M3 20a7 7 0 0 1 14 0M19 8v6M16 11h6" /></svg>;
export const IcoIntegraciones = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v3" /></svg>;
export const IcoMenu = (p: SVGProps<SVGSVGElement>) => <svg {...base({ strokeWidth: 2, ...p })}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IcoCampana = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2ZM10 20a2 2 0 0 0 4 0" /></svg>;
export const IcoBuscar = (p: SVGProps<SVGSVGElement>) => <svg {...base({ strokeWidth: 2, ...p })}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IcoChevron = (p: SVGProps<SVGSVGElement>) => <svg {...base({ strokeWidth: 2, width: 14, height: 14, ...p })}><path d="m6 9 6 6 6-6" /></svg>;
export const IcoAdjuntar = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></svg>;
export const IcoRayo = (p: SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;
export const IcoMic = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const IcoFoco = (p: SVGProps<SVGSVGElement>) => <svg {...base({ strokeWidth: 2, ...p })}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" /></svg>;
export const IcoTutoriales = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 9l9-5 9 5-9 5-9-5Z" /><path d="M7 11.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5M21 9v5" /></svg>;
