# Enable Chrome AI ✨

Researched and scripted by [lcandy2](https://twitter.com/vanillaCitron).

[![Twitter](https://img.shields.io/twitter/follow/vanillaCitron)](https://twitter.com/vanillaCitron)

English | [中文](README.zh.md)

Enable Gemini in Chrome, AI Powered History search, and DevTools AI Innovations in Google Chrome—without cleaning data or reinstalling.

<img width="512" alt="Google Chrome Gemini in Chrome" src="https://github.com/user-attachments/assets/a88c56a7-f20b-432a-926c-0184194225b4" />

Tiny Bun + TypeScript helper that enables Chrome's built-in AI features by patching your local profile data (`variations_country`, `variations_permanent_consistency_country`, and `is_glic_eligible`)—no browser flags required.

## ✅ Requirements
- [Bun](https://bun.sh/) `1.1+`
- Google Chrome installed (Stable/Canary/Dev/Beta)

## ⚡️ Quick Start
1. Install Bun (once): [bun.sh/docs/installation](https://bun.sh/docs/installation)
2. Install dependencies: `bun install`
3. Run the script: `bun run start`
4. Chrome will close while patching; after it restarts, press Enter to finish.

## 📦 Download Executable (No Dev Setup)
- Open [GitHub Releases](https://github.com/lcandy2/enable-chrome-ai/releases).
- Download the file that matches your OS (`linux`, `darwin`, or `windows`).
- On macOS/Linux, run `chmod +x <file>` once, then execute it directly.

## 🔧 What Happens
- Finds Chrome user data for Stable/Canary/Dev/Beta on Windows, macOS, and Linux.
- Kills top-level Chrome processes to avoid file locks, then brings them back.
- Sets all `is_glic_eligible` to `true` in `Local State` (recursive search).
- Sets `variations_country` to `"us"` in `Local State`.
- Sets `variations_permanent_consistency_country` to `["<version>", "us"]` in `Local State`.
- Restarts any Chrome builds that were running before the patch.

## ⚠️ Caveats / Known Limitations
- The script expects `User Data/Local State` to exist; if it's missing, the run can fail (launch Chrome once to generate it).
- Chrome restart only happens if the executable path can be detected from running processes.
- On macOS, process detection is name-based (`Google Chrome*`) and may terminate more than just the "top-level" app process.
- On Linux, process detection expects an executable name of `chrome`; if your build uses a different name, Chrome may not be closed (and files may remain locked).

## 🛟 Notes
- The script writes to your existing Chrome profile; back up `User Data` if you want a safety net.
- Run as the same OS user who owns the Chrome profile to ensure write access.
- Not affiliated with Google—use at your own risk.

## 📜 License
Please credit this project when reposting or creating derivative works.

## 🙏 Acknowledgments
- [show-copilot](https://github.com/hzkaai/show-copilot)
