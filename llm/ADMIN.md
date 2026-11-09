# Setting up for the language model work (for Sohyeon)

What to do in the Google Cloud console (console.cloud.google.com, project "CROW Cards", `cos-princeton-hci-crow`) before the student creates the VM, in order. It's the list in `README.md`, "What Sohyeon sets up before you create anything", with the clicks. Nothing here is secret, so it can live in the public repo; don't add anything that is.

**Owners:** the VM and this setup belong to Sohyeon and Andrés: they keep its access, its updates and its costs in order, and remove a student's access when their work ends.

The console's layout changes from time to time: if something isn't exactly where this says, the search bar at the top finds pages by name.

---

## 0. Put these files on `beta`

The student clones `beta`, so this folder and the settings that protect it have to be there first: `llm/`, `.gitignore` (keeps `llm/eval/results/` out of Git), `firebase.json` (keeps `llm/` off both websites) and `scripts/stamp-version.mjs`. From the repo, on `beta`:

```bash
git add llm .gitignore firebase.json scripts/stamp-version.mjs DESIGN.md
git commit -m "Add the LLM setup walkthrough (llm/), kept off the websites"
git push
```

While you're in GitHub: **Settings → Branches** should protect `main` and `beta` (pull requests only), since the student gets write access to the repo.

## 1. Turn on the two APIs

The project so far has only used Firebase, so Compute Engine may be off.

1. **APIs & Services → Library** → search **Compute Engine API** → **Enable** (if it says "Manage", it's already on). This can take a minute or two.
2. The same for **Cloud Identity-Aware Proxy API** (for the tunnel).

Turning on Compute Engine normally creates the network `default`, with its default firewall rules (section 5). Check: **VPC network → VPC networks** lists `default`. If it doesn't (a Princeton policy can skip it), stop: section 5 needs a network, and it's worth deciding how to make one first.

## 2. Student A's access

**IAM & Admin → IAM → Grant access**
- **New principals:** Student A's Princeton Google address. (Student B needs no Google Cloud access: only GitHub write access, Slack, and the workbench on staging.)
- **Roles** (add each with **Add another role**):
  - **Compute Instance Admin (v1):** create, start, stop and SSH into VMs.
  - **IAP-secured Tunnel User:** reach the VM through Google's tunnel.
  - **Compute OS Admin Login:** log into the VM (with `sudo`) with their Google account; the VM uses OS Login (STEP1.md, A.2), so removing this role ends their SSH access.
  - **Compute Network Viewer:** see (not change) the network and firewall rules, for the student's checks.
- **Save.**

Deliberately **not** Editor: Editor could deploy the website and the functions, and read Firestore, including contributors' emails.

**What these roles still allow.** They're project-wide, so the student could (by mistake, or deliberately) give a VM an external IP, take it off the nightly stop, turn OS Login off, or create another VM. The firewall still only lets SSH in from Google's tunnel. To keep an eye on it, **once a month while a student has access**: **VM instances** shows only `crow-llm-vm`, with no external IP; its **Metadata** still has `enable-oslogin` = `TRUE`; **Instance schedules** still lists it. (OIT can also enforce "no external IPs" and "require OS Login" for the whole project with organization policies, if you'd rather not rely on the check.)

**Others who can reach the VM:** anyone with **Owner** (and possibly **Editor**) on the project can also SSH in, and so use Ollama. **IAM & Admin → IAM** lists them; keep that list short (see "Decisions", #7).

**When the work is done** (or the student leaves): see "When a student's work ends" below.

## 3. The budget alert

**Billing → Budgets & alerts** → the project's budget (currently $10/month) → **Edit**:
- **Amount:** e.g. **$50** per month (the VM's disk alone is about $9; a few hours' use a week, about $10–20 in all).
- **Thresholds:** 50%, 90% and 100% of actual spend.
- **Notifications:** emails to billing admins and users (you), and add others if you like.
- **Save.**

A budget only warns: it never stops anything. The nightly stop (section 7) is what limits a mistake.

## 4. GPU quota

**IAM & Admin → Quotas & system limits** → filter (the filter box above the table):
- **GPUs (all regions)** (`GPUS_ALL_REGIONS`, global): needs at least **1**.
- **NVIDIA L4 GPUs** (`NVIDIA_L4_GPUS`), region **us-central1**: needs at least **1**.

If either is 0: select it → **Edit quotas** → new value **1** → a short reason ("one L4 GPU VM for a research project's self-hosted language model; started only when in use") → **Submit**. Google answers by email, usually within a day or two. A larger request takes longer; 1 is enough.

## 5. The firewall

**VPC network → Firewall.**

**Create the tunnel rule** → **Create firewall rule**:
- **Name:** `allow-iap-llm`
- **Description:** "SSH to crow-llm-vm, only through Google's IAP tunnel"
- **Network:** `default`
- **Priority:** 1000
- **Direction:** Ingress; **Action:** Allow
- **Targets:** Specified target tags → `llm-vm`
- **Source filter:** IPv4 ranges → `35.235.240.0/20` (the only addresses Google's tunnel connects from)
- **Protocols and ports:** Specified → TCP → `22` (Ollama's port isn't opened: it's reached through SSH)
- **Create.**

**Remove the "from anywhere" defaults.** If these exist, they let anyone on the internet try SSH (22) and remote desktop (3389) on any VM with a public address:
- `default-allow-ssh` (source `0.0.0.0/0`, tcp:22)
- `default-allow-rdp` (source `0.0.0.0/0`, tcp:3389)

First check **Compute Engine → VM instances** is empty (nothing else relies on them), then select both → **Delete**.

**Leave** `default-allow-internal` (traffic between our own machines, `10.128.0.0/9`) and `default-allow-icmp` (ping) for now. The team narrows `default-allow-internal` when the site's server is connected to the model.

**Check:** the list has `allow-iap-llm`, and nothing allowing port 22 or 3389 from `0.0.0.0/0`.

## 6. Cloud NAT

The VM never has a public address. Cloud NAT lets it reach *out* to the internet (the driver, Ollama, the models, Ubuntu's security updates) while nothing can reach *in*.

**Network services → Cloud NAT → Get started** (or **Create Cloud NAT gateway**):
- **Gateway name:** `llm-nat`
- **Network:** `default`; **Region:** `us-central1`
- **Cloud Router:** Create new router → name `llm-router` → **Save**
- **NAT mapping / IP addresses:** leave the defaults (automatic)
- **Create.**

It charges a small amount per hour for each running VM that uses it, plus per GB passing through: the first model downloads (about 11 GB) cost on the order of a dollar. Check the current prices under **Network services → Cloud NAT** pricing if needed. Nothing to change on the VM.

## 7. The nightly stop

An instance schedule stops the VM every night, so a VM left running costs a day at most.

**Create the schedule:** **Compute Engine → VM instances → Instance schedules** (a tab at the top) → **Create schedule**:
- **Name:** `stop-llm-nightly`
- **Region:** `us-central1`
- **Start time:** none (we start it by hand)
- **Stop time:** 10:00 PM; **Time zone:** America/New_York; **Frequency:** daily
- **Submit.**

**Allow Google's service agent to stop VMs.** Schedules are carried out by Google's "Compute Engine Service Agent", which needs permission to stop our VMs, or the schedule silently does nothing.
1. Find the project number: **Cloud overview → Dashboard** (or ⚙ Project settings in Firebase): a number like `123456789012`.
2. **IAM & Admin → IAM → Grant access** → **New principals:** `service-PROJECT_NUMBER@compute-system.iam.gserviceaccount.com` (with the project number) → **Role:** Compute Instance Admin (v1) → **Save.**

The student attaches `crow-llm-vm` to the schedule once it exists (STEP1.md, A.3). If their role doesn't allow it, the same tab → the schedule → **Add instances to schedule**.

**Check after the first night:** the VM shows **Stopped** in the morning (or **Compute Engine → Instance schedules** → the schedule shows no errors).

## 8. Princeton's organization policies

You may not be able to see these (they're set by OIT); you'll find out at section 1 or when the VM is created, from an error naming a "constraint". The ones that matter:
- **Skip default network creation** (`compute.skipDefaultNetworkCreation`): no `default` network (section 1).
- **Resource location restriction** (`gcp.resourceLocations`): must allow `us-central1`.
- **Require OS Login** (`compute.requireOsLogin`): fine; SSH then uses your Google account, which our setup already does.

To look: **IAM & Admin → Organization policies** (if you can open it). If a policy blocks something, the error message names it: send it to OIT with what we need and why.

**Tell the student it's done:** they confirm this list at the start of STEP1.md.

---

## Later, as needed

### When a student's work ends

- **Google Cloud:** IAM & Admin → IAM → the student's row → pencil → remove their roles. SSH sessions or tunnels already open keep running until they close: stop the VM to end them for sure.
- **On the VM:** they had `sudo`, so check nothing was added for them: `ls /home` (only expected users) and no extra `authorized_keys` files (`sudo find /home /root -name authorized_keys`). If in doubt, rebuild the VM (below).
- **GitHub and Slack:** remove their write access to `crowcards/crowweb` and, if they're leaving the project, `#crow-cards`.
- **If the VM isn't needed for a while:** stopped, it costs only its disk (about $9/month). Deleting it removes that too.

### Rebuilding the VM

If it's deleted, broken beyond repair, or may have been compromised: delete it, then run the `gcloud` command saved in `llm/setup-log.md` (it recreates the bare machine: type, GPU, disk, network, OS Login), attach it to the nightly stop, and repeat STEP1.md A.4–A.7 and B.2 (driver, Ollama, models, the keep-alive setting); the log has the versions used before.

### Checking Cloud NAT's cost

After the first month, look at **Billing → Reports** for Cloud NAT. It charges per running VM-hour and per GB, and possibly for its IP address even while the VM is stopped (a few dollars a month). If that last charge appears and matters, delete the gateway between uses and re-create it (section 6) when the VM is next needed.

---

## Decisions before real users (Sohyeon)

None of these block the student's work; all must be settled before the model's suggestions reach anyone using the site. Record each decision here, with its date, and reflect it on the privacy page.

| # | Decision | Notes | Decided |
|---|---|---|---|
| 1 | **What text goes to the model**, and when | Which fields (e.g. the description, pasted rules); only after the person opts in for that card. | |
| 2 | **Nothing stored** | Prompts and answers never logged: Ollama's debug logging stays off (it would record prompts), and the Cloud Function's logs leave out the text. | |
| 3 | **Research use** | Whether cards' text may ever be used to evaluate or improve the models: only with explicit consent, and whether that needs IRB review. Until decided: never. The comparison uses made-up communities and written answers, plus **public communities' rules pages** (decided 2026-11-08: committed to the repo with their address and the date copied). | |
| 4 | **The privacy page and the opt-in wording** | What the model does and doesn't do with what people write; that it runs on our own server. | |
| 5 | **Suggestions only** | The model never selects anything; people choose (as the recommendations work today). | |
| 6 | **Choosing the model** | The license and openness requirements; then, **after the exploratory comparison** (STEP2), which parts of the card are worth using a model for, and the criteria for a proper evaluation of those (what to measure, on what examples, and what counts as good enough), set before that evaluation runs. | |
| 7 | **Access and incidents** | Who can reach the VM (the owners, students while their work lasts, and anyone with Owner or Editor on the project: keep those few); what to do if it's ever compromised (stop it, remove access, review the logs, tell users if their text could have been exposed). | |
| 8 | **Limits** | Per-address and daily limits on the function that calls the model (README.md, "What comes after"). | |
