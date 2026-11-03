/**
 * DealFlow Soporte — app de escritorio para Windows.
 *
 * Es una carcasa: abre la página /escritorio de DealFlow (ahí viven el inicio de sesión, el
 * permiso y la conexión, que se actualizan con DealFlow sin reinstalar nada) y le da a ESA
 * página, y solo a ella, tres cosas que un navegador no puede:
 *   1. Compartir la pantalla principal sin el selector (después de que la tienda dio permiso).
 *   2. Mover el ratón y usar el teclado en el computador (entrada.ps1 → SendInput de Windows).
 *   3. Quedarse en la bandeja junto al reloj y arrancar con Windows, para estar «en línea».
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, session, desktopCapturer, screen, Notification, shell, nativeImage } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const URL_BASE = (process.env.DEALFLOW_URL || 'https://app.dealflow.sbs').replace(/\/+$/, '');
const ORIGEN = new URL(URL_BASE).origin;
const PAGINA = `${URL_BASE}/escritorio`;
const recurso = (f) => path.join(__dirname, 'recursos', f);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('sbs.dealflow.soporte');

let ventana = null;
let bandeja = null;
let saliendo = false;
let sesionActiva = false;
let quienControla = '';

// ── Ventana ────────────────────────────────────────────────────────────
function crearVentana(oculta) {
  ventana = new BrowserWindow({
    width: 420, height: 580, resizable: false, maximizable: false, fullscreenable: false, show: !oculta,
    title: 'DealFlow Soporte', icon: recurso('icono.ico'), backgroundColor: '#0B1220', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  ventana.setMenu(null);
  ventana.loadURL(PAGINA);
  // Solo DealFlow dentro de la ventana; lo demás (descargas, ayuda) en el navegador normal.
  ventana.webContents.on('will-navigate', (e, url) => { if (new URL(url).origin !== ORIGEN) { e.preventDefault(); void shell.openExternal(url); } });
  ventana.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  // Sin internet al abrir: se reintenta solo.
  ventana.webContents.on('did-fail-load', (_e, codigo) => { if (codigo !== -3) setTimeout(() => ventana && !ventana.isDestroyed() && ventana.loadURL(PAGINA), 8000); });
  // Cerrar la ventana = queda en la bandeja (sigue «en línea» para soporte).
  ventana.on('close', (e) => {
    if (saliendo) return;
    e.preventDefault();
    if (sesionActiva) { ventana.show(); return; } // durante una sesión la ventanita de «Detener» no se esconde
    ventana.hide();
    avisarUnaVez('DealFlow Soporte sigue abierto', 'Queda junto al reloj, listo por si el equipo de DealFlow necesita ayudarte (siempre con tu permiso).');
  });
}
let yaAvisado = false;
function avisarUnaVez(t, c) { if (yaAvisado) return; yaAvisado = true; avisar(t, c); }
function avisar(titulo, cuerpo) { try { new Notification({ title: titulo, body: cuerpo, icon: recurso('icono.png') }).show(); } catch { /* sin notificaciones */ } }
function mostrar() { if (!ventana) return; if (ventana.isMinimized()) ventana.restore(); ventana.show(); ventana.focus(); ventana.flashFrame(true); setTimeout(() => ventana && !ventana.isDestroyed() && ventana.flashFrame(false), 4000); }

/** Durante la sesión: ventanita siempre encima, abajo a la derecha, con «Detener». */
function modoSesion(activo, quien) {
  sesionActiva = !!activo; quienControla = quien || '';
  if (!ventana) return;
  if (activo) {
    const a = screen.getPrimaryDisplay().workArea;
    ventana.setResizable(true); ventana.setSize(320, 140); ventana.setResizable(false);
    ventana.setPosition(a.x + a.width - 336, a.y + a.height - 156);
    ventana.setAlwaysOnTop(true, 'screen-saver');
    ventana.setSkipTaskbar(false);
    ventana.showInactive();
  } else {
    entrada.parar();
    ventana.setAlwaysOnTop(false);
    ventana.setResizable(true); ventana.setSize(420, 580); ventana.setResizable(false);
    ventana.center();
  }
  actualizarBandeja();
}

// ── Bandeja ────────────────────────────────────────────────────────────
function actualizarBandeja() {
  if (!bandeja) return;
  const auto = app.getLoginItemSettings().openAtLogin;
  bandeja.setToolTip(sesionActiva ? `DealFlow Soporte · ${quienControla || 'soporte'} está conectado` : 'DealFlow Soporte · listo');
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir DealFlow Soporte', click: mostrar },
    { type: 'separator' },
    { label: 'Abrir con Windows', type: 'checkbox', checked: auto, click: (i) => { inicioAutomatico(i.checked); actualizarBandeja(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => { saliendo = true; entrada.parar(); app.quit(); } },
  ]));
}
function inicioAutomatico(activo) {
  if (process.platform !== 'win32') return false;
  if (typeof activo === 'boolean') app.setLoginItemSettings({ openAtLogin: activo, args: ['--oculto'] });
  return app.getLoginItemSettings().openAtLogin;
}

// ── Ratón y teclado (entrada.ps1: PowerShell + SendInput de Windows) ─────
const entrada = (() => {
  let proc = null;
  const ruta = path.join(__dirname, 'entrada.ps1').replace('app.asar', 'app.asar.unpacked');
  const arrancar = () => {
    if (process.platform !== 'win32') return null;
    proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ruta], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    proc.stderr.on('data', (d) => console.warn('[entrada]', String(d).slice(0, 300)));
    proc.on('exit', () => { proc = null; });
    return proc;
  };
  return {
    enviar(linea) { const p = proc || arrancar(); if (p && p.stdin.writable) p.stdin.write(linea + '\n'); },
    parar() { try { proc?.stdin.end(); proc?.kill(); } catch { /* nada */ } proc = null; },
    preparar() { if (!proc) arrancar(); },
  };
})();

const VK = {
  Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46, Insert: 45, Home: 36, End: 35, PageUp: 33, PageDown: 34,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32, Meta: 91, ContextMenu: 93, PrintScreen: 44,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
};
const EXTENDIDA = new Set([33, 34, 35, 36, 37, 38, 39, 40, 45, 46, 91, 93]);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const lim = (v) => Math.max(0, Math.min(1, num(v)));
/** De lo que manda el visor (coordenadas 0–1, teclas del navegador) a una línea para entrada.ps1. */
function traducir(a) {
  if (!a || typeof a !== 'object') return [];
  if (a.t === 'm') return [`m ${lim(a.x).toFixed(5)} ${lim(a.y).toFixed(5)}`];
  if (a.t === 'c') return [`c ${lim(a.x).toFixed(5)} ${lim(a.y).toFixed(5)} ${a.b === 2 ? 2 : a.b === 1 ? 1 : 0}`];
  if (a.t === 'w') return [`w ${lim(a.x).toFixed(5)} ${lim(a.y).toFixed(5)} ${Math.round(num(a.dx))} ${Math.round(num(a.dy))}`];
  if (a.t === 'txt') {
    const s = String(a.s || '').slice(0, 2000);
    return [...s].map((ch) => (ch === '\n' ? 'k 13 0 0' : ch === '\r' ? '' : `u ${ch.codePointAt(0)}`)).filter(Boolean);
  }
  if (a.t === 'k') {
    const key = String(a.key || '');
    const mods = (a.ctrl ? 1 : 0) | (a.shift ? 2 : 0) | (a.alt ? 4 : 0) | (a.meta ? 8 : 0);
    if ([...key].length === 1 && !(mods & (1 | 4 | 8))) return [`u ${key.codePointAt(0)}`];
    if ([...key].length === 1) return [`kc ${key.codePointAt(0)} ${mods}`];
    const vk = VK[key];
    return vk ? [`k ${vk} ${mods} ${EXTENDIDA.has(vk) ? 1 : 0}`] : [];
  }
  return [];
}

// ── Lo que la página /escritorio le puede pedir a la app ─────────────────
const esDealFlow = (e) => { try { return new URL(e.senderFrame?.url || e.sender.getURL()).origin === ORIGEN; } catch { return false; } };
ipcMain.on('info', (e) => {
  e.returnValue = esDealFlow(e) ? { version: app.getVersion(), so: `Windows ${os.release()}`, equipo: os.hostname() } : null;
});
ipcMain.handle('pantalla', (e) => {
  if (!esDealFlow(e)) return null;
  const d = screen.getPrimaryDisplay();
  return { w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), escala: d.scaleFactor };
});
ipcMain.on('entrada', (e, a) => { if (esDealFlow(e) && sesionActiva) for (const l of traducir(a)) entrada.enviar(l); });
ipcMain.on('modoSesion', (e, activo, quien) => { if (esDealFlow(e)) { modoSesion(activo, quien); if (activo) entrada.preparar(); } });
ipcMain.on('mostrar', (e) => { if (esDealFlow(e)) mostrar(); });
ipcMain.on('avisar', (e, t, c) => { if (esDealFlow(e)) avisar(String(t).slice(0, 80), String(c).slice(0, 200)); });
ipcMain.handle('inicioAutomatico', (e, activo) => { if (!esDealFlow(e)) return false; const r = inicioAutomatico(activo); actualizarBandeja(); return r; });

app.whenReady().then(() => {
  // La pantalla se comparte SOLO durante una sesión que la tienda permitió, y SOLO a DealFlow.
  session.defaultSession.setDisplayMediaRequestHandler((req, responder) => {
    let ok = false; try { ok = new URL(req.frame?.url || '').origin === ORIGEN; } catch { /* nada */ }
    if (!ok || !sesionActiva) { responder({}); return; }
    desktopCapturer.getSources({ types: ['screen'] }).then((fuentes) => {
      const prim = String(screen.getPrimaryDisplay().id);
      responder({ video: fuentes.find((f) => f.display_id === prim) || fuentes[0] });
    }).catch(() => responder({}));
  });
  // Permisos: notificaciones y portapapeles de DealFlow; nada más.
  session.defaultSession.setPermissionRequestHandler((wc, permiso, cb) => {
    let ok = false; try { ok = new URL(wc.getURL()).origin === ORIGEN; } catch { /* nada */ }
    cb(ok && ['notifications', 'clipboard-sanitized-write', 'display-capture'].includes(permiso));
  });
  const oculta = process.argv.includes('--oculto');
  crearVentana(oculta);
  bandeja = new Tray(nativeImage.createFromPath(recurso('bandeja.png')));
  bandeja.on('click', mostrar);
  actualizarBandeja();
  // La primera vez queda para abrir con Windows (así soporte la encuentra en línea); se quita en la bandeja.
  try {
    const marca = path.join(app.getPath('userData'), 'primer-inicio.txt');
    const fs = require('node:fs');
    if (!fs.existsSync(marca)) { inicioAutomatico(true); fs.writeFileSync(marca, new Date().toISOString()); actualizarBandeja(); }
  } catch { /* nada */ }
});
app.on('second-instance', mostrar);
app.on('before-quit', () => { saliendo = true; entrada.parar(); });
app.on('window-all-closed', () => { /* sigue en la bandeja */ });
