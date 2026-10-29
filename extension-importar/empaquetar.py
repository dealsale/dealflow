"""Empaqueta la extensión en app/public/descargas/dealflow-importar-productos.zip (lo que se descarga desde DealFlow).
Correr después de cambiar cualquier archivo de esta carpeta:  python3 extension-importar/empaquetar.py"""
import os, zipfile
aqui = os.path.dirname(os.path.abspath(__file__))
destino = os.path.join(aqui, '..', 'app', 'public', 'descargas', 'dealflow-importar-productos.zip')
os.makedirs(os.path.dirname(destino), exist_ok=True)
archivos = ['manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.js'] + ['icons/' + x for x in sorted(os.listdir(os.path.join(aqui, 'icons')))]
with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in archivos:
        z.write(os.path.join(aqui, f), 'dealflow-importar-productos/' + f)
print('Listo:', destino)
