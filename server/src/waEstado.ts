import { db } from './db.js';

/**
 * Chequeo de salud del número conectado a la API oficial: le pregunta a Meta si
 * el número está en verde (calidad, verificación, límite de mensajes, revisión
 * de la cuenta) y arma los enlaces directos al panel de Meta —entre ellos el de
 * facturación, porque cada tienda pone SU propio método de pago—.
 */

const GRAPH = process.env.GRAPH_URL || 'https://graph.facebook.com/v20.0';
const BM = 'https://business.facebook.com';

export type Semaforo = 'ok' | 'aviso' | 'problema' | 'desconocido';

export interface EnlaceRapido { id: string; titulo: string; sub: string; url: string }

export interface EstadoNumero {
  disponible: boolean;      // false = no hay nada que consultar (QR o sin conectar)
  motivo?: string;          // por qué no hay chequeo
  semaforo: Semaforo;
  titulo: string;
  numero: string;
  nombreVerificado: string;
  calidad: string;          // GREEN | YELLOW | RED
  limite: string;           // TIER_1K, TIER_10K, …
  verificado: boolean;      // el número pasó la verificación por código
  revisionCuenta: string;   // APPROVED | PENDING | REJECTED
  avisos: string[];
  enlaces: EnlaceRapido[];
}

const CALIDAD: Record<string, string> = { GREEN: 'Alta', YELLOW: 'Media', RED: 'Baja' };
const LIMITE: Record<string, string> = {
  TIER_50: '50 clientes nuevos al día',
  TIER_250: '250 clientes nuevos al día',
  TIER_1K: '1.000 clientes nuevos al día',
  TIER_10K: '10.000 clientes nuevos al día',
  TIER_100K: '100.000 clientes nuevos al día',
  TIER_UNLIMITED: 'Sin límite',
};

export function etiquetaCalidad(q: string) { return CALIDAD[q] || ''; }
export function etiquetaLimite(t: string) { return LIMITE[t] || ''; }

function enlaces(wabaId: string, businessId: string): EnlaceRapido[] {
  const waba = wabaId ? `?waba_id=${encodeURIComponent(wabaId)}` : '';
  const pago = businessId
    ? `${BM}/billing_hub/payment_settings?business_id=${encodeURIComponent(businessId)}`
    : `${BM}/billing_hub/payment_settings`;
  return [
    { id: 'pago', titulo: 'Método de pago', sub: 'Agrega tu tarjeta para pagarle a Meta la mensajería', url: pago },
    { id: 'numeros', titulo: 'Mis números', sub: 'Estado, verificación y nombre que ven tus clientes', url: `${BM}/wa/manage/phone-numbers/${waba}` },
    { id: 'perfil', titulo: 'Perfil del negocio', sub: 'Foto, descripción, dirección y horario en WhatsApp', url: `${BM}/wa/manage/profile/${waba}` },
    { id: 'calidad', titulo: 'Calidad y estadísticas', sub: 'Cómo te califican tus clientes y cuánto envías', url: `${BM}/wa/manage/insights/${waba}` },
    { id: 'plantillas', titulo: 'Plantillas de mensajes', sub: 'Para escribirle primero a un cliente pasadas 24 h', url: `${BM}/wa/manage/message-templates/${waba}` },
    { id: 'cuenta', titulo: 'Cuenta de WhatsApp Business', sub: 'Todo el panel de Meta para tu cuenta', url: `${BM}/wa/manage/home/${waba}` },
  ];
}

async function pedir(url: string, token: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function estadoNumero(storeId: string): Promise<EstadoNumero> {
  const base: EstadoNumero = {
    disponible: false, semaforo: 'desconocido', titulo: '', numero: '', nombreVerificado: '',
    calidad: '', limite: '', verificado: false, revisionCuenta: '', avisos: [], enlaces: [],
  };
  const wa = db.prepare('SELECT waba_id, phone_number_id, access_token, numero, conectado, modo FROM whatsapp WHERE store_id = ?').get(storeId) as
    | { waba_id: string; phone_number_id: string; access_token: string; numero: string; conectado: number; modo: string }
    | undefined;

  if (!wa?.conectado) return { ...base, motivo: 'Conecta tu número para ver su estado.' };
  if (wa.modo !== 'cloud' || !wa.access_token || !wa.phone_number_id) {
    return { ...base, motivo: 'El chequeo de Meta solo aplica a los números conectados por la API oficial. El tuyo está vinculado por QR.' };
  }

  const tel = await pedir(
    `${GRAPH}/${encodeURIComponent(wa.phone_number_id)}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,messaging_limit_tier`,
    wa.access_token,
  );
  if (tel.error) {
    const msg = (tel.error as { message?: string }).message || '';
    return { ...base, motivo: `Meta no respondió al chequeo: ${msg}`, enlaces: enlaces(wa.waba_id, '') };
  }

  const cuenta = wa.waba_id
    ? await pedir(`${GRAPH}/${encodeURIComponent(wa.waba_id)}?fields=account_review_status,owner_business_info`, wa.access_token)
    : {};
  const businessId = String((cuenta.owner_business_info as { id?: string } | undefined)?.id || '');

  const calidad = String(tel.quality_rating || '');
  const estado = String(tel.status || '');
  const verificado = String(tel.code_verification_status || '') === 'VERIFIED';
  const nombreEstado = String(tel.name_status || '');
  const revision = String(cuenta.account_review_status || '');

  // Semáforo: rojo si algo impide vender, amarillo si hay que vigilarlo.
  const avisos: string[] = [];
  let semaforo: Semaforo = 'ok';
  const marcar = (nivel: Semaforo, texto: string) => {
    avisos.push(texto);
    if (nivel === 'problema' || semaforo === 'ok') semaforo = nivel;
  };

  if (estado && estado !== 'CONNECTED') {
    if (estado === 'PENDING') marcar('aviso', 'Meta todavía está activando el número. Suele tardar unos minutos.');
    else if (estado === 'RESTRICTED') marcar('problema', 'Meta limitó el número por superar tu tope de mensajes. Se libera solo, pero revisa la calidad.');
    else if (estado === 'BANNED') marcar('problema', 'Meta bloqueó el número. Entra a «Mis números» para apelar.');
    else if (estado === 'FLAGGED') marcar('problema', 'La calidad cayó y Meta marcó el número. Si no mejora, te bajará el límite de mensajes.');
    else marcar('aviso', `Meta reporta el número como «${estado}».`);
  }
  if (calidad === 'RED') marcar('problema', 'Tus clientes están bloqueando o reportando los mensajes. Escribe solo a quien te escribió primero.');
  else if (calidad === 'YELLOW') marcar('aviso', 'La calidad bajó a media. Cuida el tono y la frecuencia de los mensajes.');
  if (!verificado) marcar('problema', 'Falta verificar el número con el código que envía Meta. Hazlo en «Mis números».');
  if (revision === 'PENDING') marcar('aviso', 'Meta está revisando tu cuenta de WhatsApp Business.');
  else if (revision === 'REJECTED') marcar('problema', 'Meta rechazó la revisión de tu cuenta. Revísala en el panel de Meta.');
  if (nombreEstado === 'DECLINED') marcar('aviso', 'Meta rechazó el nombre que ven tus clientes. Cámbialo en «Mis números».');
  else if (nombreEstado === 'PENDING_REVIEW') marcar('aviso', 'Meta está revisando el nombre que ven tus clientes.');

  const titulo = semaforo === 'ok' ? 'Todo en orden' : semaforo === 'aviso' ? 'Funciona, pero revisa esto' : 'Necesita tu atención';

  // Meta manda: si el número mostrado cambió allá, lo actualizamos aquí.
  const numero = String(tel.display_phone_number || wa.numero || '');
  if (numero && numero !== wa.numero) db.prepare('UPDATE whatsapp SET numero = ? WHERE store_id = ?').run(numero, storeId);

  return {
    disponible: true,
    semaforo,
    titulo,
    numero,
    nombreVerificado: String(tel.verified_name || ''),
    calidad,
    limite: String(tel.messaging_limit_tier || ''),
    verificado,
    revisionCuenta: revision,
    avisos,
    enlaces: enlaces(wa.waba_id, businessId),
  };
}
