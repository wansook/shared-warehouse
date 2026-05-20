# New API Test Script (PIN 수정, 레이아웃, 다중계약, 빌링)
$base = "http://localhost:3001"
$pass = 0
$fail = 0

function Test-Api($name, $method, $path, $bodyObj, $expectedCode, $authToken) {
    $url = "$base$path"
    $headers = @{}
    if ($authToken) { $headers["Authorization"] = "Bearer $authToken" }
    $jsonBody = $null
    if ($bodyObj) { $jsonBody = $bodyObj | ConvertTo-Json -Depth 10 }
    
    try {
        $r = Invoke-RestMethod -Uri $url -Method $method -Headers $headers -Body $jsonBody -ContentType "application/json" -UseBasicParsing
        if ($expectedCode -eq $null -or $r) {
            Write-Host "  PASS: $name" -ForegroundColor Green
            $global:pass++
        } else {
            Write-Host "  FAIL: $name (unexpected result)" -ForegroundColor Red
            $global:fail++
        }
        return $r
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        try {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $content = $reader.ReadToEnd()
        } catch { $content = "no body" }
        
        if ($expectedCode -and $statusCode -eq $expectedCode) {
            Write-Host "  PASS: $name (expected $statusCode)" -ForegroundColor Green
            $global:pass++
            return $null
        } else {
            Write-Host "  FAIL: $name (got $statusCode, expected $expectedCode) - $content" -ForegroundColor Red
            $global:fail++
            return $null
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  New API Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Register admin user (first user = admin)
Write-Host "--- 1. Register Admin ---" -ForegroundColor Yellow
$r = Test-Api "register_admin" "POST" "/api/register" @{
    username = "admin_user"
    email = "admin@test.com"
    password = "Admin1234!"
    phone = "01011112222"
    pin_code = "1111"
}
Start-Sleep 1

# 2. Login as admin
Write-Host ""
Write-Host "--- 2. Admin Login ---" -ForegroundColor Yellow
$r2 = Test-Api "admin_login" "POST" "/api/login" @{
    username = "admin_user"
    password = "Admin1234!"
}
$adminToken = $r2.token
Write-Host "  role: $($r2.user.role)" -ForegroundColor Gray
Write-Host "  token length: $($adminToken.Length)" -ForegroundColor Gray
Start-Sleep 1

# 3. Register second user
Write-Host ""
Write-Host "--- 3. Register Customer ---" -ForegroundColor Yellow
$r3 = Test-Api "register_customer" "POST" "/api/register" @{
    username = "customer1"
    email = "cust1@test.com"
    password = "Cust1234!"
    phone = "01033334444"
    pin_code = "4444"
}
Start-Sleep 1

# 4. Register third user
Write-Host ""
Write-Host "--- 4. Register Customer2 ---" -ForegroundColor Yellow
$r4 = Test-Api "register_customer2" "POST" "/api/register" @{
    username = "customer2"
    email = "cust2@test.com"
    password = "Cust5678!"
    phone = "01055556666"
    pin_code = "5555"
}
Start-Sleep 1

# 5. Get user list (admin only)
Write-Host ""
Write-Host "--- 5. Admin User List ---" -ForegroundColor Yellow
Write-Host "  using token: $($adminToken.Substring(0, 30))..." -ForegroundColor DarkGray
$r5 = Test-Api "admin_user_list" "GET" "/api/admin/users" $null $null $adminToken
Write-Host "  users count: $($r5.Count)" -ForegroundColor Gray
Start-Sleep 1

# 6. PIN change (4444 -> 9999) for user 2
Write-Host ""
Write-Host "--- 6. PIN Change (4444->9999) ---" -ForegroundColor Yellow
$r6 = Test-Api "pin_change" "PUT" "/api/admin/users/2/pin" @{
    new_pin = "9999"
} $null $adminToken
Write-Host "  newPin: $($r6.newPin)" -ForegroundColor Gray
Start-Sleep 1

# 7. PIN reset (random) for user 3
Write-Host ""
Write-Host "--- 7. PIN Reset (random) ---" -ForegroundColor Yellow
$r7 = Test-Api "pin_reset" "PUT" "/api/admin/users/3/pin" @{
    reset = $true
} $null $adminToken
Write-Host "  newPin: $($r7.newPin)" -ForegroundColor Gray
Start-Sleep 1

# 8. Verify PIN change in login
Write-Host ""
Write-Host "--- 8. Verify PIN Change (customer1 login with 9999) ---" -ForegroundColor Yellow
$r8 = Test-Api "verify_pin" "POST" "/api/login" @{
    username = "customer1"
    password = "Cust1234!"
}
Write-Host "  login success: $([bool]$r8.token)" -ForegroundColor Gray
Start-Sleep 1

# 9. Invalid PIN change (< 4 digits)
Write-Host ""
Write-Host "--- 9. Invalid PIN (too short) ---" -ForegroundColor Yellow
Test-Api "invalid_pin_short" "PUT" "/api/admin/users/2/pin" @{
    new_pin = "12"
} 400 $adminToken
Start-Sleep 1

# 10. Invalid PIN (non-numeric)
Write-Host ""
Write-Host "--- 10. Invalid PIN (non-numeric) ---" -ForegroundColor Yellow
Test-Api "invalid_pin_text" "PUT" "/api/admin/users/2/pin" @{
    new_pin = "abcd"
} 400 $adminToken
Start-Sleep 1

# 11. Create Warehouse for layout testing
Write-Host ""
Write-Host "--- 11. Create Warehouse ---" -ForegroundColor Yellow
$r11 = Test-Api "create_warehouse" "POST" "/api/warehouses" @{
    name = "LayoutTestWarehouse"
    location = "Test Location"
    capacity = 30
} $null $adminToken
$warehouseId = $r11.warehouseId
Write-Host "  warehouseId: $warehouseId" -ForegroundColor Gray
Start-Sleep 1

# 12. Create cabinet with position
Write-Host ""
Write-Host "--- 12. Create Cabinet (with position) ---" -ForegroundColor Yellow
$r12 = Test-Api "cabinet_with_pos" "POST" "/api/warehouses/$warehouseId/cabinets" @{
    size = "M"
    relay_channel = 1
    position_x = 100
    position_y = 200
    position_index = 0
} $null $adminToken
$cabinetId = $r12.cabinetId
Write-Host "  cabinetId: $cabinetId" -ForegroundColor Gray
Start-Sleep 1

# 13. Layout save
Write-Host ""
Write-Host "--- 13. Save Layout ---" -ForegroundColor Yellow
$layoutData = @{
    warehouse_id = $warehouseId
    columns = 4
    rows = 5
    cabinets = @(
        @{ id = $cabinetId; x = 100; y = 200; size = "M" }
    )
}
$r13 = Test-Api "save_layout" "PUT" "/api/warehouses/$warehouseId/layout" @{
    layout_data = $layoutData
} $null $adminToken
Start-Sleep 1

# 14. Layout get
Write-Host ""
Write-Host "--- 14. Get Layout ---" -ForegroundColor Yellow
$r14 = Test-Api "get_layout" "GET" "/api/warehouses/$warehouseId/layout" $null $null $adminToken
Write-Host "  layout columns: $($r14.columns)" -ForegroundColor Gray
Start-Sleep 1

# 15. Update cabinet position (drag-drop)
Write-Host ""
Write-Host "--- 15. Update Cabinet Position ---" -ForegroundColor Yellow
$r15 = Test-Api "update_position" "PUT" "/api/cabinets/$cabinetId/layout" @{
    position_x = 150
    position_y = 250
    position_index = 1
} $null $adminToken
Start-Sleep 1

# 16. Multi-contract test (same user, different cabinet)
Write-Host ""
Write-Host "--- 16. Create Cabinet2 ---" -ForegroundColor Yellow
$r16a = Test-Api "cabinet2" "POST" "/api/warehouses/$warehouseId/cabinets" @{
    size = "S"
    relay_channel = 2
} $null $adminToken
$cabinetId2 = $r16a.cabinetId
Start-Sleep 1

Write-Host ""
Write-Host "--- 17. Multi-Contract (customer1 gets cabinet2) ---" -ForegroundColor Yellow
$r17 = Test-Api "multi_contract" "POST" "/api/contracts" @{
    user_id = 2
    cabinet_id = $cabinetId2
    start_date = "2026-05-20"
    end_date = "2026-06-20"
    total_amount = 33000
} $null $adminToken
Write-Host "  contractId: $($r17.contractId)" -ForegroundColor Gray
Start-Sleep 1

# 18. Payment with billing_key
Write-Host ""
Write-Host "--- 18. Payment with billing_key ---" -ForegroundColor Yellow
$r18 = Test-Api "payment_billing" "POST" "/api/payments" @{
    contract_id = $r17.contractId
    amount = 33000
    pg_approval_number = "PG20260520001"
    billing_key = "bk_test_12345"
} $null $adminToken
Write-Host "  paymentId: $($r18.paymentId)" -ForegroundColor Gray
Start-Sleep 1

# 19. Unauthenticated admin access (should fail 401)
Write-Host ""
Write-Host "--- 19. Unauth Admin Access ---" -ForegroundColor Yellow
Test-Api "unauth_admin" "GET" "/api/admin/users" $null 401 $null

# 20. Regular user admin access (should fail 403)
Write-Host ""
Write-Host "--- 20. User Admin Access ---" -ForegroundColor Yellow
$userLogin = Test-Api "user_login" "POST" "/api/login" @{
    username = "customer2"
    password = "Cust5678!"
}
$userToken = $userLogin.token
Write-Host "  userToken: $([bool]$userToken)" -ForegroundColor Gray
Test-Api "user_to_admin" "GET" "/api/admin/users" $null 403 $userToken

# 21. Test contract list for multi-contract
Write-Host ""
Write-Host "--- 21. Contract List (admin sees all) ---" -ForegroundColor Yellow
$r21 = Test-Api "contract_list_admin" "GET" "/api/contracts" $null $null $adminToken
Write-Host "  contracts: $($r21.Count)" -ForegroundColor Gray
Start-Sleep 1

# 22. Test customer1 contract list (should see only customer1 contracts)
Write-Host ""
Write-Host "--- 22. Contract List (customer1) ---" -ForegroundColor Yellow
$r22 = Test-Api "contract_list_customer1" "GET" "/api/contracts" $null $null $userToken
Write-Host "  customer contracts: $($r22.Count)" -ForegroundColor Gray
Start-Sleep 1

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($fail -eq 0) {
    Write-Host "  ALL PASSED ($pass tests)" -ForegroundColor Green
} else {
    Write-Host "  $pass PASSED, $fail FAILED" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
