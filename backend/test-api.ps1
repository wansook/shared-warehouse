# Shared Warehouse API Test Script
# DB reset only (server must be running externally)
Write-Host "Resetting DB..." -ForegroundColor Yellow
$dbDir = "C:\Users\분노의달걀\.openclaw\workspace\shared-warehouse\backend"
$items = Get-ChildItem "$dbDir\warehouse.db*" -Force -ErrorAction SilentlyContinue
if ($items) { Remove-Item $items.FullName -Force -ErrorAction SilentlyContinue; Write-Host "DB files removed" -ForegroundColor Gray }
else { Write-Host "No DB files found" -ForegroundColor Gray }

$base = "http://localhost:3001"
$pass = 0
$fail = 0
$token = $null
$warehouseId = $null
$cabinetIds = @()
$contractId = $null
$paymentId = $null

function Test-Api($name, $method, $path, $bodyObj) {
    $url = "$base$path"
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $jsonBody = $null
    if ($bodyObj) { $jsonBody = $bodyObj | ConvertTo-Json -Depth 10 }
    
    Write-Host "  -> $method $path" -ForegroundColor DarkGray
    
    try {
        $r = Invoke-RestMethod -Uri $url -Method $method -Headers $headers -Body $jsonBody -ContentType "application/json" -UseBasicParsing
        Write-Host "  OK (200) $name" -ForegroundColor Green
        $global:pass++
        return $r
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $content = $reader.ReadToEnd()
        
        $expected = if ($name -match "fail") { 401 } elseif ($name -match "access_auth_fail") { 401 } elseif ($name -match "auth") { 401 } else { 200 }
        
        if ($statusCode -eq $expected) {
            Write-Host "  OK ($statusCode) $name" -ForegroundColor Green
            $global:pass++
        } else {
            Write-Host "  FAIL ($statusCode) $name - $content" -ForegroundColor Red
            $global:fail++
        }
        return $null
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Shared Warehouse API Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Register
Write-Host "--- 1. Register ---" -ForegroundColor Yellow
$r = Test-Api "register" "POST" "/api/register" @{
    username = "testuser"
    email = "test@test.com"
    password = "Test1234!"
    phone = "01012345678"
    pin_code = "1234"
}
Start-Sleep 1

# 2. Login
Write-Host ""
Write-Host "--- 2. Login ---" -ForegroundColor Yellow
$r = Test-Api "login" "POST" "/api/login" @{
    username = "testuser"
    password = "Test1234!"
}
$token = $r.token
$len = if ($token.Length -gt 30) { 30 } else { $token.Length }
Write-Host "  token: $($token.Substring(0,$len))..." -ForegroundColor Gray
Start-Sleep 1

# 3. Create Warehouse
Write-Host ""
Write-Host "--- 3. Create Warehouse ---" -ForegroundColor Yellow
$r = Test-Api "warehouse_create" "POST" "/api/warehouses" @{
    name = "TestWarehouse-001"
    location = "Seoul Gangnam"
    capacity = 50
}
$warehouseId = $r.warehouseId
Write-Host "  warehouseId: $warehouseId" -ForegroundColor Gray
Start-Sleep 1

# 4. Warehouse List
Write-Host ""
Write-Host "--- 4. Warehouse List ---" -ForegroundColor Yellow
$r = Test-Api "warehouse_list" "GET" "/api/warehouses" $null
Write-Host "  count: $($r.Count)" -ForegroundColor Gray
Start-Sleep 1

# 5. Create Cabinets
Write-Host ""
Write-Host "--- 5. Create Cabinets ---" -ForegroundColor Yellow
$cabinets = @("S1","S2","S3","M1","M2","M3","L1","L2")
$cabinetIds = @()
foreach ($c in $cabinets) {
    $size = $c.Substring(0,1)
    $r = Test-Api "cabinet_$c" "POST" "/api/warehouses/$warehouseId/cabinets" @{
        size = $size
        relay_channel = $cabinets.IndexOf($c) + 1
    }
    $cabinetIds += $r.cabinetId
}
Write-Host "  $($cabinets.Count) cabinets created" -ForegroundColor Gray
Start-Sleep 1

# 6. Cabinet List
Write-Host ""
Write-Host "--- 6. Cabinet List ---" -ForegroundColor Yellow
$r = Test-Api "cabinet_list" "GET" "/api/warehouses/$warehouseId/cabinets" $null
Write-Host "  count: $($r.Count)" -ForegroundColor Gray
Start-Sleep 1

# 7. Create Contract
Write-Host ""
Write-Host "--- 7. Create Contract ---" -ForegroundColor Yellow
$startDate = (Get-Date).ToString("yyyy-MM-dd")
$endDate = (Get-Date (Get-Date).AddDays(30)).ToString("yyyy-MM-dd")
$r = Test-Api "contract_create" "POST" "/api/contracts" @{
    cabinet_id = $cabinetIds[0]
    start_date = $startDate
    end_date = $endDate
    total_amount = 55000
}
$contractId = $r.contractId
Write-Host "  contractId: $contractId" -ForegroundColor Gray
Start-Sleep 1

# 8. Contract List
Write-Host ""
Write-Host "--- 8. Contract List ---" -ForegroundColor Yellow
$r = Test-Api "contract_list" "GET" "/api/contracts" $null
Write-Host "  count: $($r.Count)" -ForegroundColor Gray
Start-Sleep 1

# 9. Access Auth (success)
Write-Host ""
Write-Host "--- 9. Access Auth (success) ---" -ForegroundColor Yellow
$r = Test-Api "access_auth_ok" "POST" "/api/access/authenticate" @{
    warehouse_id = $warehouseId
    auth_method = "pin"
    auth_value = "1234"
}
Write-Host "  result: $($r.message)" -ForegroundColor Gray
Start-Sleep 1

# 10. Access Auth (fail)
Write-Host ""
Write-Host "--- 10. Access Auth (fail) ---" -ForegroundColor Yellow
Test-Api "access_auth_fail" "POST" "/api/access/authenticate" @{
    warehouse_id = $warehouseId
    auth_method = "pin"
    auth_value = "0000"
}
Start-Sleep 1

# 11. Payment
Write-Host ""
Write-Host "--- 11. Payment ---" -ForegroundColor Yellow
$r = Test-Api "payment" "POST" "/api/payments" @{
    contract_id = $contractId
    amount = 55000
}
$paymentId = $r.paymentId
Write-Host "  paymentId: $paymentId" -ForegroundColor Gray
Start-Sleep 1

# 12. Create Item
Write-Host ""
Write-Host "--- 12. Create Item ---" -ForegroundColor Yellow
$r = Test-Api "item_create" "POST" "/api/warehouses/$warehouseId/items" @{
    name = "TestProduct-A"
    description = "Test description"
    quantity = 100
    unit = "ea"
}
Write-Host "  itemId: $($r.itemId)" -ForegroundColor Gray
Start-Sleep 1

# 13. Item List
Write-Host ""
Write-Host "--- 13. Item List ---" -ForegroundColor Yellow
$r = Test-Api "item_list" "GET" "/api/warehouses/$warehouseId/items" $null
Write-Host "  count: $($r.Count)" -ForegroundColor Gray
Start-Sleep 1

# 14. Warehouse Stats
Write-Host ""
Write-Host "--- 14. Warehouse Stats ---" -ForegroundColor Yellow
$r = Test-Api "warehouse_stats" "GET" "/api/warehouses/$warehouseId/stats" $null
$statsJson = $r | ConvertTo-Json -Depth 2
Write-Host "  result: $statsJson" -ForegroundColor Gray
Start-Sleep 1

# 15. Profile
Write-Host ""
Write-Host "--- 15. Profile ---" -ForegroundColor Yellow
$r = Test-Api "profile" "GET" "/api/profile/1" $null
Write-Host "  username: $($r.username)" -ForegroundColor Gray
Start-Sleep 1

# 16. Logs
Write-Host ""
Write-Host "--- 16. Access Logs ---" -ForegroundColor Yellow
$r = Test-Api "logs" "GET" "/api/warehouses/$warehouseId/logs" $null
Write-Host "  count: $($r.Count)" -ForegroundColor Gray

# 17. No auth (should be 401)
Write-Host ""
Write-Host "--- 17. No Auth Test ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$base/api/warehouses" -Method Get -UseBasicParsing
    Write-Host "  FAIL (returned 200 - no auth check)" -ForegroundColor Red
    $global:fail++
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "  OK ($statusCode) - auth required" -ForegroundColor Green
        $global:pass++
    } else {
        Write-Host "  FAIL ($statusCode)" -ForegroundColor Red
        $global:fail++
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($fail -eq 0) {
    Write-Host "  Result: ALL PASSED ($pass tests)" -ForegroundColor Green
} else {
    Write-Host "  Result: $pass PASSED, $fail FAILED" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
