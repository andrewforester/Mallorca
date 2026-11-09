$idle = New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\mallorca\idle.ps1'
$every = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName MallorcaIdleStop -Action $idle -Trigger $every -User SYSTEM -RunLevel Highest -Force | Out-Null
$shot = New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\mallorca\shot.ps1'
$user = New-ScheduledTaskPrincipal -UserId andrew -LogonType Interactive
Register-ScheduledTask -TaskName MallorcaShot -Action $shot -Principal $user -Force | Out-Null
