# 🧞 GENIE: Landing Page & Command Center

Welcome to the **GENIE** website repository! 

This repository contains the interactive, cinematic landing page for GENIE (AI Maintainability System) and serves as the central hub for learning about the project.

---

## 📖 Table of Contents
- [What is GENIE?](#what-is-genie)
- [Website Installation (Running Locally)](#website-installation-running-locally)
- [GENIE System Prerequisites](#genie-system-prerequisites)
- [GENIE System Installation](#genie-system-installation)
- [How to Use GENIE on Your PC](#how-to-use-genie-on-your-pc)
- [Advanced Commands & The Ritual](#advanced-commands--the-ritual)

---

## 🤔 What is GENIE?
**"Software is a Wish — GENIE is the Command."**

GENIE is your ultimate AI-powered command center designed to help you build software fast while ensuring it remains maintainable, clean, and bug-free. It provides an autonomous repair layer, deep code analysis, and powerful scanning tools to keep your codebase in top shape.

---

## 🌐 Website Installation (Running Locally)
If you just want to run this cinematic landing page on your machine, it's very simple. No build tools are required!

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sm5963397-sjm/website-genie-.git
   cd website-genie-
   ```

2. **Open the Website:**
   Simply open `index.html` in any modern web browser.
   - *Optionally*, you can serve it using a local server (like VS Code Live Server or Python):
     ```bash
     python -m http.server 8000
     ```
     Then visit `http://localhost:8000` in your browser.

---

## ⚙️ GENIE System Prerequisites
To install the actual GENIE CLI and AI Repair tools on your machine, ensure you have the following installed:
1. **Node.js** (v18 or higher recommended) - [Download here](https://nodejs.org/)
2. **Git** - [Download here](https://git-scm.com/)
3. **API Key** - An API key from OpenAI, Anthropic, Gemini, or OpenRouter (Bring Your Own Key).

---

## 🚀 GENIE System Installation

The easiest way to install and configure GENIE globally on your system is using the setup wizard:

1. **Open your terminal.**
2. **Run the Initialization Command:**
   ```bash
   npx genie-setup init
   ```
3. **Follow the Setup Wizard:**
   Choose your preferred AI provider, securely enter your API key, and configure your `.genie.config.json` preferences.

*(If you are building GENIE from source, you can clone the main GENIE repository, run `npm install`, `npm run build`, and `npm link` in the CLI package).*

---

## 💻 How to Use GENIE on Your PC

GENIE is built to be extremely user-friendly. You can operate it via the **Interactive Command Center** or via **Direct Commands**.

### 1. Interactive Command Center
The easiest way to use GENIE is through the interactive menu. Simply open your terminal in any project folder and type:
```bash
genie
```
This will launch the **GENIE Command Center**, presenting you with a simple menu to choose your action:
- 🖥️ Start Desktop Widget
- 🌉 Start Extension Bridge
- 🌐 Setup Browser Extension
- 🔍 Scan Project for Issues
- 🔧 Run Autonomous Repair
- 💊 Manage Wish Capsules
- ⚙️ Setup BYOK & Provider

Use your arrow keys to select an option and hit **Enter**.

### 2. Using the Desktop Widget
If you prefer a visual interface, you can launch the floating desktop app:
```bash
genie start --desktop
```
This provides a persistent, native widget on your PC to quickly interact with your codebase's AI assistant.

---

## 🔮 Advanced Commands & "The Ritual"

For advanced users, you can run GENIE operations directly via the CLI. We call this **The Ritual**:

### Step 1: Deep Code Analysis
Navigate to your project root and run a full AST traversal to identify dead functions, circular dependencies, and calculate entropy scores.
```bash
genie scan ./src
```

### Step 2: Autonomous Repair
Let AI agents orchestrate targeted repair strategies. Multiple models will propose solutions, and GENIE will pick the best patch.
```bash
genie repair --plan
```

### Step 3: Apply Fixes
Review the generated diffs and approve changes individually or in batch. GENIE integrates with Git so nothing is committed blindly.
```bash
genie apply --approve
```

### Step 4: Validate and Document
Validate your patches with automated testing, then regenerate your living documentation (markdown, JSDoc, diagrams). The codebase's entropy score is automatically recalculated!
```bash
genie test
genie docs --format md
```

---

## 💡 Pro Tips for Everyday Use
- **Scan Before You Commit:** Run `genie scan` on your folder before pushing code to catch potential maintainability issues early.
- **Track Entropy:** Use `genie entropy` to track the health of your codebase over time and get alerts when technical debt rises.
- **Lost? Just type `genie`:** Whenever you aren't sure what to do, just type `genie` in your terminal to bring up the interactive helper menu.

---

### Built by **Team Void Architects** 
*Avish Uparikar · Dipak Dhurve · Sagar Mankar · Saurabh Meshram · Sanket Borkar*

*(Built at Breakout Kit Hackathon · 2025)*
