@echo off
chcp 65001 > nul
rem Liga o servidor do DiscordVtt neste PC. Para desligar, feche esta janela.
rem Endereço local: http://127.0.0.1:8090 . Painel do administrador: http://127.0.0.1:8090/_/
rem Só aceita conexões deste PC: o acesso de fora passa pelo Tailscale Funnel.
cd /d "%~dp0"
set /p VERSAO=<VERSAO

if not exist pocketbase.exe (
  echo Não encontrei o pocketbase.exe nesta pasta.
  echo Baixe o arquivo pocketbase_%VERSAO%_windows_amd64.zip em
  echo https://github.com/pocketbase/pocketbase/releases/tag/v%VERSAO%
  echo e coloque o pocketbase.exe ao lado deste arquivo.
  pause
  exit /b 1
)

for /f "tokens=3" %%v in ('pocketbase.exe --version') do set INSTALADA=%%v
if not "%INSTALADA%"=="%VERSAO%" (
  echo Atenção: o projeto usa o PocketBase %VERSAO%, mas o pocketbase.exe desta pasta é o %INSTALADA%.
  echo Feche esta janela e baixe a versão certa, ou aperte uma tecla para ligar mesmo assim.
  pause
)

echo Servidor do DiscordVtt ligado. Para desligar, feche esta janela.
pocketbase.exe serve --http=127.0.0.1:8090
pause
