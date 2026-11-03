# DealFlow Soporte: ratón y teclado en Windows (SendInput).
# Lo arranca la app solo durante una sesión que la tienda permitió. Lee una orden por línea:
#   m x y            mover (x, y de 0 a 1 sobre la pantalla principal)
#   c x y b          clic (b: 0 izquierdo, 1 rueda, 2 derecho)
#   w x y dx dy      rueda
#   u cp             escribir un carácter (código Unicode)
#   k vk mods ext    tecla especial (Enter, flechas…) con Ctrl=1 Shift=2 Alt=4 Win=8
#   kc cp mods       atajo con letra (p. ej. Ctrl+C)
$ErrorActionPreference = 'Stop'
$codigo = @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;

public static class DfEntrada {
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
  [StructLayout(LayoutKind.Explicit)]
  public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public UNION u; }

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] static extern short VkKeyScanW(char ch);

  const uint INPUT_MOUSE = 0;
  const uint INPUT_KEYBOARD = 1;
  const uint MOVE = 0x0001, LEFTDOWN = 0x0002, LEFTUP = 0x0004, RIGHTDOWN = 0x0008, RIGHTUP = 0x0010;
  const uint MIDDLEDOWN = 0x0020, MIDDLEUP = 0x0040, WHEEL = 0x0800, HWHEEL = 0x1000, ABSOLUTE = 0x8000;
  const uint KEYUP = 0x0002, UNICODE = 0x0004, EXTENDED = 0x0001;

  static void Enviar(List<INPUT> l) { if (l.Count > 0) SendInput((uint)l.Count, l.ToArray(), Marshal.SizeOf(typeof(INPUT))); }
  static INPUT Raton(int x, int y, uint flags, uint data) {
    INPUT i = new INPUT(); i.type = INPUT_MOUSE;
    i.u.mi.dx = x; i.u.mi.dy = y; i.u.mi.mouseData = data; i.u.mi.dwFlags = flags; return i;
  }
  static INPUT Tecla(ushort vk, ushort scan, uint flags) {
    INPUT i = new INPUT(); i.type = INPUT_KEYBOARD;
    i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i;
  }
  // 0–1 → 0–65535 (coordenadas absolutas de la pantalla principal; no dependen de la escala de Windows).
  static int Abs(string v) {
    double d = double.Parse(v, CultureInfo.InvariantCulture);
    if (d < 0) d = 0; if (d > 1) d = 1;
    return (int)Math.Round(d * 65535);
  }
  static readonly ushort[] VKMODS = { 0x11, 0x10, 0x12, 0x5B }; // Ctrl, Shift, Alt, Win
  static void Mods(int m, bool soltar, List<INPUT> l) {
    if (!soltar) { for (int b = 0; b < 4; b++) if ((m & (1 << b)) != 0) l.Add(Tecla(VKMODS[b], 0, 0)); }
    else { for (int b = 3; b >= 0; b--) if ((m & (1 << b)) != 0) l.Add(Tecla(VKMODS[b], 0, KEYUP)); }
  }

  public static void Ejecutar(string linea) {
    if (string.IsNullOrEmpty(linea)) return;
    string[] p = linea.Trim().Split(' ');
    List<INPUT> l = new List<INPUT>();
    switch (p[0]) {
      case "m": {
        l.Add(Raton(Abs(p[1]), Abs(p[2]), MOVE | ABSOLUTE, 0));
        break;
      }
      case "c": {
        int b = int.Parse(p[3], CultureInfo.InvariantCulture);
        uint baja = b == 2 ? RIGHTDOWN : (b == 1 ? MIDDLEDOWN : LEFTDOWN);
        uint sube = b == 2 ? RIGHTUP : (b == 1 ? MIDDLEUP : LEFTUP);
        int cx = Abs(p[1]); int cy = Abs(p[2]);
        l.Add(Raton(cx, cy, MOVE | ABSOLUTE, 0));
        l.Add(Raton(cx, cy, baja | ABSOLUTE, 0));
        l.Add(Raton(cx, cy, sube | ABSOLUTE, 0));
        break;
      }
      case "w": {
        int wx = Abs(p[1]); int wy = Abs(p[2]);
        int dx = int.Parse(p[3], CultureInfo.InvariantCulture); int dy = int.Parse(p[4], CultureInfo.InvariantCulture);
        l.Add(Raton(wx, wy, MOVE | ABSOLUTE, 0));
        if (dy != 0) l.Add(Raton(0, 0, WHEEL, unchecked((uint)(int)Math.Round(-dy * 1.2))));
        if (dx != 0) l.Add(Raton(0, 0, HWHEEL, unchecked((uint)(int)Math.Round(dx * 1.2))));
        break;
      }
      case "u": {
        string s = char.ConvertFromUtf32(int.Parse(p[1], CultureInfo.InvariantCulture));
        foreach (char ch in s) { l.Add(Tecla(0, ch, UNICODE)); l.Add(Tecla(0, ch, UNICODE | KEYUP)); }
        break;
      }
      case "k": {
        ushort vk = ushort.Parse(p[1], CultureInfo.InvariantCulture);
        int m = int.Parse(p[2], CultureInfo.InvariantCulture);
        uint ext = (p.Length > 3 && p[3] == "1") ? EXTENDED : 0;
        Mods(m, false, l); l.Add(Tecla(vk, 0, ext)); l.Add(Tecla(vk, 0, ext | KEYUP)); Mods(m, true, l);
        break;
      }
      case "kc": {
        string s = char.ConvertFromUtf32(int.Parse(p[1], CultureInfo.InvariantCulture));
        int m = int.Parse(p[2], CultureInfo.InvariantCulture);
        short r = VkKeyScanW(s[0]);
        if (r == -1) break;
        ushort vk = (ushort)(r & 0xFF);
        int mm = m | (((r >> 8) & 1) != 0 ? 2 : 0); // la letra necesita Shift en este teclado
        Mods(mm, false, l); l.Add(Tecla(vk, 0, 0)); l.Add(Tecla(vk, 0, KEYUP)); Mods(mm, true, l);
        break;
      }
    }
    Enviar(l);
  }
}
'@
Add-Type -TypeDefinition $codigo -Language CSharp
$lector = [Console]::In
while ($true) {
  $linea = $lector.ReadLine()
  if ($null -eq $linea) { break }
  try { [DfEntrada]::Ejecutar($linea) } catch { [Console]::Error.WriteLine($_.Exception.Message) }
}
