#ifndef MyAppVersion
  #define MyAppVersion "1.11.0"
#endif

#define MyAppName "bolt.gives Desktop"
#define MyAppPublisher "bolt.gives"
#define MyAppExeName "BoltGives.Desktop.exe"

[Setup]
AppId={{C3F754E3-4FE4-4B3C-A11D-5ED7D59F82D6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://bolt.gives
AppSupportURL=https://github.com/embire2/bolt.gives/issues
DefaultDirName={autopf}\bolt.gives Desktop
DefaultGroupName=bolt.gives Desktop
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=..\artifacts\installer
OutputBaseFilename=bolt.gives-Desktop-Setup-{#MyAppVersion}-x64
SetupIconFile=..\src\BoltGives.Desktop\Assets\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
CloseApplicationsFilter=BoltGives.Desktop.exe
RestartApplications=no
ChangesAssociations=no
MinVersion=10.0.17763
SetupLogging=yes
UsePreviousAppDir=yes
SetupMutex=bolt.gives.Desktop.Setup

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop icon"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Files]
Source: "..\artifacts\publish\*"; DestDir: "{app}"; Excludes: "*.pdb,*.xml"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\artifacts\prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WebView2RuntimeMissing

[Icons]
Name: "{group}\bolt.gives Desktop"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\bolt.gives Desktop"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing the Microsoft WebView2 Runtime..."; Flags: runhidden waituntilterminated; Check: WebView2RuntimeMissing; AfterInstall: VerifyWebView2Runtime
Filename: "{app}\{#MyAppExeName}"; Description: "Launch bolt.gives Desktop"; Flags: nowait postinstall skipifsilent runasoriginaluser
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Flags: nowait runasoriginaluser; Check: LegacyUpdaterRequestedRestart

[Code]
function LegacyUpdaterRequestedRestart: Boolean;
var
  Index: Integer;
begin
  Result := False;
  for Index := 1 to ParamCount do
  begin
    if CompareText(ParamStr(Index), '/RESTARTAPPLICATIONS') = 0 then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function HasUsableWebView2Version(RootKey: Integer; const SubKey: String): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey, SubKey, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0');
end;

function WebView2RuntimeMissing: Boolean;
var
  ClientKey: String;
begin
  ClientKey := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := not (
    HasUsableWebView2Version(HKCU, ClientKey) or
    HasUsableWebView2Version(HKLM, ClientKey) or
    HasUsableWebView2Version(HKLM, 'Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}')
  );
end;

procedure VerifyWebView2Runtime;
begin
  if WebView2RuntimeMissing then
    RaiseException('Microsoft WebView2 Runtime installation did not complete. Run Setup again after checking the internet connection.');
end;
