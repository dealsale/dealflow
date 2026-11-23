import { readFileSync } from 'node:fs';
import { db, j } from './db.js';
import { aPresupuestoMeta } from './adsManager.js';
import { obtener as obtenerCampana } from './campanas.js';
import { mediaPath } from './media.js';
import { canjearAcceso, type AccesoMeta } from './metaToken.js';

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



/** Lo que el dueño puede elegir tras autorizar: sus cuentas publicitarias y sus páginas. */
export interface OpcionesAds {
  cuentas: { id: string; nombre: string; moneda: string }[];
  paginas: { id: string; nombre: string }[];
}

/** Paso 1 de la conexión: autoriza y devuelve qué cuentas/páginas tiene. */
export async function opcionesDeConexion(storeId: string, acceso: AccesoMeta): Promise<{ opciones?: OpcionesAds; error?: string }> {
  const t = await canjearAcceso(acceso);
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
 * Sube el creativo a la biblioteca de la cuenta publicitaria y devuelve su
 * hash. Se envían los bytes porque nuestras imágenes viven tras la sesión
 * (/api/media) y los servidores de Meta no pueden descargarlas por URL.
 */
async function subirImagen(act: string, token: string, storeId: string, urlCreativo: string): Promise<{ hash: string } | { error: string }> {
  const archivo = urlCreativo.split('/').pop() || '';
  if (!archivo) return { error: 'El creativo no tiene un archivo válido.' };
  let bytes: Buffer;
  try {
    bytes = readFileSync(mediaPath(storeId, archivo));
  } catch {
    return { error: 'No encontramos el archivo del creativo. Genéralo de nuevo en el paso 2.' };
  }
  const form = new FormData();
  form.append('access_token', token);
  form.append('filename', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), archivo);
  try {
    const res = await fetch(`${GRAPH}/${act}/adimages`, { method: 'POST', body: form });
    const body = (await res.json().catch(() => ({}))) as { images?: Record<string, { hash?: string }>; error?: { message?: string } };
    if (!res.ok) return { error: body.error?.message || 'Meta no aceptó la imagen del anuncio.' };
    const hash = Object.values(body.images || {})[0]?.hash;
    if (!hash) return { error: 'Meta no devolvió la imagen subida.' };
    return { hash };
  } catch {
    return { error: 'No pudimos subir la imagen a Meta.' };
  }
}

/**
 * A dónde manda el anuncio: al WhatsApp de la tienda, o a SU tienda en línea (nunca a DealFlow).
 * Para «ventas» también hace falta el píxel de la tienda (Meta optimiza por compras).
 */
async function destinoDelAnuncio(storeId: string, objetivo: string): Promise<{ enlace: string; pixel?: string } | { error: string }> {
  if (objetivo === 'mensajes') {
    const wa = db.prepare('SELECT numero FROM whatsapp WHERE store_id = ? AND conectado = 1').get(storeId) as { numero: string } | undefined;
    const num = (wa?.numero || '').replace(/\D/g, '');
    // Sin número no hay a dónde mandar al cliente: mejor decirlo que publicar algo roto.
    if (!num) return { error: 'Para anuncios que llevan a WhatsApp necesitas tener tu número conectado en la sección WhatsApp.' };
    return { enlace: `https://wa.me/${num}` };
  }
  const { dominioActivo } = await import('./landings.js');
  const dom = dominioActivo(storeId);
  if (!dom) return { error: 'Para este objetivo el anuncio lleva a tu tienda en línea, y todavía no tiene dirección. Actívala en «Tienda en línea» o elige el objetivo «Mensajes a WhatsApp».' };
  const enlace = `https://${dom}`;
  if (objetivo !== 'ventas') return { enlace };
  const { pixelesDe } = await import('./metaPixelWeb.js');
  const pixel = pixelesDe(storeId)[0] || '';
  if (!pixel) return { error: 'Para optimizar por ventas necesitas el píxel de Meta (configúralo en tu Tienda en línea) o elige el objetivo «Tráfico».' };
  return { enlace, pixel };
}

/** Meta pide un objetivo de optimización acorde al de la campaña (y destino/píxel según el caso). */
function optimizacion(objetivo: string, pageId: string, pixel?: string): Record<string, unknown> {
  if (objetivo === 'mensajes') return { optimization_goal: 'CONVERSATIONS', destination_type: 'WHATSAPP', promoted_object: { page_id: pageId } };
  if (objetivo === 'ventas') return { optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: pixel, custom_event_type: 'PURCHASE' } };
  if (objetivo === 'reconocimiento') return { optimization_goal: 'REACH' };
  return { optimization_goal: 'LINK_CLICKS', destination_type: 'WEBSITE' };
}

/**
 * Crea la campaña completa en Meta, siempre EN PAUSA. `presupuesto` es el
 * diario en la moneda de la cuenta (lo convertimos a centavos, como pide Meta).
 */
export async function publicar(
  storeId: string,
  campanaId: string,
  opciones: { presupuesto: number; textoIdx?: number; tituloIdx?: number; descripcionIdx?: number; creativoIdx?: number },
): Promise<{ ok?: true; ids?: Record<string, string>; error?: string; enProceso?: boolean }> {
  const f = filaDe(storeId);
  if (!f?.conectada || !f.access_token || !f.ad_account_id) return { error: 'Conecta primero tu Administrador de anuncios.' };
  if (!f.page_id) return { error: 'Necesitas elegir una página de Facebook para publicar el anuncio.' };

  const c = obtenerCampana(storeId, campanaId);
  if (!c) return { error: 'Campaña no encontrada.' };
  if (!c.copys?.textos.length) return { error: 'La campaña no tiene textos todavía.' };
  if (!c.creativos.length) return { error: 'La campaña no tiene ningún creativo.' };

  const presupuesto = Math.round(Number(opciones.presupuesto) || 0);
  if (presupuesto < 1000) return { error: 'El presupuesto diario mínimo es 1.000 (en la moneda de tu cuenta).' };

  // Se valida el destino antes de crear nada en Meta, para no dejar campañas
  // a medias si resulta que falta el número de WhatsApp.
  const destino = await destinoDelAnuncio(storeId, c.objetivo);
  if ('error' in destino) return { error: destino.error };

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

  // Video (subido por la tienda o hecho en Video UGC): Meta tarda minutos en procesarlo, así que
  // se crea en segundo plano con el mismo sistema del Estudio (sube, espera, crea todo en pausa).
  if (/\.(mp4|mov|webm|m4v)$/i.test(creativo.split('?')[0])) {
    if (!['mensajes', 'ventas', 'trafico'].includes(c.objetivo)) return { error: 'Los anuncios con video se publican con el objetivo Mensajes, Ventas o Tráfico. Cambia el objetivo o elige una foto.' };
    const { piezaDeUrl } = await import('./bibliotecaMk.js');
    const pieza = piezaDeUrl(storeId, creativo);
    if (!pieza) return { error: 'No encontramos ese video. Vuelve a subirlo desde la Biblioteca.' };
    const { crearLanzamiento } = await import('./estudioMeta.js');
    const r = await crearLanzamiento(storeId, pieza.proyectoId, {
      nombre: c.nombre, objetivo: c.objetivo as 'mensajes' | 'ventas' | 'trafico', presupuesto,
      enlace: destino.enlace, pixelId: destino.pixel,
      piezas: [{ id: pieza.id, texto, titular: titulo }],
    });
    if ('error' in r) return { error: r.error };
    db.prepare("UPDATE campanas SET estado = 'publicada', publicacion = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
      .run(j({ lanzamientoId: r.id, video: true, fecha: new Date().toISOString() }), campanaId, storeId);
    return { ok: true, ids: { lanzamientoId: r.id }, enProceso: true };
  }

  // 1) Campaña (en pausa).
  const camp = await post<{ id?: string }>(`${act}/campaigns`, {
    name: c.nombre,
    objective: OBJETIVO_META[c.objetivo] || OBJETIVO_META.mensajes,
    status: 'PAUSED',
    special_ad_categories: [],
  });
  if (!camp.ok || !camp.body.id) return { error: camp.body.error?.message || 'Meta rechazó la creación de la campaña.' };
  // Si algo falla después, se borra la campaña recién creada para no dejarla huérfana en la cuenta.
  const campaignId = camp.body.id;
  const fallar = async (error: string) => {
    await post(campaignId, { status: 'DELETED' }).catch(() => null);
    return { error };
  };

  // 2) Conjunto de anuncios con el presupuesto diario.
  const adset = await post<{ id?: string }>(`${act}/adsets`, {
    name: `${c.nombre} · conjunto`,
    campaign_id: campaignId,
    daily_budget: aPresupuestoMeta(presupuesto, f.moneda || 'COP'), // COP va en pesos enteros (antes ×100 = 100 veces el presupuesto)
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: { geo_locations: { countries: ['CO'] }, age_min: 18, age_max: 65 },
    status: 'PAUSED',
    ...optimizacion(c.objetivo, f.page_id, destino.pixel),
  });
  if (!adset.ok || !adset.body.id) return fallar(adset.body.error?.message || 'Meta rechazó la creación del conjunto de anuncios.');

  // 3) Subimos la imagen a Meta y usamos su hash. Nuestras URLs /api/media
  // están protegidas por sesión, así que Meta no podría descargarlas: hay que
  // enviarle los bytes.
  const subida = await subirImagen(act, token, storeId, creativo);
  if ('error' in subida) return fallar(subida.error);

  const creative = await post<{ id?: string }>(`${act}/adcreatives`, {
    name: `${c.nombre} · creativo`,
    object_story_spec: {
      page_id: f.page_id,
      link_data: {
        message: texto,
        name: titulo,
        description: descripcion,
        image_hash: subida.hash,
        link: destino.enlace,
        call_to_action: c.objetivo === 'mensajes'
          ? { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: destino.enlace } }
          : { type: c.objetivo === 'ventas' ? 'SHOP_NOW' : 'LEARN_MORE', value: { link: destino.enlace } },
      },
    },
  });
  if (!creative.ok || !creative.body.id) return fallar(creative.body.error?.message || 'Meta rechazó el creativo.');

  // 4) El anuncio, también en pausa.
  const ad = await post<{ id?: string }>(`${act}/ads`, {
    name: `${c.nombre} · anuncio`,
    adset_id: adset.body.id,
    creative: { creative_id: creative.body.id },
    status: 'PAUSED',
  });
  if (!ad.ok || !ad.body.id) return fallar(ad.body.error?.message || 'Meta rechazó el anuncio.');

  const ids = { campaignId, adsetId: adset.body.id, creativeId: creative.body.id, adId: ad.body.id, cuenta: act };
  db.prepare("UPDATE campanas SET estado = 'publicada', publicacion = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
    .run(j({ ...ids, fecha: new Date().toISOString() }), campanaId, storeId);
  console.log(`[ads] tienda ${storeId} publicó la campaña ${campanaId} → ${ad.body.id}`);
  return { ok: true, ids };
}
