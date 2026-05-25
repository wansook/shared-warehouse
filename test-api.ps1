$body = @{username='admin';password='admin1234'} | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Uri http://localhost:3001/api/login -Method POST -ContentType 'application/json' -Body $body
$token = $r.token
$headers = @{ Authorization = "Bearer $token" }
$r2 = Invoke-RestMethod -Uri http://localhost:3001/api/warehouses -Headers $headers
$r2 | ConvertTo-Json -Depth 3
echo "Warehouses count: $($r2.count)"
