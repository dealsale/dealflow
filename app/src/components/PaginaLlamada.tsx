import { useEffect, useState } from 'react';
import { useLlamada } from '../lib/llamadaRTC';
import { VentanaLlamada } from './VentanaLlamada';

/**
 * Ventana aparte de la llamada de soporte (/llamada). Lleva la llamada sola: la pestaña de
 * DealFlow se puede recargar sin cortarla. Al cerrarla, la llamada vuelve a esa pestaña.
 */
export function PaginaLlamada() {
  const ll = useLlamada();
  const [espera, setEspera] = useState(true);
  useEffect(() => {
    document.title = 'Llamada de soporte · DealFlow';
    document.body.style.background = '#0B1220';
    const t = setTimeout(() => setEspera(false), 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (ll?.fase === 'conectada') document.title = '📞 En llamada · DealFlow'; }, [ll?.fase]);
  return (
    <>
      <VentanaLlamada aparte />
      {!ll && !espera && (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0B1220', color: '#fff', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", padding: 16, textAlign: 'center' }}>
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>No hay ninguna llamada activa.</div>
            <button type="button" onClick={() => window.close()} style={{ border: 0, borderRadius: 10, padding: '10px 16px', background: '#10B981', color: '#052e1f', fontFamily: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Cerrar ventana</button>
          </div>
        </div>
      )}
    </>
  );
}
