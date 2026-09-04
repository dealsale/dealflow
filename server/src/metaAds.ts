import { db, j } from './db.js';
import { obtener as obtenerCampana } from './campanas.js';

/**
 * Publicación en el Administrador de anuncios del CLIENTE.
 *
 * La tienda conecta su propia cuenta publicitaria con el mismo popup de
 * Facebook que ya usamos para WhatsApp (permiso ads_management). Guardamos su
 * token y su cuenta; al publicar creamos, con la API de Marketing de Meta:
 *   campaña → conjunto de anuncios → creativo → anuncio
 * Todo nace EN PAUSA: nadie gasta dinero sin que el dueño le dé play en Meta.
 */

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';

export interface CuentaAds {
  conectada: boolean;
  adAccountId: string;
  adAccountNombre: string;
  pageId: string;
  pageNombre: string;
  moneda: string;
}

interface Fila {
  ad_account_id: string;
  ad_account_nombre: string;
  page_id: string;
  page_nombre: string;
  access_token: string;
  moneda: string;
  conectada: number;
}

function filaDe(storeId: string): Fila | undefined {
  return db.prepare('SELECT * FROM ads_cuentas WHERE store_id = ?').get(storeId) as Fila | undefined;
}

export function estadoCuenta(storeId: string): CuentaAds {
  const f = filaDe(storeId);
  return {
    conectada: !!f?.conectada,
    adAccountId: f?.ad_account_id || '',
    adAccountNombre: f?.ad_account_nombre || '',
    pageId: f?.page_id || '',
    pageNombre: f?.page_nombre || '',
    moneda: f?.moneda || '',
  };
}

export function desconectar(storeId: string): void {
  db.prepare("UPDATE ads_cuentas SET conectada = 0, access_token = '' WHERE store_id = ?").run(storeId);
}

async function graph<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; body: T & { error?: { message?: string } } }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  return { ok: res.ok, body };
}

/** Canjea el código del popup por el token del negocio del cliente. */
async function canjearToken(code: string): Promise<{ token: string } | { error: string }> {
  const appId = process.env.META_APP_ID || '';
  const secret = process.env.META_APP_SECRET || '';
  if (!appId || !secret) return { error: 'La conexión con Meta no está configurada en el servidor.' };
  const { ok, body } = await graph<{ access_token?: string }>(
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`,
  );
  const token = String(body.access_token || '');
  if (!ok || !token) return { error: body.error?.message || 'Meta no entregó el acceso. Intenta conectar de nuevo.' };
  return { token };
}

/** Lo que el dueño puede elegir tras autorizar: sus cuentas publicitarias y sus páginas. */
export interface OpcionesAds {
  cuentas: { id: string; nombre: string; moneda: string }[];
  paginas: { id: string; nombre: string }[];
}

/** Paso 1 de la conexión: autoriza y devuelve qué cuentas/páginas tiene. */
export async function opcionesDeConexion(storeId: string, code: string): Promise<{ opciones?: OpcionesAds; error?: string }> {
  const t = await canjearToken(code);
  if ('error' in t) return { error: t.error };
  const auth = { Authorization: `Bearer ${t.token}` };

  const cuentas = await graph<{ data?: { id?: string; name?: string; currency?: string; account_status?: number }[] }>(
    `${GRAPH}/me/adaccounts?fields=name,currency,account_status&limit=50`, { headers: auth },
  );
  if (!cuentas.ok) return { error: cuentas.body.error?.message || 'No pudimos leer tus cuentas publicitarias.' };

  const paginas = await graph<{ data?: { id?: string; name?: string }[] }>(`${GRAPH}/me/accounts?fields=name&limit=50`, { headers: auth });

  const opciones: OpcionesAds = {
    cuentas: (cuentas.body.data || []).map((c) => ({ id: String(c.id || ''), nombre: String(c.name || c.id || ''), moneda: String(c.currency || '') })).filter((c) => c.id),
    paginas: (paginas.body.data || []).map((p) => ({ id: String(p.id || ''), nombre: String(p.name || p.id || '') })).filter((p) => p.id),
  };
  if (!opciones.cuentas.length) return { error: 'Tu Facebook no tiene ninguna cuenta publicitaria. Crea una en el Administrador de anuncios y vuelve a intentar.' };

  // Guardamos el token ya (sin marcar conectada) para el paso 2.
  db.prepare(
    `INSERT INTO ads_cuentas (store_id, access_token) VALUES (?,?)
     ON CONFLICT(store_id) DO UPDATE SET access_token = excluded.access_token`,
  ).run(storeId, t.token);
  return { opciones };
}

/** Paso 2: el dueño elige cuenta publicitaria y página, y queda conectada. */
export function guardarSeleccion(
  storeId: string,
  sel: { adAccountId: string; adAccountNombre: string; moneda: string; pageId: string; pageNombre: string },
): { ok?: true; error?: string } {
  const f = filaDe(storeId);
  if (!f?.access_token) return { error: 'Vuelve a autorizar con Facebook.' };
  if (!sel.adAccountId) return { error: 'Elige una cuenta publicitaria.' };
  db.prepare(
    `UPDATE ads_cuentas SET ad_account_id = ?, ad_account_nombre = ?, moneda = ?, page_id = ?, page_nombre = ?, conectada = 1 WHERE store_id = ?`,
  ).run(sel.adAccountId, sel.adAccountNombre || sel.adAccountId, sel.moneda || '', sel.pageId || '', sel.pageNombre || '', storeId);
  return { ok: true };
}

// ── Publicar ──────────────────────────────────────────────────────────
const OBJETIVO_META: Record<string, string> = {
  mensajes: 'OUTCOME_ENGAGEMENT',
  ventas: 'OUTCOME_SALES',
  trafico: 'OUTCOME_TRAFFIC',
  reconocimiento: 'OUTCOME_AWARENESS',
};

/**
 * Crea la campaña completa en Meta, siempre EN PAUSA. `presupuesto` es el
 * diario en la moneda de la cuenta (lo convertimos a centavos, como pide Meta).
 */
export async function publicar(
  storeId: string,
  campanaId: string,
  opciones: { presupuesto: number; textoIdx?: number; tituloIdx?: number; descripcionIdx?: number; creativoIdx?: number },
): Promise<{ ok?: true; ids?: Record<string, string>; error?: string }> {
  const f = filaDe(storeId);
  if (!f?.conectada || !f.access_token || !f.ad_account_id) return { error: 'Conecta primero tu Administrador de anuncios.' };
  if (!f.page_id) return { error: 'Necesitas elegir una página de Facebook para publicar el anuncio.' };

  const c = obtenerCampana(storeId, campanaId);
  if (!c) return { error: 'Campaña no encontrada.' };
  if (!c.copys?.textos.length) return { error: 'La campaña no tiene textos todavía.' };
  if (!c.creativos.length) return { error: 'La campaña no tiene ningún creativo.' };

  const presupuesto = Math.round(Number(opciones.presupuesto) || 0);
  if (presupuesto < 1000) return { error: 'El presupuesto diario mínimo es 1.000 (en la moneda de tu cuenta).' };

  const act = f.ad_account_id.startsWith('act_') ? f.ad_account_id : `act_${f.ad_account_id}`;
  const token = f.access_token;
  const post = async <T>(ruta: string, params: Record<string, unknown>) => {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    body.append('access_token', token);
    return graph<T>(`${GRAPH}/${ruta}`, { method: 'POST', body });
  };

  const texto = c.copys.textos[opciones.textoIdx || 0] || c.copys.textos[0];
  const titulo = c.copys.titulos[opciones.tituloIdx || 0] || c.copys.titulos[0] || '';
  const descripcion = c.copys.descripciones[opciones.descripcionIdx || 0] || c.copys.descripciones[0] || '';
  const creativo = c.creativos[opciones.creativoIdx || 0] || c.creativos[0];

  // 1) Campaña (en pausa).
  const camp = await post<{ id?: string }>(`${act}/campaigns`, {
    name: c.nombre,
    objective: OBJETIVO_META[c.objetivo] || OBJETIVO_META.mensajes,
    status: 'PAUSED',
    special_ad_categories: [],
  });
  if (!camp.ok || !camp.body.id) return { error: camp.body.error?.message || 'Meta rechazó la creación de la campaña.' };

  // 2) Conjunto de anuncios con el presupuesto diario.
  const adset = await post<{ id?: string }>(`${act}/adsets`, {
    name: `${c.nombre} · conjunto`,
    campaign_id: camp.body.id,
    daily_budget: presupuesto * 100,
    billing_event: 'IMPRESSIONS',
    optimization_goal: c.objetivo === 'trafico' ? 'LINK_CLICKS' : c.objetivo === 'reconocimiento' ? 'REACH' : 'CONVERSATIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: { geo_locations: { countries: ['CO'] }, age_min: 18, age_max: 65 },
    status: 'PAUSED',
    ...(c.objetivo === 'mensajes' ? { destination_type: 'WHATSAPP', promoted_object: { page_id: f.page_id } } : {}),
  });
  if (!adset.ok || !adset.body.id) return { error: adset.body.error?.message || 'Meta rechazó la creación del conjunto de anuncios.' };

  // 3) Creativo con la imagen y los textos elegidos.
  const base = process.env.PUBLIC_URL || '';
  const imagenUrl = creativo.startsWith('http') ? creativo : `${base}${creativo}`;
  const creative = await post<{ id?: string }>(`${act}/adcreatives`, {
    name: `${c.nombre} · creativo`,
    object_story_spec: {
      page_id: f.page_id,
      link_data: {
        message: texto,
        name: titulo,
        description: descripcion,
        picture: imagenUrl,
        link: c.objetivo === 'mensajes' ? `https://wa.me/` : (base || 'https://facebook.com'),
        call_to_action: { type: c.objetivo === 'mensajes' ? 'MESSAGE_PAGE' : 'LEARN_MORE' },
      },
    },
  });
  if (!creative.ok || !creative.body.id) return { error: creative.body.error?.message || 'Meta rechazó el creativo. Revisa que la imagen sea accesible públicamente.' };

  // 4) El anuncio, también en pausa.
  const ad = await post<{ id?: string }>(`${act}/ads`, {
    name: `${c.nombre} · anuncio`,
    adset_id: adset.body.id,
    creative: { creative_id: creative.body.id },
    status: 'PAUSED',
  });
  if (!ad.ok || !ad.body.id) return { error: ad.body.error?.message || 'Meta rechazó el anuncio.' };

  const ids = { campaignId: camp.body.id, adsetId: adset.body.id, creativeId: creative.body.id, adId: ad.body.id, cuenta: act };
  db.prepare("UPDATE campanas SET estado = 'publicada', publicacion = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
    .run(j({ ...ids, fecha: new Date().toISOString() }), campanaId, storeId);
  console.log(`[ads] tienda ${storeId} publicó la campaña ${campanaId} → ${ad.body.id}`);
  return { ok: true, ids };
}
