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
