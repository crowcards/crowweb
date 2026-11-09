# Step 1: create the VM, then lock it down

**Part A (Gate 1):** a GPU VM with the driver, Ollama and the three models. It never has a public address: you reach it only through Google's tunnel, and it reaches the internet (for downloads and updates) only through Cloud NAT.
**Part B (Gate 2):** check and document that it's locked down: SSH through the tunnel is the only way in, and Ollama answers only on the VM itself.

You'll do most of this in the **Google Cloud console** (console.cloud.google.com, project "CROW Cards", `cos-princeton-hci-crow`), and some in a terminal on the VM. The console's layout changes from time to time: if a setting isn't exactly where this says, look for it by name, and ask if you can't find it.

Keep a log as you go, in `llm/setup-log.md`: what you did, when, and the values you chose (names, machine type, image, the cost estimate, the equivalent `gcloud` command). **Never the VM's IP addresses**, internal or external: write "see the console" instead (the repo is public).

---

## Part A: create the VM

### A.1: Check the setup is done

Before creating anything, ask Sohyeon to confirm the list in `README.md`, "What Sohyeon sets up before you create anything", is done: your roles, the budget alert, GPU quota, organization policies, the firewall (`allow-iap-llm` for SSH, and the default SSH and remote-desktop rules gone), the tunnel's audit log, Cloud NAT, and the nightly stop.

**Good to know:** the tunnel's audit log is on, so Google records which account opens each SSH connection to the VM, and when. That's normal for a shared server: it's how the team can see who accessed it.

Then check the firewall yourself: console → **VPC network → Firewall**. You should see `allow-iap-llm` (from `35.235.240.0/20`, TCP 22, target tag `llm-vm`), and **no** rule allowing port 22 or 3389 from `0.0.0.0/0`. `default-allow-internal` (from `10.128.0.0/9`) may still be there: that's expected. If anything differs, stop and ask.

### A.2: Create the VM

Console → **Compute Engine → VM instances → Create instance**.

**Machine configuration**
- **Name:** `crow-llm-vm`
- **Region:** `us-central1`; **Zone:** `us-central1-a`
- **Machine type:** the **GPUs** tab → GPU type **NVIDIA L4**, number **1** → machine type **`g2-standard-4`** (4 vCPUs, 16 GB memory). The L4 comes with this machine type.
- **Provisioning model:** Standard (not Spot).
- Leave any option marked **Preview** unselected: a Princeton policy blocks preview features, and creating the VM would fail.

**OS and storage** → **Change**
- **Operating system:** Ubuntu; **Version:** **Ubuntu 24.04 LTS** (x86/64): the plain one, not "Minimal" and not "Ubuntu Pro" (which has a license fee).
- **Boot disk type:** SSD persistent disk; **Size:** 50 GB.
- If the console offers a "Deep Learning" image instead, **don't take it**: those images can't boot G2 machines. You'll install the driver yourself (A.4).

**Data protection:** no backups or snapshots needed.

**Networking**
- **Network tags:** `llm-vm` (this is what `allow-iap-llm` applies to).
- Leave **Allow HTTP traffic** and **Allow HTTPS traffic** unselected.
- **Network interface:** network `default`; **External IPv4 address:** **None**. The VM never gets a public address: it downloads through Cloud NAT, and you connect through Google's tunnel.

**Security**
- **Manage access → "Control VM access through IAM permissions"** (OS Login): on. If you can't find it, set it under **Advanced → Metadata → Add item**: key `enable-oslogin`, value `TRUE`. Then SSH access comes from your Google account and roles (no SSH keys stored in the project), and ends when the roles are removed.
- **Identity and API access → Service account:** **No service account.** The VM never needs to call Google Cloud's APIs; without one, even someone who broke into it couldn't reach our database.
- **Shielded VM:** leave **Secure Boot off** (the default). With it on, the NVIDIA driver won't load.

**Advanced** (or **Management**)
- **Host maintenance:** Terminate (GPU VMs can't move between machines; the console usually sets this itself).
- **Labels:** `purpose` = `llm`, `project` = `crowcards` (for finding its costs in Billing).

**Before you click Create:**
- note the **monthly estimate** shown on the right (it's for running all month; divide by 730 for the hourly cost);
- click **Equivalent code** (at the bottom) and copy the `gcloud` command into your log. It holds no secrets or addresses, and anyone can rebuild the VM exactly from it.

Click **Create**. It takes a minute or two.

**Errors:**
- *Quota* ("GPUS_ALL_REGIONS" or "NVIDIA_L4_GPUS" exceeded): send Sohyeon the error text; the project needs more GPU quota.
- *Resources unavailable in the zone*: L4s are sometimes all taken in a zone. Wait and retry, or ask before trying `us-central1-b` or `-c` (then use that zone everywhere below).
- *Constraint* / *organization policy*: a Princeton policy blocks something. Send Sohyeon the error.
- *`iam.serviceAccounts.actAs`* / *service account*: the default service account is still selected. Choose **No service account** (don't ask for more access to get around it).

### A.3: Attach the nightly stop

So a forgotten VM costs a day at most, not a month.

Console → **Compute Engine → VM instances → Instance schedules** (a tab at the top) → the schedule Sohyeon made (`stop-llm-nightly`, every night at 2am Eastern) → **Add instances to schedule** → `crow-llm-vm` → **Add**.

If there's no schedule yet, ask Sohyeon. The stop can come up to 15 minutes after 2am, and it stops the VM whatever is running: if you work very late, finish (or save your place) before then. Don't rely on it: still **stop the VM whenever you finish working** (A.9).

### A.4: Connect, and install the GPU driver

Console → **VM instances** → the **SSH** button on `crow-llm-vm`'s row. A terminal opens in your browser, on the VM. (Or, from your own terminal: `gcloud compute ssh crow-llm-vm`.)

Install NVIDIA's driver with Google's script (Ollama needs only the driver, not the rest of CUDA):

```bash
curl -L https://storage.googleapis.com/compute-gpu-installation-us/installer/latest/cuda_installer.pyz --output cuda_installer.pyz
sudo python3 cuda_installer.pyz install_driver
```

The script restarts the VM partway through. Reconnect (SSH button), and run the second line again: it carries on, and says when the driver is installed. Then restart once more (`sudo reboot`, wait a minute, reconnect), as Google advises. Google's instructions, if anything differs: [Install GPU drivers](https://cloud.google.com/compute/docs/gpus/install-drivers-gpu).

Then check the GPU:

```bash
nvidia-smi
```

You should see an **NVIDIA L4** with about 24 GB of memory, and a driver version (G2 needs 580 or newer). Put the driver version in your log. If `nvidia-smi` isn't found or shows an error, check the installer's output, run it once more, and ask if it still fails.

### A.5: Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This installs Ollama and sets it up as a systemd service. Check:

```bash
ollama --version
systemctl status ollama
```

`systemctl status` should say `active (running)` (press `q` to leave it). Put Ollama's version in your log. If the service doesn't exist, follow "Adding Ollama as a startup service" at [docs.ollama.com/linux](https://docs.ollama.com/linux).

Ollama listens only on `localhost` (programs on the VM itself), and stays that way: you'll reach it through SSH (B.4).

### A.6: Download the three models

The VM downloads through Cloud NAT (if a download hangs, ask Sohyeon to check the NAT gateway):

```bash
ollama pull qwen2.5:7b-instruct
ollama pull olmo-3:7b-instruct
ollama pull phi3.5:3.8b
ollama list
```

`ollama list` should show all three, with their sizes (2–5 GB each). Put the names and sizes in your log.

### A.7: Try them

```bash
ollama run qwen2.5:7b-instruct "Reply with exactly one word: Hello"
ollama run olmo-3:7b-instruct "Reply with exactly one word: Hello"
ollama run phi3.5:3.8b "Reply with exactly one word: Hello"
```

Each should answer with a word or so. The first answer takes longer while the model loads into the GPU's memory.

While one is answering, `nvidia-smi` in a second SSH window shows the GPU busy and its memory used. (Ollama unloads a model after 5 minutes unused; then it shows 0%. That's normal.)

### A.8: STOP: Gate 1

**Don't go past this point until team reviews together.**

1. Screenshots for Sohyeon (in a direct message, not the repo):
   - Console → VM instances → `crow-llm-vm` → its details: machine type, GPU, boot disk, labels, service account ("none"), network tags. **Crop out or blur the internal IP address** shown there.
   - Your terminal: `nvidia-smi` and `ollama list`.
2. Write `llm/setup-log.md` so far: the date, the VM's name and settings, the image, the cost estimate, the driver and Ollama versions, the models. No IP addresses.
3. Commit and push (see `README.md`, "How we use Git"):
   ```bash
   git add llm/setup-log.md
   git commit -m "Log the LLM VM's setup: g2-standard-4, L4, Ubuntu 24.04, three models"
   git push -u origin llm-setup
   ```
4. Open the draft pull request (base `beta`).
5. **Stop the VM** (A.9): it can wait stopped for the review.
6. Message Sohyeon: "Gate 1 ready: VM created, driver, Ollama and the three models working. Screenshots attached; the PR is open."

### A.9: Stop the VM whenever you finish

Console → VM instances → select `crow-llm-vm` → **Stop**. Or from your terminal: `gcloud compute instances stop crow-llm-vm`.

Stopped, it costs only its disk (about $9 a month). It starts again in about 30 seconds. **Before you close your laptop, check the console shows it as Stopped.**

---

## Part B: lock it down

**Goal:** confirm and document that the VM has no public address, that only SSH through Google's tunnel reaches it, and that Ollama answers only on the VM itself (`localhost`).

Start the VM: console → VM instances → `crow-llm-vm` → **Start**.

### B.1: Check updates work

The VM gets Ubuntu's security updates by itself (automatic updates are on by default), through Cloud NAT. Check it can reach them:

```bash
sudo apt update
```

It should list package sources without errors. If it hangs, Cloud NAT isn't working: ask Sohyeon.

### B.2: Keep models loaded during a session

Ollama keeps listening only on `localhost`, so nothing beyond the VM can reach it; you'll reach it through SSH (B.4). One setting to change: how long a model stays loaded. On the VM:

```bash
sudo systemctl edit ollama.service
```

An editor opens on an override file. If it shows comment lines saying "Anything between here and the comment below will become the contents of the drop-in file", put these lines between them:

```ini
[Service]
Environment="OLLAMA_KEEP_ALIVE=1h"
```

Save and exit (in nano: Ctrl+X, then Y, then Enter). `OLLAMA_KEEP_ALIVE=1h` keeps a model loaded for an hour after its last use (the default is 5 minutes), so answers stay quick during a session.

Restart Ollama with the new setting:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
systemctl status ollama
```

It should say `active (running)`.

**Good to know:** Ollama has no logins: anything that can reach its port (11434) can use it, including downloading or deleting models. That's why it listens only on `localhost`. When our server is connected to it later, the team opens it to that one connection, deliberately (README.md, "What comes after"). Don't change `OLLAMA_HOST`.

### B.3: Try the API on the VM

```bash
curl -s http://localhost:11434/api/version
```

You should see `{"version":"…"}`. Then ask for JSON:

```bash
curl -s http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct",
  "prompt": "Return a JSON object with keys: label (string, value: hello), count (integer, value: 1).",
  "format": "json",
  "stream": false
}'
```

The reply is JSON whose `response` field holds the model's answer, itself valid JSON (something like `{"label": "hello", "count": 1}`). `"format": "json"` makes Ollama only produce valid JSON.

### B.4: Reach it from your laptop, through the tunnel

In a terminal on your **own computer** (with `gcloud` set up, see `README.md`):

```bash
gcloud compute ssh crow-llm-vm -- -N -L 11435:localhost:11434
```

This logs into the VM over SSH (through Google's tunnel) and carries your computer's port 11435 to the VM's own `localhost:11434`, where Ollama is. `-N` means "don't open a shell, just carry the port"; it looks like nothing is happening, which is right. Leave it running.

- **Why 11435 on your side:** if you have the Ollama app on your own computer, it already uses 11434, and the tunnel couldn't take it (SSH only warns, and your own Ollama would answer instead).
- **The first time** you use `gcloud compute ssh`, it makes an SSH key for you (in `~/.ssh/google_compute_engine`) and asks for a passphrase: choose one you'll remember, or leave it empty.

In a second terminal:

```bash
curl -s http://localhost:11435/api/tags
```

You should see the VM's three models (`qwen2.5:7b-instruct`, `olmo-3:7b-instruct`, `phi3.5:3.8b`). That's the tunnel working: your laptop reaches Ollama, through Google and SSH, with no public address and no open port anywhere. Stop the tunnel with Ctrl+C.

If it fails: a "permission" error means a role is missing (**IAP-secured Tunnel User**, or **Compute OS Admin Login**); a timeout means the firewall rule `allow-iap-llm`; "connection refused" from `curl` means Ollama isn't running on the VM (`systemctl status ollama`). Send the error to Sohyeon.

### B.5: Check there's no public address

From your own terminal:

```bash
gcloud compute instances describe crow-llm-vm --format="get(networkInterfaces[0].accessConfigs)"
```

Empty output means no external IP.

### B.6: Security checklist

Go through each, and note the result in your log:

- [ ] The VM has no external IP (B.5).
- [ ] The VM has no service account (its details page: "Service account: none").
- [ ] Firewall (VPC network → Firewall): `allow-iap-llm` allows only TCP 22, only from `35.235.240.0/20`, only to tag `llm-vm`; nothing allows port 22 or 3389 from `0.0.0.0/0`.
- [ ] Ollama listens only on `localhost`: on the VM, `ss -ltn | grep 11434` shows `127.0.0.1:11434`, not `0.0.0.0` or `*`.
- [ ] OS Login is on: the VM's details page, **Metadata**, shows `enable-oslogin` = `TRUE`.
- [ ] The VM is in project `cos-princeton-hci-crow`, not a personal one.
- [ ] The nightly stop schedule includes `crow-llm-vm`.
- [ ] Secure Boot is off and the driver loads (`nvidia-smi` works after a restart).
- [ ] Nothing in your commits is a secret or an IP address: `git log -p beta..llm-setup` shows only your branch's changes.

`default-allow-internal` lets other machines on our internal network reach the VM's ports; with Ollama on `localhost` only, there's nothing to reach. The team narrows it when the site's server is connected (README.md, "What comes after").

### B.7: Log it and commit

Add to `llm/setup-log.md`: the date, B.1 (updates work through Cloud NAT), the Ollama override's contents (`systemctl cat ollama`), the checklist's results. No IP addresses.

```bash
git add llm/setup-log.md
git commit -m "Check the LLM VM is locked down: no external IP, SSH only through IAP, Ollama on localhost"
git push
```

### B.8: STOP: Gate 2

**Don't go past this point until the team has reviewed it.**

In `#crow-cards`, post something like:

> Gate 2 ready for review: the LLM VM has no public address, SSH through Google's tunnel is the only way in, and Ollama answers only on the VM itself. Checklist and log are in the PR. Can people (@ sohyeon) review and OK before we go to the next step?

Add a short summary of Part B to the pull request's description.

Then stop the VM (A.9).

---

## Troubleshooting

- **`nvidia-smi` not found or failing:** run `sudo python3 cuda_installer.pyz install_driver` again (it may need another restart); check the GPU appears in `lspci | grep -i nvidia`.
- **Ollama answers but the model doesn't, or it's very slow:** `ollama list` shows the model is there? `nvidia-smi` shows the GPU? If the GPU's memory is full from an earlier session, `sudo systemctl restart ollama`. If Ollama doesn't see the GPU at all (slow, CPU-only answers), restart Ollama after the driver is working.
- **Can't connect with SSH:** the SSH button and `gcloud compute ssh` need the firewall rule `allow-iap-llm`, and your **IAP-secured Tunnel User** and **Compute OS Admin Login** roles. `gcloud compute ssh crow-llm-vm --troubleshoot --tunnel-through-iap` explains what's wrong.
- **Downloads hang** (`ollama pull`, `apt`, the driver script): the VM reaches the internet only through Cloud NAT; ask Sohyeon to check the gateway `llm-nat` exists for `us-central1`.
