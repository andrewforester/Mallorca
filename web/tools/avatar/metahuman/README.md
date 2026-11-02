# MetaHuman

Her MetaHuman look (#75) is authored in MetaHuman Creator inside Unreal Engine, which runs only on Windows. This folder
holds what is needed to rebuild that setup. The license terms are in `web/public/avatar/LICENSE.md`.

## The workstation

`cloud/workstation.sh` drives a Windows Server 2022 VM on Google Cloud with one NVIDIA L4 and an RTX Virtual Workstation
license (`nvidia-l4-vws`), a `g2-standard-8` spot instance with a 250 GB disk that survives the VM. Unreal Engine 5.8
with MetaHuman Creator Core Data is installed on that disk.

```sh
export MH_PROJECT=<project>
cloud/workstation.sh create
cloud/workstation.sh password
cloud/workstation.sh tasks
cloud/workstation.sh start
cloud/workstation.sh stop
cloud/workstation.sh snapshot
```

- `create` makes the VM. The NVIDIA vWS driver installs on first boot (`sysprep-specialize-script-url`), and
  `cloud/startup.ps1` enables OpenSSH with the key from the `mallorca-ssh-key` metadata, `~/.ssh/mallorca_gcp.pub` by
  default. With `MH_SNAPSHOT=<snapshot>` it boots from a snapshot of a ready disk instead of a fresh image.
- `password` creates the Windows user `andrew` and prints its password for Remote Desktop (Windows App on macOS).
  Keep it out of the repository.
- `tasks` installs two scheduled tasks: `MallorcaIdleStop` (`cloud/idle.ps1`) shuts the VM down after 45 minutes with
  no Remote Desktop or SSH session, CPU under 20% and network under 1 MB/s, so an idle VM costs only its disk;
  `MallorcaShot` (`cloud/shot.ps1`) saves a screenshot of the Remote Desktop session to `C:\mallorca\shot.png`.
- `start` lets the current public IP through the firewall (Remote Desktop and SSH are open to that one address only)
  and starts the VM, retrying while the zone has no spot L4 capacity. The external IP changes on every start: `ip`
  prints it.
- `snapshot` saves the disk. On a stockout, `MH_ZONE=<other zone> MH_SNAPSHOT=<snapshot> cloud/workstation.sh create`
  brings the same machine up elsewhere.

On-demand L4 capacity was out in every EU and US zone when the VM was made, which is why it is a spot instance: Google
may stop it, the disk stays, and `start` brings it back.

Once on the VM: sign in to the Epic Games Launcher and install Unreal Engine 5.8 with the option MetaHuman Creator Core
Data, without extra target platforms.
