$dir = 'C:\mallorca'
$state = Join-Path $dir 'idle.txt'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$now = Get-Date
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$active = @(quser 2>$null | Select-String ' Active ').Count -gt 0
$cpu = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
$net = ((Get-Counter '\Network Interface(*)\Bytes Total/sec').CounterSamples | Measure-Object CookedValue -Sum).Sum
$ssh = @(Get-Process sshd-session -ErrorAction SilentlyContinue).Count -gt 0
if ($active -or $ssh -or $cpu -gt 20 -or $net -gt 1000000 -or -not (Test-Path $state)) {
  Set-Content $state $now.ToString('o')
  exit
}
$last = [datetime]::Parse((Get-Content $state))
if ($last -lt $boot) {
  Set-Content $state $now.ToString('o')
  exit
}
if (($now - $last).TotalMinutes -ge 45) {
  Set-Content $state $now.ToString('o')
  shutdown /s /t 60 /c 'Mallorca workstation idle for 45 minutes'
}
