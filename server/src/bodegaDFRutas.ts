/**
 * Rutas de la Bodega DealFlow (ver bodegaDF.ts).
 *  - /api/bodega-df/*             → la tienda: billetera, retiros y sus pedidos de la bodega.
 *  - /api/superadmin/bodega-df/*  → DealFlow: cuenta de Skydropx, ajustes, bodegas, productos,
 *                                   billeteras, retiros y despachos. Todo lo de dinero: superadmin.
 * La recarga con Bold está en routes.ts (/api/billetera/recargar), junto a los otros cobros.
 */
import type { Router } from 'express';
import { requireAuth, requireOwner, requireStore, requireSuperAdmin } from './auth.js';
import * as B from './bodegaDF.js';

export function rutasBodegaDF(api: Router) {
  // ── Tienda ──
  api.get('/bodega-df', requireAuth, requireStore, requireOwner, (req, res) => {
    const sid = req.user!.storeId!;
    res.json({ ...B.resumenBilletera(sid), pedidos: B.pedidosDFDeTienda(sid) });
  });
  api.post('/bodega-df/retiro', requireAuth, requireStore, requireOwner, (req, res) => {
    const r = B.pedirRetiro(req.user!.storeId!, Number(req.body?.monto) || 0, String(req.body?.datos || ''), req.user!.nombre || req.user!.email);
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
  api.post('/bodega-df/pedidos/:id/despachar', requireAuth, requireStore, requireOwner, async (req, res) => {
    const r = await B.despacharDF(req.user!.storeId!, String(req.params.id), { manual: true });
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
  api.post('/bodega-df/pedidos/:id/resolver', requireAuth, requireStore, (req, res) => {
    const r = B.resolverEscaladoDF(req.user!.storeId!, String(req.params.id), String(req.body?.respuesta || ''), req.user!.nombre || req.user!.email);
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });

  // ── Superadmin ──
  const quien = (req: { user?: { nombre?: string; email?: string } }) => req.user?.nombre || req.user?.email || 'superadmin';
  api.get('/superadmin/bodega-df', requireAuth, requireSuperAdmin, async (_req, res) => {
    res.json({
      cuenta: await B.estadoCuentaDF(false), ajustes: B.ajustesDF(), bodegas: B.listarBodegasAdmin(),
      productos: B.listarProductosDFAdmin(), billeteras: B.billeterasAdmin(), despachos: B.despachosAdmin(), ganancia: B.gananciaGuiasDF(),
    });
  });
  api.post('/superadmin/bodega-df/verificar', requireAuth, requireSuperAdmin, async (_req, res) => { res.json(await B.estadoCuentaDF(true)); });
  api.put('/superadmin/bodega-df/ajustes', requireAuth, requireSuperAdmin, (req, res) => { res.json(B.guardarAjustesDF(req.body || {})); });
  api.put('/superadmin/bodega-df/bodegas/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const r = B.guardarBodegaProveedor(String(req.params.id), req.body || {});
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
  api.put('/superadmin/bodega-df/productos/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const r = B.guardarProductoDF(String(req.params.id), req.body || {});
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
  api.post('/superadmin/bodega-df/billetera', requireAuth, requireSuperAdmin, (req, res) => {
    const r = B.ajusteBilletera(String(req.body?.storeId || ''), Number(req.body?.monto) || 0, String(req.body?.motivo || ''), quien(req));
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
  api.post('/superadmin/bodega-df/retiros/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const estado = req.body?.estado === 'rechazado' ? 'rechazado' : 'pagado';
    const r = B.resolverRetiro(String(req.params.id), estado, String(req.body?.nota || ''), quien(req));
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
  api.post('/superadmin/bodega-df/pedidos/:storeId/:id/despachar', requireAuth, requireSuperAdmin, async (req, res) => {
    const r = await B.despacharDF(String(req.params.storeId), String(req.params.id), { manual: true });
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });
}
