$ErrorActionPreference = 'Continue'
if ((Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0).State -ne 'Installed') {
  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
}
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
$headers = @{ 'Metadata-Flavor' = 'Google' }
$key = Invoke-RestMethod -Headers $headers 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/mallorca-ssh-key'
$auth = 'C:\ProgramData\ssh\administrators_authorized_keys'
Set-Content -Path $auth -Value $key
icacls $auth /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null
