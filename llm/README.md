# CROW Cards: setting up our own language model

**For:** the students setting up the self-hosted language model for CROW Cards. One ("Student A") sets up the server (STEP1) and runs the models; both prepare the test inputs, and the other ("Student B") adds what the current site suggests for comparison (STEP2).

**Scope:** create and secure the model's server (a virtual machine with a GPU), then compare what three models suggest for each part of a card. Connecting it to the site's server functions comes later (not part of task right now).

**Time:** about 10–12 hours of focused work, with three check-in / review points (aka, need to share updates + consult as a team before we move on). Expected 1-2 weeks of work. 

The work is in these files, done in order:

| File | What's in it |
|---|---|
| `README.md` (this file) | For Prishaa: why we're doing this, the concepts, what to have ready, and how we use Git |
| `STEP1.md` | Create the VM and install the model (Gate 1), then lock it down (Gate 2) |
| `STEP2.md` | Compare the three models on every part of a card, side by side (Gate 3) |
| `ADMIN.md` | For Sohyeon: what to set up in the console before you start |

There's also `CLAUDE.md`, context for Claude Code when it helps you with this folder (see "Getting help" below).

---

## Welcome

You're setting up a small, self-hosted language model that will power a few optional features in CROW Cards: for example, "describe how your community moderates in your own words, and we'll suggest options from our lists." It will be opt-in, run on infrastructure we control, and use an open-source model.

### Key goals

The project's plan is that what communities write is never sent to an outside company, i.e., our own server talks to our own model. Three properties follow:

1. **Clean and auditable.** Someone reading this repo or the Google Cloud console can tell what we did and why. No undocumented one-off changes.
2. **Secure.** The model's server isn't reachable from the public internet, no credentials live in the repo, and the firewall is tight.
3. **Cost-efficient.** The VM runs only while it's being used. Stopped, it costs about $9 a month (its disk); running, it costs by the hour (see "What it costs").

Keep those three in mind throughout.

### A note on working style

Infrastructure work is different from front-end prototyping. In the front end you can iterate fast: change a button style, see if it looks right, keep going. Infrastructure doesn't give that feedback: a misconfigured firewall can look fine for weeks.

As you work, please adopt the follow practices:

- **If you're unsure, don't click or type yet.** If a step is unclear, pause and work out what it does. Guessing at infrastructure can cost real money or expose data.
- **Commit often, and say why.** A commit message should explain *why*, not just *what*; future readers (including you) will thank you.
- **When you reuse a value, give it a name.** If you're typing `cos-princeton-hci-crow` for the fifth time, set it once as an environment variable. This just helps keep our code clean.
- **Keep secrets out of AI tools.** Claude, ChatGPT and Copilot are fine for consulting on logic and structure. But, treat them like a public forum: never paste credentials, keys, service account files or real community descriptions into them.

### Review points

You'll stop at three points for review (a "gate"). Each exists because the next part is harder to undo than the one before and it also helps us get on the same page as a team. 

- **Gate 1** (end of STEP1.md, part A): the VM is created and the model runs, still reachable only through Google's secure tunnel. Send Sohyeon screenshots; wait for a thumbs-up.
- **Gate 2** (end of STEP1.md, part B): you've checked and documented that it's locked down: no public address, SSH through Google's tunnel the only way in, the model server answering only on the VM itself. Ask in `#crow-cards` for a team review.
- **Gate 3** (end of STEP2.md): the comparison has run and you've written up what you saw. The team reads the review files together, before anyone decides anything about using a model with real users.

**Work in order, and don't skip a gate. Read through the entire instructions first to get an overview and understand the concepts/plan before you get started.**

---

## Concepts

This document has been drafted as a general intro for any potential new student onboarding, who we assume has some basic coding knowledge but might not know a ton about computer system design. 

You don't need to understand every term deeply, but you should recognize them. Come back to this section as a glossary.

### Google Cloud (GCP)

Google's cloud computing service. CROW Cards runs on it: Firebase Hosting (the website), Firestore (the cards), Cloud Functions (the server's logic), and now a Compute Engine VM (the language model).

**Project:** the top-level container. Everything we create lives in one project, `cos-princeton-hci-crow` (shown in the console as "CROW Cards"). Billing, permissions and resources are scoped to it.

**Region and zone:** Google's data centers are grouped by region (e.g. `us-central1`, in Iowa) and zone (one data center in a region, e.g. `us-central1-a`). You'll use `us-central1-a`, in the same region as our Cloud Functions. See [Geography and regions](https://cloud.google.com/docs/geography-and-regions).

### VM (virtual machine)

A rented computer in Google's data center. You connect to it over SSH as if it were any Linux machine. Ours will have a GPU attached, because language models need one to run at a reasonable speed.

### GPU

Hardware that does many math operations in parallel. Language models are mostly huge matrix multiplications, which GPUs do far faster than CPUs. We're using an **NVIDIA L4**, a mid-range GPU with 24 GB of memory (where the model lives while it runs). On Google Cloud, an L4 comes with the **G2** machine types: choosing `g2-standard-4` attaches one L4 automatically.

**The driver:** the GPU needs NVIDIA's driver installed on the VM. You'll install it with a script Google provides (STEP1.md).

### The model, the model server, and the stack

- **The model** is a file of weights (numbers) encoding what the model learned. Ours is a few GB once quantized (compressed). On its own it does nothing.
- **The model server** loads the model into GPU memory and offers an HTTP API. We're using **Ollama**: simple, and well suited to small deployments. Send it a prompt, it returns the model's answer.
- **No reverse proxy** (something in front of the model server handling HTTPS and logins) for now: at our scale the firewall is the control.

Later, the whole path/flow will be: `Cloud Function → HTTP request → Ollama → the model → answer`.

**Which models:** you'll compare three, all with open licenses: **Qwen 2.5 7B Instruct** (Alibaba, Apache 2.0), **OLMo 3 7B Instruct** (Ai2, Apache 2.0, and fully open: its training data and code are published too) and **Phi-3.5 mini** (Microsoft, MIT, smaller and faster). The comparison in STEP2.md is the first look at how they do. (Qwen 2.5's 3B size has a research-only license, and OLMo 2's context is too short for prompts with our full lists, so we don't use them.)

### VPC (virtual private cloud)

A private network inside the project. VMs in it talk to each other on internal addresses (like `10.128.0.2`) that the public internet can't reach.

**Internal and external IP:** every VM gets an internal IP; an external IP (reachable from the internet) is optional. Ours never has one, so nothing on the internet can reach it.

**Cloud NAT:** lets a VM with no external IP reach *out* to the internet (to download the driver, Ollama, the models and Ubuntu's security updates), while nothing can reach *in*. It's what a home router does for your laptop. Sohyeon sets it up for the region; the VM needs no settings for it.

### Firewall rule

"Allow traffic on port X, from sources Y, to VMs Z." Anything no rule allows is blocked. The project's network comes with some default rules: STEP1.md checks them.

### IAP (Identity-Aware Proxy) tunnel

Google's way to reach a VM that has no external IP. You sign in with your Google account; Google checks you're allowed, then carries your connection to the VM. Its traffic arrives from the range `35.235.240.0/20`, which our firewall rule allows for SSH (port 22) only. The console's **SSH** button and `gcloud compute ssh` both use it automatically, since our VM has no external IP.

### SSH

How you log into a remote Linux machine. Everything you type runs on the VM. In this work you can use the console's **SSH** button (a terminal in your browser) or `gcloud compute ssh` from your own terminal. See [Connecting to VMs](https://cloud.google.com/compute/docs/instances/ssh).

**OS Login:** our VM uses Google's OS Login: each SSH login is checked against your Google account and roles when you connect, instead of SSH keys stored in the project. When your roles are removed, your access ends with them.

**Carrying a port over SSH:** `gcloud compute ssh crow-llm-vm -- -N -L 11435:localhost:11434` makes port 11435 on your computer lead to port 11434 (Ollama's) on the VM's own `localhost`, inside the SSH connection. That's how you'll reach Ollama, which never listens on the network.

### systemd

The Linux program that starts and manages background services. Ollama runs as a systemd service, so it starts when the VM boots and restarts if it crashes. See [Understanding systemd units](https://www.digitalocean.com/community/tutorials/understanding-systemd-units-and-unit-files).

### gcloud CLI

Google Cloud's command-line tool. You'll create things in the web console, which is easier to follow; you use `gcloud` for SSH from your own terminal, mainly to carry the model server's port to your laptop for the comparison (STEP1.md B.4, STEP2.md), and for a few checks.

### Alternatives we considered

- **vLLM instead of Ollama:** faster and more flexible, but more setup than our scale needs. Switch later if we outgrow Ollama.
- **Cloud Run with a GPU:** Google scales it for us, with less control over the machine. We chose a VM we manage ourselves, for transparency.
- **An always-on VM:** simpler, but hundreds of dollars a month. Not justified at our volume.
- **Spot (preemptible) GPUs:** much cheaper, but can be stopped at any time with 30 seconds' notice. Too disruptive for an interactive feature.
- **A public endpoint with an API key:** simpler networking, weaker security.
- **Llama 3.2 or Qwen 2.5 3B:** their licenses (Meta's, the Qwen Research License) aren't OSI-approved open-source licenses, which doesn't fit the project.

---

## Before you start

### Access (Sohyeon sets these up)

Sohyeon will configure your role in GCP. **Student B needs no Google Cloud access** (only GitHub, Slack and the workbench on staging); the Google Cloud roles below are Student A's.

- **Google Cloud,** in `cos-princeton-hci-crow`: **Compute Instance Admin (v1)** (create, start, stop and SSH into VMs), **IAP-secured Tunnel User** (reach the VM through the tunnel), **Compute OS Admin Login** (log into the VM with your Google account, with `sudo`) and **Compute Network Viewer** (see the firewall rules, to check them). If a console page says you don't have permission, ask Sohyeon rather than working around it.
- **GitHub:** write access to `crowcards/crowweb`, to push a branch and open a pull request.
- **Slack:** `#crow-cards` for asking any questions + sharing updates.

### What Sohyeon sets up before you create anything

STEP1.md starts by confirming these are done (the clicks for each are in `ADMIN.md`):

1. **The APIs and your roles:** Compute Engine and IAP turned on, and your roles (above).
2. **The budget alert** raised to cover the VM (e.g. $50/month). An alert only warns: it never stops spending.
3. **GPU quota:** the project allows at least one L4 GPU in `us-central1` (new projects often start at zero; requesting more takes a day or two).
4. **Princeton's organization policies:** nothing blocks GPU VMs or the region.
5. **The firewall:** a rule `allow-iap-llm` (ingress, from `35.235.240.0/20`, TCP 22 only, to VMs tagged `llm-vm`); and the default network's `default-allow-ssh` and `default-allow-rdp` rules, which allow SSH and remote desktop from anywhere, deleted (or narrowed to `35.235.240.0/20`).
6. **Cloud NAT:** a gateway `llm-nat` in `us-central1`, so the VM can download without a public address.
7. **The nightly stop:** the Compute Engine service agent is allowed to stop VMs, so an instance schedule can stop ours every night (STEP1.md attaches it).

### Tools on your computer

You need **Git**, the **gcloud CLI** (Student A only), **Python 3.10 or newer** (for the comparison in STEP2.md) and a text editor that handles Markdown (VS Code is fine). Every command in these files runs in a terminal: **Terminal** on a Mac (Applications → Utilities), or **WSL** on Windows.

#### On a Mac

1. **Git, and the command-line basics:** in Terminal, `xcode-select --install` and follow the window that opens (if it says they're already installed, you're set). Check: `git --version`.
2. **Homebrew** (an installer for command-line tools; skip if `brew --version` already works): follow the one command at [brew.sh](https://brew.sh), then the "Next steps" it prints (two lines that add `brew` to your path).
3. **Python:** the Mac's own `python3` may be older than 3.10. Check with `python3 --version`; if it's below 3.10, `brew install python`, open a new Terminal window, and check again.
4. **gcloud:** `brew install --cask gcloud-cli` (if Homebrew can't find it, `brew search gcloud` shows its current name). Or use Google's installer: on [Install the gcloud CLI](https://cloud.google.com/sdk/docs/install), the macOS package for your chip (Apple menu → About This Mac: "Apple M…" means ARM, "Intel" means x86_64), unpack it, run `./google-cloud-sdk/install.sh`, and open a new Terminal window. Check: `gcloud --version`.

#### On Windows

1. **WSL** ([Microsoft's instructions](https://learn.microsoft.com/en-us/windows/wsl/install)), with Ubuntu; use its terminal for everything below.
2. **Git and Python:** `sudo apt update && sudo apt install -y git python3`. Check: `git --version`, `python3 --version` (3.10 or newer).
3. **gcloud:** the Debian/Ubuntu instructions on [Install the gcloud CLI](https://cloud.google.com/sdk/docs/install).

#### Then, on either

Sign in and set the defaults (a browser window opens to sign in with your Princeton Google account):

```bash
gcloud auth login
gcloud config set project cos-princeton-hci-crow
gcloud config set compute/zone us-central1-a
```

### What it costs

- **Running:** the VM's hourly price. The console's create page shows an estimate for running it all month: note it in the setup log, and divide by 730 for the hourly cost.
- **Stopped:** no charge for the machine or GPU, but the 50 GB SSD disk costs about $9 a month either way (plus possibly a few dollars for Cloud NAT's address; Sohyeon checks the first month's bill).
- **Left running all month by mistake:** hundreds of dollars. The nightly stop (STEP1.md) limits a mistake to one day; still, **stop the VM whenever you finish working.**

**Check costs weekly** (set yourself a reminder): Billing → Reports in the console, filtered by the label `purpose: llm`, if you have access to billing; otherwise ask Sohyeon. Running it a few hours a week, expect roughly $10–20 a month. More than $40 in a month means something is running that shouldn't be: tell Sohyeon.

---

## How we use Git

If you've used Git before, skim this. If not, read it carefully: Git is how your work gets reviewed. GitHub's [Git guides](https://docs.github.com/en/get-started/quickstart/git-and-github-learning-resources) are a good start.

### The flow

The repo has two long-lived branches: `beta` (the test site, staging.crowcards.org) and `main` (the live site, crowcards.org). Work goes into `beta` by pull request; only Sohyeon merges `beta` into `main`.

Clone over SSH: GitHub doesn't accept passwords for `git push`. If you haven't added an SSH key to your GitHub account, follow GitHub's [Generating a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent) first (macOS has a section of its own).

```bash
git clone git@github.com:crowcards/crowweb.git
cd crowweb
git checkout beta
git pull
git checkout -b llm-setup          # your branch, made from beta
```

Then, as you work:

1. Commit progress: `git add <files>`, then `git commit -m "why you made the change"`.
2. Push: `git push -u origin llm-setup` the first time, then `git push`.
3. Open a pull request with **base `beta`** (not `main`).
4. The team reviews; you answer comments with more commits, until it's approved and merged into `beta`.

### Commit early, push at each gate

Open the pull request early (after Gate 1) as a **draft**, and push as you go: the team can see where you are and catch problems early. Each gate is one or more commits.

### Good commit messages

Bad: `fix stuff`, `updates`, `wip`.

Good:
- `Log the LLM VM's setup: g2-standard-4, L4, Ubuntu 24.04`
- `Check the LLM VM is locked down: no external IP, SSH only through IAP`
- `Add the test communities' open-text answers for the model comparison`

Rule of thumb: someone skimming the log should understand what changed and why without opening the diff.

### What never goes in the repo

The repo is **public**: everything in it is readable by anyone, forever (even after you delete it, it stays in the history).

- No credentials, keys, tokens or service account files.
- No IP addresses of the VM, internal or external (write "see the console" instead).
- No real community descriptions: the test communities and their written answers are made up. (Public rules pages are the one exception: copied with their address and date, STEP2.md 2.4.)
- No raw model output (`llm/eval/results/` is ignored by Git for this; the review files are committed).

This folder is also left out of the website (`firebase.json`'s ignore lists), so nothing in it is ever published on crowcards.org.

### If Git gets confusing

Don't force-push, and don't delete branches you're unsure about. If something feels wrong (a merge conflict, a confusing state), stop and ask in `#crow-cards`: a Git mess is much easier to fix before it grows.

### Opening the pull request

After your first commit (Gate 1):

1. Go to github.com/crowcards/crowweb; GitHub offers to open a pull request from `llm-setup`. Click it.
2. Set **base** to `beta`.
3. Title: `LLM infrastructure setup (in progress)`. Description: a short summary of what you're doing, a pointer to this folder, and that it's gated and in progress.
4. Choose **Create draft pull request**, and request Sohyeon as reviewer.

Keep it open through all three gates.

---

## Getting help

**Stuck for more than 20 minutes?**

1. **Try Claude Code first.** Run `claude` in your copy of the repo; when it works in this folder it also reads `llm/CLAUDE.md`, written for this work. Tell it:
   - what you were trying to do;
   - what you ran or clicked;
   - what happened (the error text or output);
   - what you've already tried, and what you think is wrong.
2. **Still stuck after another 20 minutes?** Post in `#crow-cards` with the same four things.

**Never paste into AI tools** (or Slack): keys or service account files, SSH private keys, real community descriptions, or the VM's IP addresses.

**When in doubt about whether something is OK to share, just ping Sohyeon in `#crow-cards`.**

---

## What comes after (not your task)

Once your three gates are done, we will work on:

1. **Connect the site's server to the model:** a Cloud Function calling Ollama on the VM's internal address, most likely through **Direct VPC egress** (Google's current recommendation, instead of a paid "VPC connector"), with Ollama then set to listen on the VM's internal address (`OLLAMA_HOST`) and a firewall rule allowing port 11434 from that subnet only. The function needs limits like the site's others (per address per hour, and a daily ceiling): each call uses GPU time and keeps the VM awake. It also sends the same `num_ctx` the evaluation uses.
2. **Start the VM on demand, and stop it after an hour idle.** The first request after a quiet spell waits for the VM to start and the model to load (likely most of a minute), so the features should suit that (e.g. a "Suggest" button, not suggestions as you type), and in workshops someone starts the VM beforehand.
3. **The opt-in in the editor:** a choice per card to use the model's suggestions.
4. **The privacy page:** what the model does and doesn't do with what people write, before anything reaches users.
5. **When staging gets its own project:** the VM stays in this (the live) project, so staging's functions would reach it across projects, or staging gets its own small VM.

Thanks for working carefully through the gates: you're building the foundation.
