#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Token Ring - One-Click Installer
Supports Windows, macOS, and Linux.

Usage:
    python install.py                  # Auto-detect Antigravity path and install
    python install.py --asar <path>    # Specify custom app.asar path
    python install.py --uninstall      # Uninstall patch and restore backup
"""

import os
import sys
import shutil
import platform
import argparse
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR / "src"

def get_default_asar_path():
    system = platform.system()
    home = Path.home()

    if system == "Windows":
        return home / "AppData" / "Local" / "Programs" / "Antigravity" / "resources" / "app.asar"
    elif system == "Darwin":  # macOS
        return Path("/Applications/Antigravity.app/Contents/Resources/app.asar")
    else:  # Linux
        # Common locations on Linux
        candidates = [
            Path("/opt/Antigravity/resources/app.asar"),
            home / ".local" / "share" / "antigravity" / "resources" / "app.asar",
            home / "Applications" / "Antigravity" / "resources" / "app.asar"
        ]
        for c in candidates:
            if c.exists():
                return c
        return candidates[0]

def check_dependencies():
    for cmd in ["node", "npx"]:
        if shutil.which(cmd) is None:
            print(f"[-] Error: '{cmd}' not found in PATH. Please install Node.js (>= 18) first.")
            sys.exit(1)

def install(asar_path: Path):
    if not asar_path.exists():
        print(f"[-] Error: Target app.asar not found at: {asar_path}")
        print("    Please provide the path manually using: python install.py --asar <path>")
        sys.exit(1)

    bak_path = asar_path.with_name("app.asar.token_ring_backup")
    ipc_src_file = SRC_DIR / "ipc-handler.js"
    ring_src_file = SRC_DIR / "ring-widget.js"

    if not ipc_src_file.exists() or not ring_src_file.exists():
        print(f"[-] Error: Missing source files in {SRC_DIR}")
        sys.exit(1)

    with open(ipc_src_file, "r", encoding="utf-8") as f:
        ipc_code = f.read()

    with open(ring_src_file, "r", encoding="utf-8") as f:
        ring_code = f.read()

    print(f"[*] Target app.asar: {asar_path}")
    print("[1/5] Creating safe backup...")
    if not bak_path.exists():
        shutil.copy2(asar_path, bak_path)
        print(f"      Backup saved to: {bak_path}")
    else:
        print(f"      Backup already exists: {bak_path}")

    temp_dir = Path(os.environ.get("TEMP", "/tmp")) / "agy_token_ring_patch"
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    print("[2/5] Extracting asar archive via npx...")
    source_to_extract = bak_path if bak_path.exists() else asar_path
    cmd_extract = f'npx --yes asar extract "{source_to_extract}" "{temp_dir}"'
    subprocess.run(cmd_extract, shell=True, check=True)

    # 1. Patch ipcHandlers.js (Main Process)
    print("[3/5] Injecting IPC handler (dist/ipcHandlers.js)...")
    ipc_file = temp_dir / "dist" / "ipcHandlers.js"
    if not ipc_file.exists():
        print("[-] Error: dist/ipcHandlers.js not found in asar archive.")
        sys.exit(1)

    with open(ipc_file, "r", encoding="utf-8") as f:
        ipc_content = f.read()

    # Append to registerIpcHandlers function before closing brace
    last_brace_idx = ipc_content.rfind("}")
    if "antigravity:get-token-stats" not in ipc_content and last_brace_idx != -1:
        ipc_content = ipc_content[:last_brace_idx] + "\n" + ipc_code + "\n" + ipc_content[last_brace_idx:]
        with open(ipc_file, "w", encoding="utf-8") as f:
            f.write(ipc_content)
        print("      Main IPC service successfully injected.")
    else:
        print("      Main IPC service already present or skip injection.")

    # 2. Patch preload.js (Renderer Process)
    print("[4/5] Injecting UI Ring widget (dist/preload.js)...")
    preload_file = temp_dir / "dist" / "preload.js"
    if not preload_file.exists():
        print("[-] Error: dist/preload.js not found in asar archive.")
        sys.exit(1)

    with open(preload_file, "r", encoding="utf-8") as f:
        preload_content = f.read()

    start_tag = "/* --- ANTIGRAVITY TOKEN MONITOR RING START --- */"
    end_tag = "/* --- ANTIGRAVITY TOKEN MONITOR RING END --- */"

    inject_wrapped = f"{start_tag}\n{ring_code.strip()}\n{end_tag}\n"

    if start_tag in preload_content:
        s_idx = preload_content.find(start_tag)
        e_idx = preload_content.find(end_tag) + len(end_tag)
        preload_content = preload_content[:s_idx] + inject_wrapped + preload_content[e_idx:]
    else:
        preload_content = preload_content + "\n\n" + inject_wrapped

    with open(preload_file, "w", encoding="utf-8") as f:
        f.write(preload_content)
    print("      UI Ring widget successfully injected.")

    # 3. Repack asar
    print("[5/5] Repacking and updating app.asar...")
    cmd_pack = f'npx --yes asar pack "{temp_dir}" "{asar_path}"'
    subprocess.run(cmd_pack, shell=True, check=True)

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    print("\n" + "=" * 60)
    print(" [+] Antigravity Token Ring installed successfully!")
    print(" [!] Please restart Antigravity 2.0 to see the new widget.")
    print("=" * 60)

def uninstall(asar_path: Path):
    bak_path = asar_path.with_name("app.asar.token_ring_backup")
    if not bak_path.exists():
        print(f"[-] Error: Backup not found at: {bak_path}")
        return

    print(f"[*] Restoring original asar from {bak_path} ...")
    shutil.copy2(bak_path, asar_path)
    print(" [+] Successfully uninstalled! Please restart Antigravity.")

def main():
    parser = argparse.ArgumentParser(description="Antigravity Token Ring Installer")
    parser.add_argument("--asar", type=str, default=None, help="Custom path to app.asar")
    parser.add_argument("--uninstall", action="store_true", help="Restore backup and uninstall patch")
    args = parser.parse_args()

    check_dependencies()

    asar_path = Path(args.asar).resolve() if args.asar else get_default_asar_path()

    if args.uninstall:
        uninstall(asar_path)
    else:
        install(asar_path)

if __name__ == "__main__":
    main()
