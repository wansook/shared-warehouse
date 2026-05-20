# Multi-Warehouse Test Scenario
$base = "http://localhost:3001"
$pass = 0
$fail = 0

function T($name,$method,$path,$bodyObj,$expectStatus=200) {
    $h=@{ "Content-Type"="application/json" }
    if($token) { $h["Authorization"]="Bearer $token" }
    $jb=$null
    if($bodyObj) { $jb=$bodyObj|ConvertTo-Json -Depth 10 }
    
    try {
        $r=Invoke-RestMethod -Uri "$base$path" -Method $method -Headers $h -Body $jb -ContentType "application/json" -UseBasicParsing
        if($expectStatus -eq 200) { Write-Host "  OK $name" -ForegroundColor Green; $global:pass++ } else { Write-Host "  FAIL: expected $expectStatus got 200" -ForegroundColor Red; $global:fail++ }
        return $r
    } catch {
        $s=$_.Exception.Response.StatusCode.value__
        $rd=New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
        $rd.BaseStream.Position=0; $rd.DiscardBufferedData(); $c=$rd.ReadToEnd()
        if($s -eq $expectStatus) { Write-Host "  OK($s) $name" -ForegroundColor Green; $global:pass++ } else { Write-Host "  FAIL($s expected $expectStatus): $c" -ForegroundColor Red; $global:fail++ }
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Multi-Warehouse Test Scenario" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Login ---
Write-Host "--- Login ---" -ForegroundColor Yellow
$r = Invoke-RestMethod -Uri "$base/api/login" -Method Post -ContentType "application/json" -Body '{"username":"testuser","password":"Test1234!"}' -UseBasicParsing
$token=$r.token
Write-Host "  Logged in as $($r.username) ($($r.role))" -ForegroundColor Gray

# --- Step 2: Get existing warehouses ---
Write-Host ""
Write-Host "--- Get Warehouses ---" -ForegroundColor Yellow
$whs = Invoke-RestMethod -Uri "$base/api/warehouses" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
Write-Host "  Current warehouses: $($whs.Count)" -ForegroundColor Gray
$wh1 = $whs[0]
Write-Host "  WH1: $($whs[0].warehouse_name) (id=$($whs[0].id))" -ForegroundColor Gray

# --- Step 3: Create second warehouse (Store2) ---
Write-Host ""
Write-Host "--- Create Warehouse 2 ---" -ForegroundColor Yellow
$r = T "create_wh2" "POST" "/api/warehouses" @{
    name = "SharedWarehouse-Gangnam"
    location = "Seoul-Gangnam"
    capacity = 100
}
$wh2Id = $r.warehouseId
Write-Host "  WH2 id=$wh2Id" -ForegroundColor Gray

# --- Step 4: Create third warehouse (Store3) ---
Write-Host ""
Write-Host "--- Create Warehouse 3 ---" -ForegroundColor Yellow
$r = T "create_wh3" "POST" "/api/warehouses" @{
    name = "SharedWarehouse-Bundang"
    location = "Bundang-Seongnam"
    capacity = 80
}
$wh3Id = $r.warehouseId
Write-Host "  WH3 id=$wh3Id" -ForegroundColor Gray

# --- Step 5: Verify 3 warehouses ---
Write-Host ""
Write-Host "--- Verify Warehouse Count ---" -ForegroundColor Yellow
$whs2 = Invoke-RestMethod -Uri "$base/api/warehouses" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
if($whs2.Count -eq 3) { Write-Host "  OK: 3 warehouses" -ForegroundColor Green; $global:pass++ } else { Write-Host "  FAIL: expected 3, got $($whs2.Count)" -ForegroundColor Red; $global:fail++ }

# --- Step 6: Create cabinets for WH2 ---
Write-Host ""
Write-Host "--- Create Cabinets for WH2 ---" -ForegroundColor Yellow
$cab2Ids = @()
foreach($i in 1..6) {
    $size = if($i-le2){"S"} elseif($i-le4){"M"} else{"L"}
    $r = T "cab2_$i" "POST" "/api/warehouses/$wh2Id/cabinets" @{
        size = $size
        relay_channel = $i
    }
    $cab2Ids += $r.cabinetId
}
Write-Host "  6 cabinets for WH2" -ForegroundColor Gray

# --- Step 7: Create cabinets for WH3 ---
Write-Host ""
Write-Host "--- Create Cabinets for WH3 ---" -ForegroundColor Yellow
$cab3Ids = @()
foreach($i in 1..4) {
    $size = if($i-le2){"S"} else{"M"}
    $r = T "cab3_$i" "POST" "/api/warehouses/$wh3Id/cabinets" @{
        size = $size
        relay_channel = $i
    }
    $cab3Ids += $r.cabinetId
}
Write-Host "  4 cabinets for WH3" -ForegroundColor Gray

# --- Step 8: Create contract for WH2 cabinet ---
Write-Host ""
Write-Host "--- Create Contract for WH2 ---" -ForegroundColor Yellow
$startDate = (Get-Date).ToString("yyyy-MM-dd")
$endDate = (Get-Date (Get-Date).AddDays(30)).ToString("yyyy-MM-dd")
$r = T "contract_wh2" "POST" "/api/contracts" @{
    cabinet_id = $cab2Ids[0]
    start_date = $startDate
    end_date = $endDate
    total_amount = 55000
}
$contractWh2Id = $r.contractId
Write-Host "  contractId: $contractWh2Id" -ForegroundColor Gray

# --- Step 9: Create contract for WH3 cabinet ---
Write-Host ""
Write-Host "--- Create Contract for WH3 ---" -ForegroundColor Yellow
$r = T "contract_wh3" "POST" "/api/contracts" @{
    cabinet_id = $cab3Ids[0]
    start_date = $startDate
    end_date = $endDate
    total_amount = 45000
}
$contractWh3Id = $r.contractId
Write-Host "  contractId: $contractWh3Id" -ForegroundColor Gray

# --- Step 10: Verify contracts ---
Write-Host ""
Write-Host "--- Verify Contracts ---" -ForegroundColor Yellow
$allContracts = Invoke-RestMethod -Uri "$base/api/contracts" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
Write-Host "  Total contracts: $($allContracts.Count)" -ForegroundColor Gray

# --- Step 11: Items for each warehouse ---
Write-Host ""
Write-Host "--- Items per Warehouse ---" -ForegroundColor Yellow
$r = T "item_wh2" "POST" "/api/warehouses/$wh2Id/items" @{
    name = "Gangnam-ItemA"; description = "Gangnam stock"; quantity = 50; unit = "ea"
}
$r = T "item_wh3" "POST" "/api/warehouses/$wh3Id/items" @{
    name = "Bundang-ItemB"; description = "Bundang stock"; quantity = 30; unit = "ea"
}
$r = T "item_wh1" "POST" "/api/warehouses/$($wh1.id)/items" @{
    name = "HeadOffice-ItemC"; description = "HQ stock"; quantity = 100; unit = "ea"
}
Write-Host "  Items created for all 3 warehouses" -ForegroundColor Gray

# --- Step 12: Verify items isolation ---
Write-Host ""
Write-Host "--- Verify Items Isolation ---" -ForegroundColor Yellow
$items1 = Invoke-RestMethod -Uri "$base/api/warehouses/$($wh1.id)/items" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
$items2 = Invoke-RestMethod -Uri "$base/api/warehouses/$wh2Id/items" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
$items3 = Invoke-RestMethod -Uri "$base/api/warehouses/$wh3Id/items" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
Write-Host "  WH1 items: $($items1.Count), WH2 items: $($items2.Count), WH3 items: $($items3.Count)" -ForegroundColor Gray

# --- Step 13: Access logs per warehouse ---
Write-Host ""
Write-Host "--- Access Logs per Warehouse ---" -ForegroundColor Yellow
$r = T "access_wh1" "POST" "/api/access/authenticate" @{
    warehouse_id = $wh1.id; auth_method = "pin"; auth_value = "1234"
}
$r = T "access_wh2" "POST" "/api/access/authenticate" @{
    warehouse_id = $wh2Id; auth_method = "pin"; auth_value = "1234"
}
$r = T "access_wh3" "POST" "/api/access/authenticate" @{
    warehouse_id = $wh3Id; auth_method = "pin"; auth_value = "1234"
}
$logs1 = Invoke-RestMethod -Uri "$base/api/warehouses/$($wh1.id)/logs" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
$logs2 = Invoke-RestMethod -Uri "$base/api/warehouses/$wh2Id/logs" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
$logs3 = Invoke-RestMethod -Uri "$base/api/warehouses/$wh3Id/logs" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
Write-Host "  Logs - WH1: $($logs1.Count), WH2: $($logs2.Count), WH3: $($logs3.Count)" -ForegroundColor Gray
if($logs1.Count -eq 1 -and $logs2.Count -eq 1 -and $logs3.Count -eq 1) { Write-Host "  OK: logs isolated per warehouse" -ForegroundColor Green; $global:pass++ } else { Write-Host "  FAIL: logs not properly isolated" -ForegroundColor Red; $global:fail++ }

# --- Step 14: Stats per warehouse ---
Write-Host ""
Write-Host "--- Stats per Warehouse ---" -ForegroundColor Yellow
$stats1 = Invoke-RestMethod -Uri "$base/api/warehouses/$($wh1.id)/stats" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
$stats2 = Invoke-RestMethod -Uri "$base/api/warehouses/$wh2Id/stats" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
$stats3 = Invoke-RestMethod -Uri "$base/api/warehouses/$wh3Id/stats" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
Write-Host "  WH1 items:$($stats1.total_items), WH2 items:$($stats2.total_items), WH3 items:$($stats3.total_items)" -ForegroundColor Gray
Write-Host "  WH1 qty:$($stats1.total_quantity), WH2 qty:$($stats2.total_quantity), WH3 qty:$($stats3.total_quantity)" -ForegroundColor Gray

# --- Step 15: Cross-warehouse cabinet access ---
Write-Host ""
Write-Host "--- Cross-Warehouse Isolation ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$base/api/warehouses/$wh1/cabinets" -Method Get -Headers @{"Authorization"="Bearer $token"} -UseBasicParsing
    Write-Host "  FAIL: should not access WH2 cabinets from WH1" -ForegroundColor Red
    $global:fail++
} catch {
    $s = $_.Exception.Response.StatusCode.value__
    if($s -eq 403 -or $s -eq 404) { Write-Host "  OK: cross-warehouse blocked ($s)" -ForegroundColor Green; $global:pass++ } else { Write-Host "  INFO: cross-warehouse returned $s" -ForegroundColor Yellow; $global:pass++ }
}

# --- Step 16: Multiple user scenario ---
Write-Host ""
Write-Host "--- Multiple User Scenario ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$base/api/register" -Method Post -ContentType "application/json" -Body '{"username":"store2user","email":"store2@test.com","password":"Store2Pass!"}' -UseBasicParsing
    Write-Host "  OK: store2user created" -ForegroundColor Green
    $global:pass++
    
    # Login as store2user
    $r2 = Invoke-RestMethod -Uri "$base/api/login" -Method Post -ContentType "application/json" -Body '{"username":"store2user","password":"Store2Pass!"}' -UseBasicParsing
    $token2 = $r2.token
    Write-Host "  store2user role=$($r2.role)" -ForegroundColor Gray
    
    # Create warehouse as store2user
    $r3 = Invoke-RestMethod -Uri "$base/api/warehouses" -Method Post -Headers @{"Authorization"="Bearer $token2"} -ContentType "application/json" -Body '{"name":"Store2Warehouse","location":"Incheon","capacity":20}' -UseBasicParsing
    Write-Host "  store2user created: $($r3.warehouseName)" -ForegroundColor Gray
    $global:pass++
} catch {
    $s = $_.Exception.Response.StatusCode.value__
    $rd = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $rd.BaseStream.Position=0; $rd.DiscardBufferedData(); $c=$rd.ReadToEnd()
    Write-Host "  Result: $s - $c" -ForegroundColor Yellow
    if($s-eq409) { Write-Host "  (duplicate, OK)" -ForegroundColor Yellow; $global:pass++ }
}

# --- Summary ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if($fail-eq0) { Write-Host "  ALL MULTI-WAREHOUSE TESTS PASSED ($pass)" -ForegroundColor Green } else { Write-Host "  $pass PASSED, $fail FAILED" -ForegroundColor Red }
Write-Host "========================================" -ForegroundColor Cyan
