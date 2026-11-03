/**
 * Puente entre la página /escritorio de DealFlow y la app. Solo se expone en DealFlow
 * (el proceso principal vuelve a revisar el origen en cada pedido).
 */
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('info');
if (info) {
  contextBridge.exposeInMainWorld('dealflowSoporte', {
    version: info.version,
    so: info.so,
    equipo: info.equipo,
    pantalla: () => ipcRenderer.invoke('pantalla'),
    entrada: (a) => ipcRenderer.send('entrada', a),
    modoSesion: (activo, quien) => ipcRenderer.send('modoSesion', !!activo, String(quien || '')),
    mostrar: () => ipcRenderer.send('mostrar'),
    avisar: (titulo, cuerpo) => ipcRenderer.send('avisar', String(titulo || ''), String(cuerpo || '')),
    inicioAutomatico: (activo) => ipcRenderer.invoke('inicioAutomatico', typeof activo === 'boolean' ? activo : undefined),
  });
}
