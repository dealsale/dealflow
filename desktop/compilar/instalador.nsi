; Instalador de DealFlow Soporte (Windows, sin permisos de administrador).
; Se compila desde Linux con makensis (ver compilar/instalador.sh).
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define NOMBRE "DealFlow Soporte"
!define EXE "DealFlow Soporte.exe"
!define CLAVE_DESINSTALAR "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealFlowSoporte"

Name "${NOMBRE}"
OutFile "..\dist\DealFlowSoporte-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\DealFlow Soporte"
RequestExecutionLevel user
BrandingText "DealFlow"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${NOMBRE}"
VIAddVersionKey "CompanyName" "DealFlow"
VIAddVersionKey "FileDescription" "Instalador de ${NOMBRE}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "DealFlow"

!define MUI_ICON "..\recursos\icono.ico"
!define MUI_UNICON "..\recursos\icono.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir DealFlow Soporte"
!define MUI_WELCOMEPAGE_TITLE "DealFlow Soporte"
!define MUI_WELCOMEPAGE_TEXT "Con esta app, el equipo de DealFlow te puede ayudar en tu computador.$\r$\n$\r$\nNadie puede ver ni manejar tu computador sin que tú lo permitas cada vez, y lo detienes cuando quieras.$\r$\n$\r$\nToca Instalar para continuar."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Section "Instalar"
  ; Si ya estaba abierta (actualización), se cierra para poder reemplazarla.
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "..\dist\win-unpacked\*"
  WriteUninstaller "$INSTDIR\Desinstalar DealFlow Soporte.exe"
  CreateShortCut "$SMPROGRAMS\DealFlow Soporte.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$DESKTOP\DealFlow Soporte.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayName" "${NOMBRE}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "Publisher" "DealFlow"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "UninstallString" '"$INSTDIR\Desinstalar DealFlow Soporte.exe"'
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "NoModify" 1
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Sleep 800
  Delete "$SMPROGRAMS\DealFlow Soporte.lnk"
  Delete "$DESKTOP\DealFlow Soporte.lnk"
  ; Que no vuelva a abrir con Windows.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.DealFlow Soporte"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DealFlow Soporte"
  DeleteRegKey HKCU "${CLAVE_DESINSTALAR}"
  RMDir /r "$INSTDIR"
SectionEnd
