# New API Test Script (PIN 수정, 레이아웃, 다중계약, 빌링)
# 자동 DB 초기화
Write-Host '
[DB 초기화] 시작...' -ForegroundColor Yellow
 = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { .CommandLine -like '*server.js*' }
if () { Stop-Process -Id .Id -Force; Start-Sleep 2; Write-Host '[DB 초기화] 서버 중지됨' -ForegroundColor Gray }
 = Join-Path  'warehouse.db*'
if (Test-Path ) { Remove-Item  -Force -Recurse; Write-Host '[DB 초기화] DB 삭제됨' -ForegroundColor Gray } else { Write-Host '[DB 초기화] DB 없음' -ForegroundColor Gray }
Write-Host '[DB 초기화] 서버 재시작...' -ForegroundColor Yellow
 = Start-Process -FilePath 'node' -ArgumentList 'server.js' -PassThru -NoNewWindow
Start-Sleep 3
Write-Host '[DB 초기화] 서버 재시작됨 (PID: )' -ForegroundColor Green
Start-Sleep 2
 = 'http://localhost:3001'
 = 0
 = 0
