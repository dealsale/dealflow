/**
 * Después de empaquetar (antes de armar el instalador): pone el ícono y los datos de DealFlow
 * en el .exe. Se hace con resedit (JavaScript puro) porque desde Linux no hay rcedit/Wine.
 */
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function iconoExe(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  // Los dos paquetes son ES modules: desde CommonJS se cargan con load().
  const PELibrary = await require('pe-library/cjs').load();
  const ResEdit = await require('resedit/cjs').load();
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const ico = path.join(__dirname, '..', 'recursos', 'icono.ico');
  const ejecutable = PELibrary.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = PELibrary.NtExecutableResource.from(ejecutable);
  const iconos = ResEdit.Data.IconFile.from(fs.readFileSync(ico)).icons.map((i) => i.data);
  const grupos = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const grupo = grupos[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, grupo ? grupo.id : 1, grupo ? grupo.lang : 1033, iconos);
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const [a, b, c] = String(ctx.packager.appInfo.version).split('.').map((x) => Number(x) || 0);
    const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
    vi.setFileVersion(a, b, c, 0, lang.lang);
    vi.setProductVersion(a, b, c, 0, lang.lang);
    vi.setStringValues(lang, {
      FileDescription: 'DealFlow Soporte', ProductName: 'DealFlow Soporte', CompanyName: 'DealFlow',
      LegalCopyright: 'DealFlow', OriginalFilename: 'DealFlow Soporte.exe', InternalName: 'DealFlow Soporte',
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(ejecutable);
  fs.writeFileSync(exe, Buffer.from(ejecutable.generate()));
  console.log(`  • ícono y datos de DealFlow puestos en ${path.basename(exe)}`);
};
