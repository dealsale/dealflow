/**
 * Rutas de la app de escritorio «DealFlow Soporte» (ver escritorioRemoto.ts).
 *  - /api/escritorio/*        → la app de la tienda (sesión de la tienda).
 *  - /api/admin/escritorio/*  → el equipo de DealFlow.
 *  - /api/escritorio/descargar → el instalador (público), que sube el superadmin.
 */
import express, { type Router } from 'express';
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, registrarLog } from './db.js';
import { requireAuth, requireEquipo, requireStore, requireSuperAdmin } from './auth.js';
import * as er from './escritorioRemoto.js';

const DIR = path.resolve(DATA_DIR, 'descargas');
const INSTALADOR = path.join(DIR, 'DealFlowSoporte-Setup.exe');
const INFO = path.join(DIR, 'DealFlowSoporte.json');

export function rutasEscritorio(api: Router) {
  // ── La app de la tienda ──
  api.post('/escritorio/registrar', requireAuth, requireStore, (req, res) => {
    const b = req.body || {};
    res.json(er.registrarEquipo(req.user!.storeId!, req.user!.id, { equipoId: b.equipoId, nombre: b.nombre, so: b.so, version: b.version, pantalla: b.pantalla }));
  });
  api.post('/escritorio/latido', requireAuth, requireStore, (req, res) => {
    const r = er.latido(req.user!.storeId!, String(req.body?.equipoId || ''));
    if (!r.ok) return res.status(404).json({ error: 'Este computador no está registrado.', ...r });
    const tienda = (db.prepare('SELECT nombre FROM stores WHERE id = ?').get(req.user!.storeId!) as { nombre: string } | undefined)?.nombre || '';
    res.json({ ...r, tienda, usuario: req.user!.nombre || req.user!.email });
  });
  api.post('/escritorio/sesion/:id/responder', requireAuth, requireStore, (req, res) => {
    const ok = er.responder(String(req.params.id), req.user!.storeId!, req.body?.acepta === true);
    if (!ok) return res.status(400).json({ error: 'Ese pedido de conexión ya no está vigente.' });
    res.json({ ok: true });
  });

  // ── Las dos partes ──
  const lado = (req: express.Request) => er.ladoEnSesion(String(req.params.id), { id: req.user!.id, role: req.user!.role, storeId: req.user!.storeId });
  api.get('/escritorio/sesion/:id/senal', requireAuth, (req, res) => {
    const l = lado(req);
    if (!l) return res.status(404).json({ error: 'Sesión no encontrada.' });
    const desde = Number(req.query.desde);
    res.json(er.leerSenales(String(req.params.id), l, Number.isFinite(desde) ? desde : 0));
  });
  api.post('/escritorio/sesion/:id/senal', requireAuth, (req, res) => {
    const l = lado(req);
    if (!l) return res.status(404).json({ error: 'Sesión no encontrada.' });
    const s = er.sesion(String(req.params.id));
    const tipo = String(req.body?.tipo || '');
    if (!['offer', 'answer', 'ice', 'vivo', 'listo'].includes(tipo)) return res.status(400).json({ error: 'Señal no válida.' });
    if (String(s?.estado) !== 'aceptada') return res.status(409).json({ error: 'La tienda todavía no permite la conexión.' });
    er.enviarSenal(String(req.params.id), l, tipo, req.body?.data ?? null);
    res.json({ ok: true });
  });
  api.post('/escritorio/sesion/:id/terminar', requireAuth, (req, res) => {
    const l = lado(req);
    if (!l) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.json({ ok: er.terminar(String(req.params.id), l, String(req.body?.motivo || '').slice(0, 120)) });
  });
  api.get('/escritorio/sesion/:id', requireAuth, (req, res) => {
    const l = lado(req);
    const s = er.sesion(String(req.params.id));
    if (!l || !s) return res.status(404).json({ error: 'Sesión no encontrada.' });
    res.json({ estado: s.estado, quien: s.admin_nombre, motivo: s.motivo, lado: l });
  });

  // ── El equipo de DealFlow ──
  /** Equipos de la tienda de una llamada (o de una tienda), para «Conectar al computador». */
  api.get('/admin/escritorio/equipos', requireAuth, requireEquipo, (req, res) => {
    let storeId = String(req.query.storeId || '');
    const llamada = String(req.query.llamada || '');
    if (llamada) storeId = (db.prepare('SELECT store_id FROM soporte_llamadas WHERE id = ?').get(llamada) as { store_id: string } | undefined)?.store_id || '';
    if (!storeId) return res.json({ equipos: [] });
    if (req.user!.role !== 'SUPERADMIN' && (db.prepare('SELECT COALESCE(oculta,0) o FROM stores WHERE id = ?').get(storeId) as { o: number } | undefined)?.o) return res.json({ equipos: [] });
    res.json({ equipos: er.equiposDeTienda(storeId), descarga: infoInstalador() });
  });
  api.post('/admin/escritorio/equipos/:id/conectar', requireAuth, requireEquipo, (req, res) => {
    const nombre = req.user!.role === 'SUPERADMIN' ? 'Administrador de DealFlow' : (req.user!.nombre || req.user!.email);
    const r = er.pedirSesion(String(req.params.id), { id: req.user!.id, nombre, email: req.user!.email });
    if ('error' in r) return res.status(400).json(r);
    res.json(r);
  });

  // ── Instalador ──
  api.get('/escritorio/descarga', (_req, res) => { res.json(infoInstalador()); });
  api.get('/escritorio/descargar', (_req, res) => {
    if (!existsSync(INSTALADOR)) return res.status(404).send('Todavía no está disponible el instalador.');
    res.setHeader('Cache-Control', 'no-cache');
    res.download(INSTALADOR, 'DealFlowSoporte-Setup.exe');
  });
  // El superadmin sube el instalador (el .exe tal cual, sin JSON: puede pesar ~100 MB).
  api.post('/superadmin/escritorio/instalador', requireAuth, requireSuperAdmin, express.raw({ type: 'application/octet-stream', limit: '300mb' }), (req, res) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length < 1_000_000 || buf.subarray(0, 2).toString('latin1') !== 'MZ') return res.status(400).json({ error: 'Sube el instalador .exe de DealFlow Soporte.' });
    mkdirSync(DIR, { recursive: true });
    writeFileSync(INSTALADOR, buf);
    const version = String(req.query.version || '').replace(/[^0-9.]/g, '').slice(0, 20);
    writeFileSync(INFO, JSON.stringify({ version, subido: new Date().toISOString(), por: req.user!.email, tamano: buf.length }));
    registrarLog(req.user!.storeId || '', 'info', 'soporte', `Instalador de DealFlow Soporte ${version} subido.`);
    res.json({ ok: true, ...infoInstalador() });
  });
}

export function infoInstalador(): { disponible: boolean; version: string; tamano: number; url: string } {
  if (!existsSync(INSTALADOR)) return { disponible: false, version: '', tamano: 0, url: '' };
  let version = '';
  try { version = JSON.parse(readFileSync(INFO, 'utf8')).version || ''; } catch { /* sin info */ }
  return { disponible: true, version, tamano: statSync(INSTALADOR).size, url: '/api/escritorio/descargar' };
}
