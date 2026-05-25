$body = '{"username":"testuser","password":"test1234","email":"test@test.com","phone":"01012345678"}'
try {
  $res = Invoke-RestMethod -Uri http://localhost:3001/api/register -Method POST -ContentType 'application/json' -Body $body
  Write-Host "Register: $($res.message)"
} catch {
  Write-Host "Register error: $_"
}

$body2 = '{"username":"testuser","password":"test1234"}'
try {
  $res2 = Invoke-RestMethod -Uri http://localhost:3001/api/login -Method POST -ContentType 'application/json' -Body $body2
  Write-Host "Login token: $($res2.token)"
} catch {
  Write-Host "Login error: $_"
}
