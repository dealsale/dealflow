import { useState } from 'react';
import type { DealFlowState } from '../hooks/useDealFlowState';
import logo from '../assets/logo.png';

export function Login({ df }: { df: DealFlowState }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const entrar = () => df.login(email, password);

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: "'Inter',system-ui,sans-serif", color: '#1E293B', padding: 16 }}>
      <div style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
          <img src={logo} alt="DealFlow" style={{ width: 40, height: 36, objectFit: 'contain' }} />
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>DealFlow</span>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 26, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Entra a tu tienda</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 18 }}>Tu tienda y tu asistente de WhatsApp en un solo lugar.</div>

          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Correo</div>
          <input
            className="df-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              df.clearLoginError();
            }}
            placeholder="tucorreo@tienda.co"
            autoComplete="username"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 14, marginBottom: 12, minHeight: 44 }}
          />
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Contraseña</div>
          <input
            className="df-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              df.clearLoginError();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') entrar();
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 12px', fontFamily: 'inherit', fontSize: 14, marginBottom: 14, minHeight: 44 }}
          />
          {df.loginError && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{df.loginError}</div>}
          <button
            onClick={entrar}
            className="df-btn-primary"
            style={{ width: '100%', background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: 13, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            Entrar
          </button>
        </div>

        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '12px 16px', marginTop: 14, fontSize: 12.5, color: '#047857', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Cuentas de la demo</div>
          Vendedora: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>karla@lunaaccesorios.co · demo123</span>
          <br />
          Admin: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>admin@dealflow.co · admin123</span>
        </div>
      </div>
    </div>
  );
}
