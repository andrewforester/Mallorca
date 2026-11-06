#!/usr/bin/env bash
set -euo pipefail

project="${MH_PROJECT:?set MH_PROJECT to the Google Cloud project}"
zone="${MH_ZONE:-europe-west4-a}"
name="${MH_NAME:-mallorca-ws}"
key="${MH_KEY:-$HOME/.ssh/mallorca_gcp}"
here="$(cd "$(dirname "$0")" && pwd)"

gc() { gcloud --project "$project" "$@"; }
ip() { gc compute instances describe "$name" --zone "$zone" --format='value(networkInterfaces[0].accessConfigs[0].natIP)'; }
remote() { ssh -i "$key" -o StrictHostKeyChecking=accept-new "andrew@$(ip)" "$@"; }

allow() {
  local mine
  mine="$(curl -s https://ifconfig.me)"
  for rule in default-allow-rdp default-allow-ssh; do
    gc compute firewall-rules update "$rule" --source-ranges="$mine/32" >/dev/null
  done
  echo "allowed $mine"
}

create() {
  local disk=(--image-family=windows-2022 --image-project=windows-cloud)
  if [[ -n "${MH_SNAPSHOT:-}" ]]; then
    gc compute disks create "$name" --zone "$zone" --source-snapshot "$MH_SNAPSHOT" --type pd-balanced
    disk=(--disk="name=$name,boot=yes,auto-delete=no")
  else
    disk+=(--boot-disk-size=250GB --boot-disk-type=pd-balanced --no-boot-disk-auto-delete)
  fi
  gc compute instances create "$name" --zone "$zone" \
    --machine-type=g2-standard-8 --accelerator=type=nvidia-l4-vws,count=1 \
    --provisioning-model=SPOT --instance-termination-action=STOP --maintenance-policy=TERMINATE \
    "${disk[@]}" \
    --metadata=sysprep-specialize-script-url=https://github.com/GoogleCloudPlatform/compute-gpu-installation/raw/main/windows/install_gpu_driver.ps1 \
    --metadata-from-file="windows-startup-script-ps1=$here/startup.ps1,mallorca-ssh-key=$key.pub"
}

tasks() {
  remote 'New-Item -ItemType Directory -Force C:\mallorca | Out-Null'
  scp -i "$key" -q "$here/idle.ps1" "$here/shot.ps1" "$here/tasks.ps1" "andrew@$(ip):C:/mallorca/"
  remote 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\mallorca\tasks.ps1'
}

start() {
  allow
  for _ in $(seq 1 20); do
    if gc compute instances start "$name" --zone "$zone" 2>/dev/null; then
      echo "running at $(ip)"
      return
    fi
    echo "no capacity in $zone, retrying"
    sleep 30
  done
  echo "still no capacity in $zone" >&2
  exit 1
}

snapshot() {
  gc compute snapshots create "$name-$(date +%Y%m%d-%H%M)" --source-disk "$name" --source-disk-zone "$zone"
}

case "${1:-}" in
  allow) allow ;;
  create) allow; create ;;
  tasks) tasks ;;
  start) start ;;
  stop) gc compute instances stop "$name" --zone "$zone" ;;
  ip) ip ;;
  password) gc compute reset-windows-password "$name" --zone "$zone" --user=andrew --quiet ;;
  snapshot) snapshot ;;
  *) echo "usage: $0 allow|create|tasks|start|stop|ip|password|snapshot" >&2; exit 2 ;;
esac
