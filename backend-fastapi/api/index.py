import sys
from pathlib import Path

# Ensure backend-fastapi root is importable when running on Vercel.
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.main import app  # noqa: E402
