import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ACCOUNTS,
  ASSISTANT_TEXT_DEFAULT,
  INTEGRATIONS,
  LEADS,
  ORDERS,
  PLANS,
  PROMOS,
  PRODUCTS,
  RULES_DEFAULT,
  WA_CODE,
  WEBHOOK_URL,
} from '../data';
import { readImagesAsDataUrls } from '../components/PhotoUpload';
import { fmt } from '../lib/format';
import { clearSnapshot, loadSnapshot, saveSnapshot } from '../lib/persist';
import { playOrderChime } from '../lib/sound';
import { AVATAR_COLORS, ESTADOS, ESTADO_ORDER, ETAPA_CFG, initials, pill, stockPillCfg, swatch } from '../lib/style';
import type {
  Account,
  AdminSection,
  Integration,
  Lead,
  Mensaje,
  Mode,
  Order,
  OrderItem,
  Plan,
  Product,
  Promo,
  VendedorSection,
} from '../types';

export interface DecoratedOrder extends Order {
  totalFmt: string;
  envioFmt: string;
  itemsResumen: string;
  itemsDecorated: (OrderItem & { precioFmt: string })[];
  pillStyle: CSSProperties;
  hasNext: boolean;
  isDone: boolean;
  advanceLabel: string;
  hasNota: boolean;
  hasGuia: boolean;
  advance: () => void;
  open: () => void;
  sendToDropi: () => void;
  timeline: { estado: string; dotStyle: CSSProperties; labelStyle: CSSProperties }[];
}

export interface DecoratedMensaje extends Mensaje {
  rowStyle: CSSProperties;
  bubbleStyle: CSSProperties;
  horaStyle: CSSProperties;
}

export interface DecoratedLead extends Lead {
  iniciales: string;
  avatarStyle: CSSProperties;
  etapaStyle: CSSProperties;
  rowStyle: CSSProperties;
  select: () => void;
  mensajesDecorated: DecoratedMensaje[];
}

export interface DecoratedCrmChat extends DecoratedLead {
  live: boolean;
  liveLabel: string;
  liveStyle: CSSProperties;
  liveDot: CSSProperties;
  crmRowStyle: CSSProperties;
}

export interface DecoratedVariante {
  label: string;
  swatchStyle: CSSProperties;
  labelStyle: CSSProperties;
  stockPill: CSSProperties;
  stockLabel: string;
  fotosLabel: string;
  thumbs: CSSProperties[];
  uploaded: string[];
  addFotos: (files: File[]) => void;
  removeFoto: (index: number) => void;
  stock: number;
  incStock: () => void;
  decStock: () => void;
}

export interface DecoratedProduct extends Product {
  iniciales: string;
  fotoStyle: CSSProperties;
  precioFmt: string;
  variantesLabel: string;
  stockLabel: string;
  stockPill: CSSProperties;
  expanded: boolean;
  chevron: string;
  toggle: () => void;
  fotosMain: { label: string; tileStyle: CSSProperties }[];
  uploadedMain: string[];
  addMainFotos: (files: File[]) => void;
  removeMainFoto: (index: number) => void;
  reglasDecoradas: { texto: string; remove: () => void }[];
  addRegla: () => void;
  save: () => void;
  saved: boolean;
  addVariante: () => void;
  requestDelete: () => void;
  deleteArmed: boolean;
  setNombre: (v: string) => void;
  setPrecio: (v: string) => void;
  variantesDecorated: DecoratedVariante[];
}

export interface DecoratedPromo extends Promo {
  badgeStyle: CSSProperties;
  estadoLabel: string;
  estadoStyle: CSSProperties;
  toggle: () => void;
  requestDelete: () => void;
  deleteArmed: boolean;
}

export interface DecoratedIntegration extends Integration {
  logoStyle: CSSProperties;
  badgeLabel: string;
  badgeStyle: CSSProperties;
  btnLabel: string;
  btnStyle: CSSProperties;
  action: () => void;
}

export interface DecoratedPlan extends Plan {
  precioFmt: string;
  cuentasLabel: string;
}

export interface DecoratedAccount extends Account {
  ventasFmt: string;
  estadoLabel: string;
  estadoStyle: CSSProperties;
  switchStyle: CSSProperties;
  knobStyle: CSSProperties;
  toggle: () => void;
}

export interface OrderFilterOption {
  key: string;
  label: string;
  set: () => void;
  style: CSSProperties;
}

const CLIENTES_ENTRANTES = [
  { cliente: 'Camila Duarte', ciudad: 'Bogotá', tel: '+57 312 884 2210', direccion: 'Cl 63 # 11-24, apto 501' },
  { cliente: 'Andrés Felipe Gil', ciudad: 'Medellín', tel: '+57 300 218 7743', direccion: 'Cra 43A # 1-50, Torre 1' },
  { cliente: 'Luisa Cárdenas', ciudad: 'Cali', tel: '+57 316 405 9912', direccion: 'Cl 5 # 38-25' },
  { cliente: 'Óscar Peña', ciudad: 'Cartagena', tel: '+57 311 720 5568', direccion: 'Cl 30 # 8B-15' },
  { cliente: 'Natalia Reyes', ciudad: 'Pereira', tel: '+57 313 662 4471', direccion: 'Cra 7 # 21-33' },
  { cliente: 'Felipe Osorio', ciudad: 'Bucaramanga', tel: '+57 315 908 3324', direccion: 'Cl 45 # 27-10' },
];

function generateIncomingOrder(orders: Order[], products: Product[]): Order {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const c = pick(CLIENTES_ENTRANTES);
  const disponibles = products.filter((p) => p.stock > 0);
  const base = disponibles.length ? disponibles : [{ nombre: 'Camiseta oversize algodón', precio: 59900 } as Product];
  const n = Math.random() < 0.35 ? 2 : 1;
  const items: OrderItem[] = [];
  for (let i = 0; i < n; i++) {
    const p = pick(base);
    if (items.some((it) => it.nombre === p.nombre)) continue;
    items.push({ qty: Math.random() < 0.3 ? 2 : 1, nombre: p.nombre, precio: p.precio });
  }
  const maxNum = orders.reduce((m, o) => Math.max(m, parseInt(o.id.replace(/\D/g, ''), 10) || 0), 1000);
  return {
    id: 'DF-' + (maxNum + 1),
    cliente: c.cliente,
    ciudad: c.ciudad,
    tel: c.tel,
    direccion: c.direccion,
    estado: 'Nuevo',
    hora: 'ahora',
    transportadora: 'Dropi',
    envio: pick([9900, 12000, 14000]),
    nota: Math.random() < 0.3 ? 'Pagó por Nequi. Comprobante recibido.' : '',
    items,
  };
}

function navStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 11px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13.5px',
    fontWeight: active ? 600 : 500,
    color: active ? '#fff' : '#94A3B8',
    background: active ? 'rgba(5,150,105,.32)' : 'transparent',
  };
}

export function useDealFlowState() {
  const [snap] = useState(loadSnapshot);
  const [mode, setMode] = useState<Mode>('vendedor');
  const [section, setSection] = useState<VendedorSection>('resumen');
  const [adminSection, setAdminSection] = useState<AdminSection>('ventas');
  const [filter, setFilter] = useState<string>('Todos');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(7);
  const [selectedLeadId, setSelectedLeadId] = useState<number>(1);
  const [crmSelectedId, setCrmSelectedId] = useState<number>(1);
  const [crmIntervening, setCrmIntervening] = useState<boolean>(false);
  const [crmDraft, setCrmDraft] = useState<string>('');
  const [copied, setCopied] = useState<'webhook' | 'code' | 'guia' | null>(null);
  const [flowMsg, setFlowMsg] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<string>('');
  const [assistantSaved, setAssistantSaved] = useState<boolean>(false);
  const [flowSel, setFlowSel] = useState<string>('Recuperar carrito');
  const [planNombre, setPlanNombre] = useState<string>('');
  const [planPrecio, setPlanPrecio] = useState<string>('');
  const [planDesc, setPlanDesc] = useState<string>('');
  const [planError, setPlanError] = useState<boolean>(false);
  const [waConnected, setWaConnected] = useState<boolean>(snap?.waConnected ?? true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [mobileChatOpen, setMobileChatOpen] = useState<boolean>(false);
  const [assistantText, setAssistantText] = useState<string>(snap?.assistantText ?? ASSISTANT_TEXT_DEFAULT);
  const [rules, setRules] = useState<string[]>(snap?.rules ?? RULES_DEFAULT);
  const [orders, setOrders] = useState<Order[]>(snap?.orders ?? ORDERS);
  const [products, setProducts] = useState<Product[]>(snap?.products ?? PRODUCTS);
  const [productRuleDraft, setProductRuleDraft] = useState<string>('');
  const [newProductOpen, setNewProductOpen] = useState<boolean>(false);
  const [newProdNombre, setNewProdNombre] = useState<string>('');
  const [newProdPrecio, setNewProdPrecio] = useState<string>('');
  const [newProdStock, setNewProdStock] = useState<string>('');
  const [newProdError, setNewProdError] = useState<boolean>(false);
  const [variantFormOpen, setVariantFormOpen] = useState<boolean>(false);
  const [variantLabel, setVariantLabel] = useState<string>('');
  const [variantStock, setVariantStock] = useState<string>('');
  const [savedProductId, setSavedProductId] = useState<number | null>(null);
  const [newPromoOpen, setNewPromoOpen] = useState<boolean>(false);
  const [promoTipo, setPromoTipo] = useState<'Promoción' | 'Combo'>('Promoción');
  const [promoTitulo, setPromoTitulo] = useState<string>('');
  const [promoDesc, setPromoDesc] = useState<string>('');
  const [promoVigencia, setPromoVigencia] = useState<string>('');
  const [promoError, setPromoError] = useState<boolean>(false);
  const [promos, setPromos] = useState<Promo[]>(snap?.promos ?? PROMOS);
  const [leads, setLeads] = useState<Lead[]>(snap?.leads ?? LEADS);
  const [integrations] = useState<Integration[]>(INTEGRATIONS);
  const [plans, setPlans] = useState<Plan[]>(snap?.plans ?? PLANS);
  const [accounts, setAccounts] = useState<Account[]>(snap?.accounts ?? ACCOUNTS);
  const [armedDeleteProductId, setArmedDeleteProductId] = useState<number | null>(null);
  const [armedDeletePromoId, setArmedDeletePromoId] = useState<number | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<Order | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(snap?.soundOn ?? true);
  const [orderQuery, setOrderQuery] = useState<string>('');

  // Guarda los datos de la demo en el navegador: los cambios sobreviven al refrescar.
  useEffect(() => {
    saveSnapshot({ orders, products, promos, leads, rules, assistantText, plans, accounts, waConnected, soundOn });
  }, [orders, products, promos, leads, rules, assistantText, plans, accounts, waConnected, soundOn]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const assistantTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedProductTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armedDeleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const productsRef = useRef(products);
  productsRef.current = products;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Simula la llegada de pedidos desde el asistente de WhatsApp: el primero
  // entra a los ~15 s y luego cada 35–70 s, con notificación y timbre.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const arrive = () => {
      if (cancelled) return;
      const nuevo = generateIncomingOrder(ordersRef.current, productsRef.current);
      setOrders((st) => [nuevo, ...st]);
      setIncomingOrder(nuevo);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setIncomingOrder(null), 8000);
      if (soundOnRef.current) playOrderChime();
      timer = setTimeout(arrive, 35000 + Math.random() * 35000);
    };
    timer = setTimeout(arrive, 15000 + Math.random() * 10000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(toastTimer.current);
    };
  }, []);

  const isAdmin = mode === 'admin';

  function go(id: VendedorSection) {
    setMode('vendedor');
    setSection(id);
    setSelectedOrderId(null);
    setMenuOpen(false);
  }

  function goAdmin(id: AdminSection) {
    setMode('admin');
    setAdminSection(id);
    setSelectedOrderId(null);
    setMenuOpen(false);
  }

  function toggleMode() {
    if (isAdmin) {
      setMode('vendedor');
      setSection('resumen');
    } else {
      setMode('admin');
      setAdminSection('ventas');
    }
    setSelectedOrderId(null);
  }

  function advanceOrder(id: string) {
    setOrders((prev) =>
      prev.map((o) => {
        const next = ESTADOS[o.estado].nextEstado;
        return o.id === id && next ? { ...o, estado: next } : o;
      }),
    );
  }

  function sendToDropi(id: string) {
    const guia = String(402000 + Math.floor(Math.random() * 900) + 100);
    setOrders((prev) => prev.map((o) => (o.id === id && !o.guia ? { ...o, guia } : o)));
  }

  function decorateOrder(o: Order): DecoratedOrder {
    const cfg = ESTADOS[o.estado];
    const total = o.items.reduce((a, it) => a + it.qty * it.precio, 0) + o.envio;
    return {
      ...o,
      totalFmt: fmt(total),
      envioFmt: fmt(o.envio),
      itemsResumen: o.items.map((it) => it.qty + '× ' + it.nombre).join(' · '),
      itemsDecorated: o.items.map((it) => ({ ...it, precioFmt: fmt(it.qty * it.precio) })),
      pillStyle: pill(cfg),
      hasNext: !!cfg.next,
      isDone: !cfg.next,
      advanceLabel: cfg.next || '',
      hasNota: !!o.nota,
      hasGuia: !!o.guia,
      advance: () => advanceOrder(o.id),
      open: () => {
        setSelectedOrderId(o.id);
        setSection('pedidos');
      },
      sendToDropi: () => sendToDropi(o.id),
      timeline: ESTADO_ORDER.map((est) => {
        const done = ESTADO_ORDER.indexOf(est) <= ESTADO_ORDER.indexOf(o.estado);
        return {
          estado: est,
          dotStyle: { width: '10px', height: '10px', borderRadius: '50%', background: done ? ESTADOS[est].color : '#E2E8F0', flexShrink: 0 },
          labelStyle: { fontSize: '13px', fontWeight: done ? 600 : 400, color: done ? '#1E293B' : '#94A3B8' },
        };
      }),
    };
  }

  function copy(key: 'webhook' | 'code' | 'guia', text: string) {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(key);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  }

  function decorateMensaje(m: Mensaje): DecoratedMensaje {
    return {
      ...m,
      rowStyle: { display: 'flex', justifyContent: m.de === 'cliente' ? 'flex-start' : 'flex-end' },
      bubbleStyle: {
        maxWidth: '78%',
        padding: '9px 12px',
        borderRadius: m.de === 'cliente' ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
        background: m.de === 'cliente' ? '#fff' : m.de === 'vendedor' ? '#059669' : '#D1FAE5',
        color: m.de === 'vendedor' ? '#fff' : '#1E293B',
        border: m.de === 'vendedor' ? 'none' : '1px solid ' + (m.de === 'cliente' ? '#E2E8F0' : '#A7F3D0'),
        fontSize: '13px',
        lineHeight: 1.5,
      },
      horaStyle: {
        display: 'block',
        fontSize: '10.5px',
        color: m.de === 'vendedor' ? 'rgba(255,255,255,.75)' : '#94A3B8',
        marginTop: '3px',
        textAlign: 'right',
      },
    };
  }

  function decorateLead(l: Lead, i: number, selectedId: number, onSelect: (id: number) => void): DecoratedLead {
    const [bg, txt] = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const selL = l.id === selectedId;
    return {
      ...l,
      iniciales: initials(l.nombre),
      avatarStyle: { width: '38px', height: '38px', borderRadius: '50%', background: bg, color: txt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 },
      etapaStyle: { ...pill(ETAPA_CFG[l.etapa]), marginTop: '5px', fontSize: '11px' },
      rowStyle: { display: 'flex', gap: '11px', padding: '12px 14px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selL ? '#ECFDF5' : '#fff', borderLeft: selL ? '3px solid #059669' : '3px solid transparent' },
      select: () => onSelect(l.id),
      mensajesDecorated: l.mensajes.map(decorateMensaje),
    };
  }

  const leadsDecorated = useMemo(
    () => leads.map((l, i) => decorateLead(l, i, selectedLeadId, (id) => { setSelectedLeadId(id); setFlowMsg(null); })),
    [leads, selectedLeadId],
  );
  const lead = leadsDecorated.find((l) => l.id === selectedLeadId) || null;

  const crmChats: DecoratedCrmChat[] = useMemo(
    () =>
      leads.map((l, i) => {
        const d = decorateLead(l, i, crmSelectedId, (id) => { setCrmSelectedId(id); setCrmIntervening(false); });
        const live = l.id === 1 || l.id === 2;
        const selC = l.id === crmSelectedId;
        return {
          ...d,
          live,
          liveLabel: live ? 'En vivo' : 'Esperando',
          liveStyle: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: live ? '#047857' : '#94A3B8', marginTop: '5px' },
          liveDot: { width: '7px', height: '7px', borderRadius: '50%', background: live ? '#10B981' : '#CBD5E1', animation: live ? 'dfpulse 1.8s infinite' : 'none', flexShrink: 0 },
          crmRowStyle: { display: 'flex', gap: '11px', padding: '12px 14px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selC ? '#ECFDF5' : '#fff', borderLeft: selC ? '3px solid #059669' : '3px solid transparent' },
        };
      }),
    [leads, crmSelectedId],
  );
  const crmChat = crmChats.find((c) => c.id === crmSelectedId) || null;

  function crearProducto() {
    const nombre = newProdNombre.trim();
    const precio = parseInt(newProdPrecio, 10);
    const stock = parseInt(newProdStock, 10) || 0;
    if (!nombre || !precio) {
      setNewProdError(true);
      return;
    }
    const [bg, txt] = AVATAR_COLORS[products.length % AVATAR_COLORS.length];
    const id = Date.now();
    setProducts((st) => [{ id, nombre, precio, stock, color: bg, txt, reglas: [], variantes: [{ label: 'Única', stock, fotos: 0 }] }, ...st]);
    setExpandedProductId(id);
    setNewProdNombre('');
    setNewProdPrecio('');
    setNewProdStock('');
    setNewProdError(false);
    setNewProductOpen(false);
  }

  function addVariante(productId: number) {
    const label = variantLabel.trim();
    const stock = parseInt(variantStock, 10) || 0;
    if (!label) return;
    setProducts((st) =>
      st.map((p) =>
        p.id === productId
          ? { ...p, variantes: [...p.variantes, { label, stock, fotos: 0 }], stock: p.variantes.reduce((a, v) => a + v.stock, 0) + stock }
          : p,
      ),
    );
    setVariantLabel('');
    setVariantStock('');
    setVariantFormOpen(false);
  }

  function updateProduct(id: number, patch: Partial<Product>) {
    setProducts((st) => st.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function changeVariantStock(productId: number, variantIndex: number, delta: number) {
    setProducts((st) =>
      st.map((p) => {
        if (p.id !== productId) return p;
        const variantes = p.variantes.map((v, i) => (i === variantIndex ? { ...v, stock: Math.max(0, v.stock + delta) } : v));
        return { ...p, variantes, stock: variantes.reduce((a, v) => a + v.stock, 0) };
      }),
    );
  }

  function saveProduct(id: number) {
    setSavedProductId(id);
    clearTimeout(savedProductTimer.current);
    savedProductTimer.current = setTimeout(() => setSavedProductId(null), 2500);
  }

  function armDelete(kind: 'product' | 'promo', id: number) {
    if (kind === 'product') setArmedDeleteProductId(id);
    else setArmedDeletePromoId(id);
    clearTimeout(armedDeleteTimer.current);
    armedDeleteTimer.current = setTimeout(() => {
      setArmedDeleteProductId(null);
      setArmedDeletePromoId(null);
    }, 3500);
  }

  function deleteProduct(id: number) {
    if (armedDeleteProductId !== id) {
      armDelete('product', id);
      return;
    }
    setProducts((st) => st.filter((p) => p.id !== id));
    setExpandedProductId((cur) => (cur === id ? null : cur));
    setArmedDeleteProductId(null);
  }

  function deletePromo(id: number) {
    if (armedDeletePromoId !== id) {
      armDelete('promo', id);
      return;
    }
    setPromos((st) => st.filter((p) => p.id !== id));
    setArmedDeletePromoId(null);
  }

  function resetDemo() {
    clearSnapshot();
    window.location.reload();
  }

  function crearPromo() {
    const titulo = promoTitulo.trim();
    const desc = promoDesc.trim();
    if (!titulo || !desc) {
      setPromoError(true);
      return;
    }
    setPromos((st) => [{ id: Date.now(), tipo: promoTipo, titulo, desc, vigencia: promoVigencia.trim() || 'Sin fecha de vencimiento', activa: true }, ...st]);
    setPromoTitulo('');
    setPromoDesc('');
    setPromoVigencia('');
    setPromoTipo('Promoción');
    setPromoError(false);
    setNewPromoOpen(false);
  }

  async function addMainPhotos(productId: number, files: File[]) {
    const urls = await readImagesAsDataUrls(files);
    if (!urls.length) return;
    setProducts((st) => st.map((p) => (p.id === productId ? { ...p, fotosSubidas: [...(p.fotosSubidas || []), ...urls] } : p)));
  }

  function removeMainPhoto(productId: number, index: number) {
    setProducts((st) => st.map((p) => (p.id === productId ? { ...p, fotosSubidas: (p.fotosSubidas || []).filter((_, i) => i !== index) } : p)));
  }

  async function addVariantPhotos(productId: number, variantIndex: number, files: File[]) {
    const urls = await readImagesAsDataUrls(files);
    if (!urls.length) return;
    setProducts((st) =>
      st.map((p) =>
        p.id === productId
          ? { ...p, variantes: p.variantes.map((v, i) => (i === variantIndex ? { ...v, fotosSubidas: [...(v.fotosSubidas || []), ...urls] } : v)) }
          : p,
      ),
    );
  }

  function removeVariantPhoto(productId: number, variantIndex: number, index: number) {
    setProducts((st) =>
      st.map((p) =>
        p.id === productId
          ? { ...p, variantes: p.variantes.map((v, i) => (i === variantIndex ? { ...v, fotosSubidas: (v.fotosSubidas || []).filter((_, j) => j !== index) } : v)) }
          : p,
      ),
    );
  }

  const productsDecorated: DecoratedProduct[] = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        iniciales: initials(p.nombre).toUpperCase(),
        fotoStyle: { width: '44px', height: '44px', borderRadius: '10px', background: p.color, color: p.txt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' },
        precioFmt: fmt(p.precio),
        variantesLabel: p.variantes.length + (p.variantes.length === 1 ? ' variante' : ' variantes'),
        stockLabel: p.stock === 0 ? 'Agotado' : p.stock <= 5 ? 'Quedan ' + p.stock : p.stock + ' en stock',
        stockPill: pill(stockPillCfg(p.stock)),
        expanded: expandedProductId === p.id,
        chevron: expandedProductId === p.id ? '▲' : '▼',
        toggle: () => {
          setExpandedProductId((cur) => (cur === p.id ? null : p.id));
          setProductRuleDraft('');
          setVariantFormOpen(false);
          setVariantLabel('');
          setVariantStock('');
        },
        save: () => saveProduct(p.id),
        saved: savedProductId === p.id,
        addVariante: () => addVariante(p.id),
        requestDelete: () => deleteProduct(p.id),
        deleteArmed: armedDeleteProductId === p.id,
        setNombre: (v: string) => updateProduct(p.id, { nombre: v }),
        setPrecio: (v: string) => updateProduct(p.id, { precio: parseInt(v.replace(/[^0-9]/g, ''), 10) || 0 }),
        fotosMain: (p.fotos || ['Principal', 'Detalle']).map((fl) => ({
          label: fl,
          tileStyle: { width: '64px', height: '64px', borderRadius: '10px', background: p.color, color: p.txt, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: '10px', fontWeight: 600, paddingBottom: '5px', boxSizing: 'border-box' },
        })),
        uploadedMain: p.fotosSubidas || [],
        addMainFotos: (files: File[]) => void addMainPhotos(p.id, files),
        removeMainFoto: (index: number) => removeMainPhoto(p.id, index),
        reglasDecoradas: p.reglas.map((texto, i) => ({
          texto,
          remove: () => setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, reglas: x.reglas.filter((_, j) => j !== i) } : x))),
        })),
        addRegla: () => {
          const t = productRuleDraft.trim();
          if (!t) return;
          setProducts((st) => st.map((x) => (x.id === p.id ? { ...x, reglas: [...x.reglas, t] } : x)));
          setProductRuleDraft('');
        },
        variantesDecorated: p.variantes.map((v, vIndex) => {
          const nf = v.fotos == null ? 2 : v.fotos;
          const uploaded = v.fotosSubidas || [];
          const total = nf + uploaded.length;
          const sw = swatch(v.label, p.txt);
          return {
            label: v.label,
            swatchStyle: { width: '16px', height: '16px', borderRadius: '5px', background: sw, border: '1px solid rgba(15,23,42,.12)', flexShrink: 0 },
            labelStyle: { fontSize: '13px', fontWeight: 600, minWidth: '110px', color: v.stock === 0 ? '#94A3B8' : '#1E293B', textDecoration: v.stock === 0 ? 'line-through' : 'none' },
            stockPill: pill(stockPillCfg(v.stock)),
            stockLabel: v.stock === 0 ? 'Agotado' : v.stock + ' en stock',
            fotosLabel: total + (total === 1 ? ' foto' : ' fotos'),
            thumbs: Array.from({ length: Math.min(nf, 3) }, (_, k) => ({ width: '22px', height: '22px', borderRadius: '5px', background: sw, opacity: 1 - k * 0.28, border: '1px solid rgba(15,23,42,.1)' })),
            uploaded,
            addFotos: (files: File[]) => void addVariantPhotos(p.id, vIndex, files),
            removeFoto: (index: number) => removeVariantPhoto(p.id, vIndex, index),
            stock: v.stock,
            incStock: () => changeVariantStock(p.id, vIndex, 1),
            decStock: () => changeVariantStock(p.id, vIndex, -1),
          };
        }),
      })),
    [products, expandedProductId, productRuleDraft, savedProductId, variantLabel, variantStock, armedDeleteProductId],
  );

  const promosDecorated: DecoratedPromo[] = useMemo(
    () =>
      promos.map((pr) => ({
        ...pr,
        badgeStyle: pill(pr.tipo === 'Combo' ? { color: '#B45309', bg: '#FEF3C7' } : { color: '#047857', bg: '#D1FAE5' }),
        estadoLabel: pr.activa ? 'Activa' : 'Pausada',
        estadoStyle: { ...pill(pr.activa ? { color: '#047857', bg: '#D1FAE5' } : { color: '#64748B', bg: '#F1F5F9' }), cursor: 'pointer' },
        toggle: () => setPromos((st) => st.map((x) => (x.id === pr.id ? { ...x, activa: !x.activa } : x))),
        requestDelete: () => deletePromo(pr.id),
        deleteArmed: armedDeletePromoId === pr.id,
      })),
    [promos, armedDeletePromoId],
  );

  const rulesDecorated = useMemo(
    () => rules.map((texto, i) => ({ texto, remove: () => setRules((st) => st.filter((_, j) => j !== i)) })),
    [rules],
  );

  const integrationsDecorated: DecoratedIntegration[] = useMemo(
    () =>
      integrations.map((i) => {
        const conectado = i.estado === 'conectado';
        const pronto = i.estado === 'pronto';
        return {
          ...i,
          logoStyle: { width: '38px', height: '38px', borderRadius: '10px', background: i.logoBg, color: i.logoTxt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' },
          badgeLabel: conectado ? 'Conectado' : pronto ? 'Próximamente' : 'Disponible',
          badgeStyle: pill(conectado ? { color: '#047857', bg: '#D1FAE5' } : { color: '#64748B', bg: '#F1F5F9' }),
          btnLabel: conectado ? 'Configurar' : pronto ? 'Avisarme cuando esté' : 'Conectar',
          btnStyle: pronto
            ? { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }
            : conectado
              ? { background: '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }
              : { background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: '13px', cursor: 'pointer' },
          action: () => {},
        };
      }),
    [integrations],
  );

  const plansDecorated: DecoratedPlan[] = useMemo(
    () => plans.map((pl) => ({ ...pl, precioFmt: fmt(pl.precio), cuentasLabel: pl.cuentas + ' cuentas en este plan' })),
    [plans],
  );

  const accountsDecorated: DecoratedAccount[] = useMemo(
    () =>
      accounts.map((a) => ({
        ...a,
        ventasFmt: a.ventas > 0 ? fmt(a.ventas) : '—',
        estadoLabel: a.activa ? 'Activa' : 'Inactiva',
        estadoStyle: pill(a.activa ? { color: '#047857', bg: '#D1FAE5' } : { color: '#B91C1C', bg: '#FEE2E2' }),
        switchStyle: { width: '40px', height: '23px', borderRadius: '999px', background: a.activa ? '#059669' : '#CBD5E1', padding: '2.5px', cursor: 'pointer', transition: 'background .15s', boxSizing: 'border-box' },
        knobStyle: { width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transform: a.activa ? 'translateX(17px)' : 'translateX(0)', transition: 'transform .15s', boxShadow: '0 1px 2px rgba(15,23,42,.25)' },
        toggle: () => setAccounts((st) => st.map((x) => (x.id === a.id ? { ...x, activa: !x.activa } : x))),
      })),
    [accounts],
  );

  const newOrders = orders.filter((o) => o.estado === 'Nuevo');
  const activeOrders = orders.filter((o) => o.estado !== 'Entregado');
  const ventasHoy = activeOrders.reduce((a, o) => a + o.items.reduce((x, it) => x + it.qty * it.precio, 0), 0);

  const filterList = ['Todos', ...ESTADO_ORDER];
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filteredOrders: DecoratedOrder[] = useMemo(() => {
    const q = norm(orderQuery.trim());
    return orders
      .filter((o) => filter === 'Todos' || o.estado === filter)
      .filter((o) => !q || norm(o.cliente).includes(q) || norm(o.id).includes(q))
      .map(decorateOrder);
  }, [orders, filter, orderQuery]);
  const recentOrders: DecoratedOrder[] = useMemo(() => orders.slice(0, 4).map(decorateOrder), [orders]);
  const selRaw = orders.find((o) => o.id === selectedOrderId) || null;
  const sel = selRaw ? decorateOrder(selRaw) : null;

  const orderFilters: OrderFilterOption[] = filterList.map((f) => {
    const active = filter === f;
    const count = f === 'Todos' ? orders.length : orders.filter((o) => o.estado === f).length;
    return {
      key: f,
      label: f + ' (' + count + ')',
      set: () => setFilter(f),
      style: {
        padding: '7px 14px',
        borderRadius: '999px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? '#0F172A' : '#fff',
        color: active ? '#fff' : '#64748B',
        border: '1px solid ' + (active ? '#0F172A' : '#E2E8F0'),
      },
    };
  });

  function assignLead(v: string) {
    setLeads((st) => st.map((l) => (l.id === selectedLeadId ? { ...l, asignado: v } : l)));
    setFlowMsg('Chat asignado a ' + v + ' ✓');
  }

  function sendFlow() {
    setFlowMsg((lead ? lead.nombre : 'El lead') + ' entró al flujo «' + flowSel + '» ✓');
  }

  function addRule() {
    if (ruleDraft.trim()) {
      setRules((st) => [...st, ruleDraft.trim()]);
      setRuleDraft('');
    }
  }

  function saveAssistant() {
    setAssistantSaved(true);
    clearTimeout(assistantTimer.current);
    assistantTimer.current = setTimeout(() => setAssistantSaved(false), 2500);
  }

  function sendCrm() {
    const txt = crmDraft.trim();
    if (!txt) return;
    setCrmDraft('');
    setLeads((st) =>
      st.map((l) => (l.id === crmSelectedId ? { ...l, asignado: 'Karla', mensajes: [...l.mensajes, { de: 'vendedor' as const, texto: txt, hora: 'ahora' }] } : l)),
    );
  }

  function crearPlan() {
    if (!planNombre.trim() || !planPrecio) {
      setPlanError(true);
      return;
    }
    const features = planDesc.split(',').map((x) => x.trim()).filter(Boolean);
    setPlans((st) => [
      ...st,
      { id: Date.now(), nombre: planNombre.trim(), precio: parseInt(planPrecio, 10), cuentas: 0, features: features.length ? features : ['Plan nuevo, sin cuentas todavía'] },
    ]);
    setPlanNombre('');
    setPlanPrecio('');
    setPlanDesc('');
    setPlanError(false);
  }

  const waPill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', background: waConnected ? '#ECFDF5' : '#FEF2F2', border: '1px solid ' + (waConnected ? '#A7F3D0' : '#FECACA'), color: waConnected ? '#047857' : '#B91C1C', borderRadius: '999px', padding: '4px 11px', fontSize: '12px', fontWeight: 700 };
  const waDot: CSSProperties = { width: '8px', height: '8px', borderRadius: '50%', background: waConnected ? '#10B981' : '#EF4444' };

  return {
    mode,
    isAdmin,
    isVendedor: !isAdmin,
    section,
    adminSection,
    go,
    goAdmin,
    toggleMode,
    modeBtnLabel: isAdmin ? 'Volver al panel vendedor' : 'Panel de administración',
    headerTitle: isAdmin ? 'DealFlow · Administración' : 'Luna Accesorios',
    userLabel: isAdmin ? 'Equipo DealFlow' : 'Karla',
    userInitials: isAdmin ? 'DF' : 'K',
    navStyle,

    waConnected,
    waPill,
    waDot,
    waLabel: waConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado',
    waCardStyleResolved: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: '#fff',
      border: '1px solid ' + (waConnected ? '#A7F3D0' : '#FECACA'),
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 14,
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    } as CSSProperties,
    waBigDot: { width: 12, height: 12, borderRadius: '50%', background: waConnected ? '#10B981' : '#EF4444', flexShrink: 0 } as CSSProperties,
    waStatusTitle: waConnected ? 'Conectado y respondiendo' : 'Sin conexión',
    waToggleBtn: (waConnected
      ? { background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }
      : { background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' }) as CSSProperties,
    waToggleLabel: waConnected ? 'Desconectar' : 'Conectar',
    toggleWa: () => setWaConnected((c) => !c),
    webhookUrl: WEBHOOK_URL,
    waCode: WA_CODE,
    copied,
    copyWebhook: () => copy('webhook', WEBHOOK_URL),
    copyCode: () => copy('code', WA_CODE),
    webhookBtnLabel: copied === 'webhook' ? '✓ Copiado' : 'Copiar',
    codeBtnLabel: copied === 'code' ? '✓ Copiado' : 'Copiar',

    newOrdersCount: newOrders.length,
    hasNewOrders: newOrders.length > 0,
    ventasHoy: fmt(ventasHoy),
    leadsCount: leads.length,
    productCount: products.length,
    recentOrders,

    orderFilters,
    filter,
    filteredOrders,
    noOrders: filteredOrders.length === 0,
    orderQuery,
    setOrderQuery,

    hasSelectedOrder: !!sel,
    sel,
    closeOrder: () => setSelectedOrderId(null),
    selAdvance: () => sel && advanceOrder(sel.id),
    selAdvanceLabel: sel && sel.hasNext ? sel.advanceLabel + ' este pedido' : '',
    selHasNext: !!(sel && sel.hasNext),
    selIsDone: !!(sel && sel.isDone),

    leads: leadsDecorated,
    hasLead: !!lead,
    lead,
    leadAsignado: lead ? lead.asignado : 'Asistente (bot)',
    assignLead,
    flowSel,
    setFlowSel,
    sendFlow,
    flowMsg: flowMsg || '',
    hasFlowMsg: !!flowMsg,

    crmChats,
    hasCrmChat: !!crmChat,
    crmChat,
    liveCount: crmChats.filter((c) => c.live).length,

    menuOpen,
    openMenu: () => setMenuOpen(true),
    closeMenu: () => setMenuOpen(false),
    mobileChatOpen,
    openMobileChat: (id: number) => {
      setCrmSelectedId(id);
      setCrmIntervening(false);
      setMobileChatOpen(true);
    },
    closeMobileChat: () => {
      setMobileChatOpen(false);
      setCrmIntervening(false);
    },
    crmTyping: !!(crmChat && crmChat.live && !crmIntervening),
    crmIntervening,
    crmNotIntervening: !crmIntervening,
    intervene: () => setCrmIntervening(true),
    backToBot: () => setCrmIntervening(false),
    crmDraft,
    setCrmDraft,
    sendCrm,

    products: productsDecorated,
    productRuleDraft,
    setProductRuleDraft,

    newProductOpen,
    toggleNewProduct: () => {
      setNewProductOpen((o) => !o);
      setNewProdError(false);
    },
    newProdNombre,
    setNewProdNombre: (v: string) => {
      setNewProdNombre(v);
      setNewProdError(false);
    },
    newProdPrecio,
    setNewProdPrecio: (v: string) => {
      setNewProdPrecio(v.replace(/[^0-9]/g, ''));
      setNewProdError(false);
    },
    newProdStock,
    setNewProdStock: (v: string) => setNewProdStock(v.replace(/[^0-9]/g, '')),
    newProdError,
    crearProducto,

    variantFormOpen,
    openVariantForm: () => setVariantFormOpen(true),
    cancelVariantForm: () => {
      setVariantFormOpen(false);
      setVariantLabel('');
      setVariantStock('');
    },
    variantLabel,
    setVariantLabel,
    variantStock,
    setVariantStock: (v: string) => setVariantStock(v.replace(/[^0-9]/g, '')),

    resetDemo,

    incoming: incomingOrder ? decorateOrder(incomingOrder) : null,
    dismissToast: () => {
      clearTimeout(toastTimer.current);
      setIncomingOrder(null);
    },
    soundOn,
    toggleSound: () => {
      setSoundOn((s) => {
        if (!s) playOrderChime();
        return !s;
      });
    },

    newPromoOpen,
    toggleNewPromo: () => {
      setNewPromoOpen((o) => !o);
      setPromoError(false);
    },
    promoTipo,
    setPromoTipo,
    promoTitulo,
    setPromoTitulo: (v: string) => {
      setPromoTitulo(v);
      setPromoError(false);
    },
    promoDesc,
    setPromoDesc: (v: string) => {
      setPromoDesc(v);
      setPromoError(false);
    },
    promoVigencia,
    setPromoVigencia,
    promoError,
    crearPromo,

    copyGuia: (guia: string) => copy('guia', guia),
    guiaBtnLabel: copied === 'guia' ? '✓ Copiado' : 'Copiar',
    promos: promosDecorated,
    rules: rulesDecorated,
    ruleDraft,
    setRuleDraft,
    addRule,

    assistantText,
    setAssistantText: (v: string) => {
      setAssistantText(v);
      setAssistantSaved(false);
    },
    saveAssistant,
    assistantSaved,

    integrations: integrationsDecorated,
    plans: plansDecorated,
    accounts: accountsDecorated,

    planNombre,
    setPlanNombre: (v: string) => {
      setPlanNombre(v);
      setPlanError(false);
    },
    planPrecio,
    setPlanPrecio: (v: string) => {
      setPlanPrecio(v.replace(/[^0-9]/g, ''));
      setPlanError(false);
    },
    planDesc,
    setPlanDesc,
    planError,
    crearPlan,
  };
}

export type DealFlowState = ReturnType<typeof useDealFlowState>;
