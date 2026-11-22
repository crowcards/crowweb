# LLM setup log

What was set up, when, by whom, and the command that does the same, one entry per step. No IP addresses (write "see the console"), no secrets, no project numbers. Sohyeon's console setup comes first (ADMIN.md); Student A's VM steps follow (STEP1.md).

---

### GPU quota (ADMIN.md §4)

Checked 2026-11-09 by Sohyeon (IAM & Admin → Quotas & system limits): GPUs (all regions) 12,000; NVIDIA L4 GPUs in us-central1 32. Enough already; no request needed.

### Firewall rule `allow-iap-llm` (ADMIN.md §5)

Created 2026-11-09 by Sohyeon in the console (VPC network → Firewall), on the `default` network.

Allows SSH (TCP 22 only) into VMs tagged `llm-vm`, and only from Google's IAP range `35.235.240.0/20`, so the only way in is `gcloud compute ssh` through IAP, by someone with IAP-secured Tunnel User and OS Login. The VM has no external IP, so nothing else on the internet can reach it.

Firewall logging is off: every connection comes from the IAP range, so these logs couldn't show who connected. The IAP Data Access audit log records that instead (next entry).

After creating it, deleted `default-allow-ssh` and `default-allow-rdp` (both open to `0.0.0.0/0`); no other VMs existed in the project. `default-allow-internal` and `default-allow-icmp` left in place.

Console's "Equivalent code" for the rule, and the deletion:

```
gcloud compute --project=cos-princeton-hci-crow firewall-rules create allow-iap-llm --description=SSH\ to\ crow-llm-vm,\ only\ through\ Google\'s\ IAP\ tunnel --direction=INGRESS --priority=1000 --network=default --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=llm-vm

gcloud compute --project=cos-princeton-hci-crow firewall-rules delete default-allow-ssh default-allow-rdp
```

### IAP Data Access audit log (ADMIN.md §5)

Turned on 2026-11-09 by Sohyeon (IAM & Admin → Audit Logs → Cloud Identity-Aware Proxy API → Data Read). Records which Google account opened each SSH tunnel, and when. No command recorded.

### Cloud NAT `llm-nat` and router `llm-router` (ADMIN.md §6)

Created 2026-11-09 by Sohyeon in the console (Network services → Cloud NAT). Gives VMs without an external IP in `default` / us-central1 (only `crow-llm-vm`) outbound-only internet access, for the driver, Ollama, the models and Ubuntu updates. Public NAT; source endpoints VM instances, GKE nodes and Serverless; primary and secondary ranges for all subnets; automatic addresses; Premium tier; no logging. The router was created when its dialog was saved. The console offered no equivalent code; these commands match the settings:

```
gcloud compute routers create llm-router \
    --project=cos-princeton-hci-crow --network=default --region=us-central1

gcloud compute routers nats create llm-nat \
    --project=cos-princeton-hci-crow --router=llm-router --region=us-central1 \
    --nat-all-subnet-ip-ranges \
    --auto-allocate-nat-external-ips
```

### Schedule `stop-llm-nightly` (ADMIN.md §7)

Created 2026-11-09 by Sohyeon (Compute Engine → VM instances → Instance schedules). Stops attached VMs every day at 2:00 AM, America/New_York (follows daylight saving); no start time. `crow-llm-vm` is attached once it exists (STEP1.md, A.3).

```
gcloud compute resource-policies create instance-schedule stop-llm-nightly \
    --project=cos-princeton-hci-crow --region=us-central1 \
    --vm-stop-schedule="0 2 * * *" \
    --timezone=America/New_York
```

### The Compute Engine service agent's grant (ADMIN.md §7)

Granted 2026-11-09 by Sohyeon (IAM & Admin → IAM): Compute Instance Admin (v1) for the Compute Engine Service Agent, so the schedule can stop VMs. Checked with **Include Google-provided role grants**.

```
gcloud projects add-iam-policy-binding cos-princeton-hci-crow \
    --member="serviceAccount:service-PROJECT_NUMBER@compute-system.iam.gserviceaccount.com" \
    --role="roles/compute.instanceAdmin.v1"
```

(`PROJECT_NUMBER`: the project's number, on the console's Dashboard; not written here.)

### Organization policies (ADMIN.md §8)

Checked 2026-11-09 by Sohyeon: `skipDefaultNetworkCreation`, `gcp.resourceLocations` and `requireOsLogin` are inactive (inherited). The active policies are Google's secure-by-default set (service-account keys, Cloud Build, Vertex AI, etc.); none restricts GPU VMs, external IPs or Cloud NAT. The `default` network existed, and Cloud NAT was created in us-central1 without errors. One to know: `compute.managed.blockPreviewFeatures` is active, so leave any "Preview" option unselected when creating the VM. Creating the GPU VM is the remaining test.

---

*(Student A's entries, from STEP1.md, go below.)*

### Firewall check (STEP1.md A.1)

Checked 2026-11-22 by Prishaa (VPC network → Firewall): `allow-iap-llm` present (TCP 22, from `35.235.240.0/20`, target tag `llm-vm`); no rule allows 22 or 3389 from `0.0.0.0/0`; `default-allow-internal` and `default-allow-icmp` present, as expected.

### VM `crow-llm-vm` (STEP1.md A.2)

Created 2026-11-16 by Prishaa, from Cloud Shell with the command below. The console's Create form was used to settle the settings, but its Security section could not show "No service account" until Sohyeon granted view access to service accounts (11-15), and the form reset between attempts, so the final create was run as a command.

**Hardware differs from the plan.** `g2-standard-4` + NVIDIA L4 was stocked out (`ZONE_RESOURCE_POOL_EXHAUSTED`) in us-central1-a, -b and -c on 11-15 and 11-16, and `-f` has no G2 machines at all. With Sohyeon's OK (Slack, 11-16), created as **`n1-standard-4` (4 vCPU, 15 GB) with 1 × NVIDIA T4** (16 GB GPU memory; the L4 has 24 GB). The three models fit one at a time; answers are slower than they would be on an L4.

| When | Config | Zone | Result |
|---|---|---|---|
| 11-15 ~23:30 | g2-standard-4 + L4 | us-central1-a | stockout (twice) |
| 11-16 09:01 | g2-standard-4 + L4 | us-central1-a | stockout |
| 11-16 09:02 | g2-standard-4 + L4 | us-central1-b | stockout |
| 11-16 09:03 | g2-standard-4 + L4 | us-central1-c | stockout |
| 11-16 11:18 | g2-standard-4 + L4 | us-central1-f | `g2-standard-4` does not exist in this zone |
| 11-16 11:19 | n1-standard-4 + T4 | us-central1-a | **created** |

Settings: zone `us-central1-a`; Standard provisioning; Ubuntu 24.04 LTS x86/64 (image `ubuntu-2404-noble-amd64-v20261105`); 50 GB SSD persistent disk; no backups or snapshots; no external IP; network tag `llm-vm`; OS Login on (`enable-oslogin=TRUE`); no service account; Secure Boot off, vTPM and integrity monitoring on; host maintenance Terminate; automatic restart on; labels `purpose=llm`, `project=crowcards`. Internal IP: see the console.

Cost estimate (console, 2026-11-22, for the same config): $402.70/month running 24/7 before discounts, about $0.55/hour (n1-standard-4 $138.70, T4 $255.50, 50 GB SSD $8.50); $284.44/month with the sustained-use discount, which only applies if it runs most of the month. The planned L4 config was $524.49/month, $0.72/hour. Stopped, the disk alone is $8.50/month.

```
gcloud compute instances create crow-llm-vm \
    --project=cos-princeton-hci-crow \
    --zone=us-central1-a \
    --machine-type=n1-standard-4 \
    --network-interface=stack-type=IPV4_ONLY,subnet=default,no-address \
    --metadata=enable-oslogin=TRUE \
    --maintenance-policy=TERMINATE \
    --provisioning-model=STANDARD \
    --no-service-account \
    --no-scopes \
    --accelerator=count=1,type=nvidia-tesla-t4 \
    --tags=llm-vm \
    --create-disk=auto-delete=yes,boot=yes,device-name=crow-llm-vm,image=projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261105,mode=rw,size=50,type=pd-ssd \
    --no-shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --labels=purpose=llm,project=crowcards \
    --reservation-affinity=any
```

### Nightly stop attached (STEP1.md A.3)

2026-11-16 by Prishaa, from Cloud Shell:

```
gcloud compute instances add-resource-policies crow-llm-vm \
    --project=cos-princeton-hci-crow --zone=us-central1-a \
    --resource-policies=stop-llm-nightly
```

### GPU driver (STEP1.md A.4)

2026-11-16 and 2026-11-22 by Prishaa, over SSH (`gcloud compute ssh crow-llm-vm --zone=us-central1-a --tunnel-through-iap`).

Ran Google's installer per A.4. Its "updating kernel" step upgraded the VM from Ubuntu 24.04's 6.8 kernel to `7.0.0-1017-gcp`, and the NVIDIA driver then failed to build against it (`nvidia-uvm/uvm_dmabuf_test.c: implicit declaration of function 'dma_buf_move_notify'`). Headers were installed; the installer's `list_driver_versions` offered nothing newer than the 620.70.06 that failed, so no driver supported this kernel yet.

**Deviation:** pinned the VM to the 24.04 GA kernel, which the driver supports. Installed `linux-image-gcp-6.8` and `linux-headers-gcp-6.8` (6.8.0-1073.81), removed the 7.0 packages (`linux-gcp`, `linux-image-gcp`, `linux-headers-gcp`, `linux-image-7.0.0-1017-gcp`, `linux-headers-7.0.0-1017-gcp`, `linux-modules-7.0.0-1017-gcp`), rebooted. The driver module built cleanly for 6.8 and `nvidia-driver-open` configured without errors. The 6.8 kernel is Ubuntu's supported 24.04 kernel and keeps getting security updates through the `linux-gcp-6.8` packages.

Result after reboot: kernel `6.8.0-1073-gcp`; `nvidia-smi` shows Tesla T4, 15360 MiB, **driver 620.70.06**, CUDA 13.5.

```
curl -L https://storage.googleapis.com/compute-gpu-installation-us/installer/latest/cuda_installer.pyz --output cuda_installer.pyz
sudo python3 cuda_installer.pyz install_driver        # upgraded kernel to 7.0, rebooted, then failed to build the driver
sudo apt-get install -y linux-image-gcp-6.8 linux-headers-gcp-6.8
sudo apt-get remove -y linux-image-gcp linux-headers-gcp linux-image-7.0.0-1017-gcp linux-headers-7.0.0-1017-gcp linux-modules-7.0.0-1017-gcp
sudo reboot
nvidia-smi
```

### Ollama (STEP1.md A.5)

2026-11-22 by Prishaa. Installed with Ollama's script; it detected the GPU and set up the systemd service. `ollama --version`: **0.40.17**; `systemctl status ollama`: `active (running)`, enabled. Listens on localhost only (default; unchanged).

```
curl -fsSL https://ollama.com/install.sh | sh
```

### Models (STEP1.md A.6, A.7)

2026-11-22 by Prishaa. Pulled through Cloud NAT without issue. `ollama list`:

| Model | Size |
|---|---|
| `qwen2.5:7b-instruct` | 4.7 GB |
| `olmo-3:7b-instruct` | 4.5 GB |
| `phi3.5:3.8b` | 2.2 GB |

Each answered `ollama run <model> "Reply with exactly one word: Hello"` with "Hello" (phi3.5 added a sentence of commentary after it).

```
ollama pull qwen2.5:7b-instruct
ollama pull olmo-3:7b-instruct
ollama pull phi3.5:3.8b
```

### Gate 1 (STEP1.md A.8)

2026-11-22: screenshots sent to Sohyeon (VM details with the internal IP blurred, `nvidia-smi`, `ollama list`); VM stopped; draft PR opened against `beta`.