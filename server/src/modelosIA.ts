/**
 * Modelo de fotos de OpenAI en UN solo lugar (Marketing IA: Estudio de fotos, personajes UGC y
 * creativos de campañas). OpenAI retira modelos con fecha: el modelo anterior se apagó el
 * 23-oct-2026 y las fotos empezaron a fallar con «model does not exist».
 *
 * Se puede cambiar con la variable OPENAI_IMAGE_MODEL; si alguien deja ahí un modelo ya retirado,
 * se ignora y se usa el vigente (así una variable vieja en Railway no vuelve a romper todo).
 */
const VIGENTE = 'gpt-image-2.6-sunburst';
// Modelos de imagen que OpenAI ya apagó o apaga pronto (incluye sus versiones con fecha).
const RETIRADOS = /^(dall-e-\d|gpt-image-1(\.5)?(-mini)?|chatgpt-image-latest|gpt-image-2)(-\d{4}-\d{2}-\d{2})?$/i;

export function modeloImagen(): string {
  const env = (process.env.OPENAI_IMAGE_MODEL || '').trim();
  return env && !RETIRADOS.test(env) ? env : VIGENTE;
}
