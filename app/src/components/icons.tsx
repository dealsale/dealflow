const common = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
} as const;

export function IconResumen() {
  return (
    <svg {...common}>
      <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
      <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
      <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
      <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
    </svg>
  );
}

export function IconProductos() {
  return (
    <svg {...common}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"></path>
      <circle cx="7.5" cy="7.5" r="1.2"></circle>
    </svg>
  );
}

export function IconPromos() {
  return (
    <svg {...common}>
      <line x1="19" y1="5" x2="5" y2="19"></line>
      <circle cx="6.5" cy="6.5" r="2"></circle>
      <circle cx="17.5" cy="17.5" r="2"></circle>
    </svg>
  );
}

export function IconAsistente() {
  return (
    <svg {...common}>
      <rect x="4" y="7" width="16" height="11" rx="3"></rect>
      <circle cx="9.5" cy="12.5" r="1"></circle>
      <circle cx="14.5" cy="12.5" r="1"></circle>
      <line x1="12" y1="7" x2="12" y2="4"></line>
      <circle cx="12" cy="3.2" r="0.9"></circle>
    </svg>
  );
}

export function IconWhatsApp() {
  return (
    <svg {...common}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5Z"></path>
    </svg>
  );
}

export function IconPedidos() {
  return (
    <svg {...common}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"></path>
      <path d="M3 8l9 5 9-5"></path>
      <line x1="12" y1="13" x2="12" y2="21"></line>
    </svg>
  );
}

export function IconLeads() {
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3.2"></circle>
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path>
      <path d="M16 5a3.2 3.2 0 0 1 0 6.2M17.5 14.5a5.5 5.5 0 0 1 3 4.5"></path>
    </svg>
  );
}

export function IconCRM() {
  return (
    <svg {...common}>
      <path d="M4 13a8 8 0 0 1 16 0"></path>
      <rect x="2.5" y="13" width="4" height="6" rx="1.5"></rect>
      <rect x="17.5" y="13" width="4" height="6" rx="1.5"></rect>
    </svg>
  );
}

export function IconIntegraciones() {
  return (
    <svg {...common}>
      <path d="M9 3v4M15 3v4M7 7h10v5a5 5 0 0 1-10 0V7Z"></path>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
  );
}

export function IconVentas() {
  return (
    <svg {...common}>
      <line x1="5" y1="20" x2="5" y2="12"></line>
      <line x1="12" y1="20" x2="12" y2="6"></line>
      <line x1="19" y1="20" x2="19" y2="10"></line>
    </svg>
  );
}

export function IconPlanes() {
  return (
    <svg {...common}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z"></path>
      <path d="M3 13l9 5 9-5"></path>
    </svg>
  );
}

export function IconCuentas() {
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.2"></circle>
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0"></path>
    </svg>
  );
}

export function IconBell({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z"></path>
      <path d="M13.7 21a2 2 0 0 1-3.4 0"></path>
      {muted && <line x1="3" y1="3" x2="21" y2="21"></line>}
    </svg>
  );
}

export function IconToggleMode() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M7 16V8m0 8-3-3m3 3 3-3M17 8v8m0-8-3 3m3-3 3 3"></path>
    </svg>
  );
}
