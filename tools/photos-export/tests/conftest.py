import sys
from pathlib import Path

# The script is a single file, not a package: make it importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
