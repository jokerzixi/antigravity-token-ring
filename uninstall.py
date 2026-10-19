#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Token Ring - One-Click Uninstaller
Restores original app.asar from backup.
"""

import sys
from install import get_default_asar_path, uninstall
from pathlib import Path

if __name__ == "__main__":
    asar_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else get_default_asar_path()
    uninstall(asar_path)
