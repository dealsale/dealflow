import { useEffect, useState } from 'react';
import { apiRespuestasRapidas, type RespuestaRapida } from './api';

// Los mensajes rápidos se cargan una vez y los comparten todas las cajas de chat.
let cache: RespuestaRapida[] | null = null;
let cargando: Promise<void> | null = null;
const oyentes = new Set<(r: RespuestaRapida[]) => void>();

export function recargarRespuestas(): Promise<void> {
  cargando = apiRespuestasRapidas().then((r) => {
    cache = r.data?.respuestas || cache || [];
    oyentes.forEach((f) => f(cache!));
  }).finally(() => { cargando = null; });
  return cargando;
}

export function useRespuestasRapidas(): RespuestaRapida[] {
  const [lista, setLista] = useState<RespuestaRapida[]>(cache || []);
  useEffect(() => {
    oyentes.add(setLista);
    if (!cache && !cargando) void recargarRespuestas();
    return () => { oyentes.delete(setLista); };
  }, []);
  return lista;
}

/** {nombre} en el mensaje = primer nombre del cliente. */
export const llenarRespuesta = (texto: string, nombreCliente: string) =>
  texto.replace(/\{nombre\}/gi, (nombreCliente || '').trim().split(/\s+/)[0] || '');
