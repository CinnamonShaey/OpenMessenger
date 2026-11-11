# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CinnamonShaey
#
# OpenMessenger installer customisations (electron-builder NSIS "include").
# Goal: the installed app stays self-contained. App + data live in ONE folder,
# updates never touch your data, and uninstalling leaves nothing behind.

# ---------------------------------------------------------------- folder page text
!define MUI_DIRECTORYPAGE_TEXT_TOP "OpenMessenger keeps everything in this one folder: the app itself and your data (login, settings, themes and sounds). Nothing is spread around your system.$\r$\n$\r$\nPlease don't choose Program Files. It's write-protected, so OpenMessenger couldn't keep its data next to itself there."

# ---------------------------------------------------------------- block protected folders
# Runs right after the folder page. Program Files / Windows need admin rights,
# which this per-user installer doesn't have, and would break portability.
!macro customPageAfterChangeDir
  Page custom omCheckInstallDir

  Function omCheckInstallDir
    StrCpy $R9 "0"
    ${StrContains} $0 "$PROGRAMFILES64" "$INSTDIR"
    StrCmp $0 "" +2
      StrCpy $R9 "1"
    ${StrContains} $0 "$PROGRAMFILES32" "$INSTDIR"
    StrCmp $0 "" +2
      StrCpy $R9 "1"
    ${StrContains} $0 "$WINDIR" "$INSTDIR"
    StrCmp $0 "" +2
      StrCpy $R9 "1"

    StrCmp $R9 "1" 0 omDirOk
      MessageBox MB_OK|MB_ICONEXCLAMATION "That folder is protected by Windows (Program Files or Windows).$\r$\n$\r$\nOpenMessenger needs a folder it can write to, so it can keep your login and settings next to the app. Please choose another folder, for example:$\r$\n$\r$\n$LOCALAPPDATA\Programs\OpenMessenger$\r$\nor a folder on another drive, like D:\Apps\OpenMessenger." /SD IDOK
      SendMessage $HWNDPARENT 0x408 -1 0 ; back to the folder page
    omDirOk:
    Abort ; this page has no UI of its own
  FunctionEnd
!macroend

# ---------------------------------------------------------------- uninstall / update
# Real uninstall (not an update): offer to delete the data folder, and remove the
# small registry entries the app itself created.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    IfFileExists "$INSTDIR\data\*.*" 0 omNoData
      MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your OpenMessenger data?$\r$\n$\r$\nThis is your login, settings, themes and sounds, in:$\r$\n$INSTDIR\data$\r$\n$\r$\nChoose No to keep it for a later reinstall." /SD IDNO IDNO omNoData
        RMDir /r "$INSTDIR\data"
    omNoData:
    DeleteRegKey HKCU "Software\Classes\AppUserModelId\${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenMessenger"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "OpenMessenger"
  ${endIf}
!macroend

# Remove the program files but never the data folder (updates and uninstalls).
!macro customRemoveFiles
  SetOutPath $TEMP
  FindFirst $R0 $R1 "$INSTDIR\*.*"
  omRemoveLoop:
    StrCmp $R1 "" omRemoveDone
    StrCmp $R1 "." omRemoveNext
    StrCmp $R1 ".." omRemoveNext
    StrCmp $R1 "data" omRemoveNext
    IfFileExists "$INSTDIR\$R1\*.*" 0 omRemoveFile
      RMDir /r "$INSTDIR\$R1"
      Goto omRemoveNext
    omRemoveFile:
      Delete "$INSTDIR\$R1"
  omRemoveNext:
    FindNext $R0 $R1
    Goto omRemoveLoop
  omRemoveDone:
  FindClose $R0
  RMDir "$INSTDIR" ; only removed if empty (i.e. data was deleted or never existed)
!macroend
